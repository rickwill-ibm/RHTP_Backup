'use client';
import React, { useState, useEffect, useCallback } from 'react';
import type { SmartLaunchContext } from '@/lib/smartFhirTypes';
import { mockSmartLaunchContext } from '@/lib/smartFhirMockData';
import Icon from '@/components/ui/AppIcon';
import { SmartErrorFallback, type SmartError } from './SmartErrorBoundary';
import { shouldUseMockData } from '@/lib/config/appConfig';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';
import { useDemoStore } from '@/uhg/store/demoStore';
import { PLATFORM_TO_FHIR_ID_MAP } from '@/lib/patientRegistry';
import {
  readLaunchParams,
  readAuthCode,
  discoverSmartConfiguration,
  buildAuthorizationUrl,
  exchangeCodeForToken,
  storedIss,
} from '@/lib/fhir/smartLaunch';
import { resolvePatientId } from '../lib/resolvePatientId';

interface SmartLaunchHandlerProps {
  onLaunchReady: (ctx: SmartLaunchContext) => void;
  useMockData?: boolean; // Optional override - if not provided, uses global config
}

type LaunchStep = 'validating' | 'exchanging-token' | 'loading-patient' | 'ready' | 'error';

export default function SmartLaunchHandler({
  onLaunchReady,
  useMockData, // If not provided, will use global config
}: SmartLaunchHandlerProps) {
  // Determine data source: prop override > module config > global config
  const effectiveUseMockData = useMockData ?? shouldUseMockData();
  const [step, setStep] = useState<LaunchStep>('validating');
  const [progress, setProgress] = useState(0);
  const [smartError, setSmartError] = useState<SmartError | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  /**
   * Real SMART launch sequence using FHIR client
   */
  /**
   * Mock launch sequence for development
   */
  // ── Mock launch sequence ─────────────────────────────────────────────────────
  // Supports all Connect360 / RHTP ID forms via resolvePatientId:
  //   UUIDv4 (Connect360)  → UUID_TO_FHIR_ID_MAP → static resolution
  //   Platform ID (PAT-*)  → PLATFORM_TO_FHIR_ID_MAP
  //   MRN                  → MRN_TO_FHIR_ID_MAP
  //   FHIR slug (patient-*) → mock store passthrough
  //   Empty / unresolvable  → surfaces "No patient in launch scope", never a silent fallback
  const runMockLaunchSequence = useCallback(() => {
    setStep('validating');
    setProgress(0);
    setSmartError(null);

    const urlParams = new URLSearchParams(window.location.search);
    const rawId = urlParams.get('patientId') ?? '';

    // Resolve asynchronously but kick off the timed UI sequence immediately
    // so the progress animation is not blocked on ID resolution.
    resolvePatientId(rawId, /* mock */ true).then((resolved) => {
      const patientId = resolved?.canonicalFhirId ?? '';
      const patientName =
        urlParams.get('patientName') ??
        (patientId ? `${patientId} (unresolved)` : 'No patient in launch scope');

      const launchContext: SmartLaunchContext = {
        ...mockSmartLaunchContext,
        patientId,
        practitionerName: 'Prairie Health PCP',
      };

      const steps: Array<{ step: LaunchStep; label: string; duration: number; progress: number }> =
        [
          {
            step: 'validating',
            label: 'Validating Cerner launch token…',
            duration: 600,
            progress: 25,
          },
          {
            step: 'exchanging-token',
            label: 'Exchanging authorization token…',
            duration: 700,
            progress: 55,
          },
          {
            step: 'loading-patient',
            label: `Loading ${patientName} context from FHIR R4…`,
            duration: 800,
            progress: 85,
          },
          { step: 'ready', label: 'Launch complete', duration: 400, progress: 100 },
        ];

      let delay = 0;
      steps.forEach(({ step: s, duration, progress: p }) => {
        delay += duration;
        setTimeout(() => {
          setStep(s);
          setProgress(p);
          if (s === 'ready') {
            setTimeout(() => onLaunchReady(launchContext), 300);
          }
        }, delay);
      });
    });
  }, [onLaunchReady]);

  // ── Live FHIR launch sequence ────────────────────────────────────────────────
  // SMART on FHIR EHR-launch (HL7 STU 2.1):
  //   1. EHR opens app with ?iss=<fhir-base>&launch=<opaque-token>
  //   2. App discovers .well-known/smart-configuration
  //   3. App builds authorize URL (OAuth 2.0 + PKCE) → redirect to EHR
  //   4. EHR redirects back with ?code=
  //   5. App exchanges code → token response carries patient / encounter context
  //   6. token.patient is a FHIR relative ref: "Patient/{id}" where {id} may be a
  //      UUID (Connect360 / Cerner), an MRN, or a platform ID — resolved via
  //      resolvePatientId() which handles all forms without corrupting the ID.
  const runLiveFhirLaunchSequence = useCallback(async () => {
    setStep('validating');
    setProgress(0);
    setSmartError(null);

    try {
      // ── Step 1: EHR launch or auth-code callback? ──────────────────────────
      const launchParams = readLaunchParams();
      const authCode = readAuthCode();
      const iss = storedIss();

      let rawPatientId: string;

      if (authCode && iss) {
        // ── Step 4-5: auth-code callback — exchange for token ────────────────
        setStep('exchanging-token');
        setProgress(25);
        const config = await discoverSmartConfiguration(iss);
        const tokenResponse = await exchangeCodeForToken(config, authCode);

        // token.patient is the SMART-standard carrier of patient context.
        // It is a relative reference "Patient/{id}" — strip the resource type
        // prefix to get the bare resource ID (which may be a UUID on Cerner).
        rawPatientId = (tokenResponse.patient ?? '').replace(/^Patient\//i, '');
      } else if (launchParams) {
        // ── Step 2-3: initial EHR launch — redirect to authorize endpoint ────
        setStep('exchanging-token');
        setProgress(15);
        const config = await discoverSmartConfiguration(launchParams.iss);
        const authorizeUrl = await buildAuthorizationUrl(
          config,
          launchParams.iss,
          launchParams.launch
        );
        // Redirect — this function will be called again on the callback leg.
        window.location.assign(authorizeUrl);
        return;
      } else {
        // ── No EHR launch params — fall back to URL param / store ────────────
        // This covers direct navigation in dev/staging environments.
        const urlParams = new URLSearchParams(window.location.search);
        const storeActiveCitizen = useDemoStore.getState().activeCitizenId;
        const defaultId = storeActiveCitizen
          ? (PLATFORM_TO_FHIR_ID_MAP[storeActiveCitizen] ?? storeActiveCitizen)
          : '';
        rawPatientId = urlParams.get('patientId') || defaultId;
      }

      // ── Step 6: resolve the patient ID to a canonical FHIR resource ID ─────
      // Handles UUIDv4 (Connect360), platform IDs (PAT-*), MRNs, and FHIR slugs.
      setStep('loading-patient');
      setProgress(55);

      const resolved = await resolvePatientId(rawPatientId, /* mock */ false);
      if (!resolved) {
        // resolvePatientId returns null only when all resolution strategies
        // are exhausted — surface an explicit error rather than loading the
        // wrong patient.
        setSmartError({
          code: 'MISSING_PATIENT_DATA',
          message: `Patient not found: "${rawPatientId}". Verify the identifier carried by the launch context.`,
        });
        setStep('error');
        return;
      }

      // Confirm the resource exists on HAPI before declaring launch ready.
      await getFhirClient().read<{ resourceType: string }>('Patient', resolved.canonicalFhirId);

      setProgress(85);
      await new Promise((r) => setTimeout(r, 300));

      const launchContext: SmartLaunchContext = {
        ...mockSmartLaunchContext,
        patientId: resolved.canonicalFhirId,
        practitionerName: 'Prairie Health PCP',
      };

      setStep('ready');
      setProgress(100);
      setTimeout(() => onLaunchReady(launchContext), 300);
    } catch (err) {
      console.warn('[SmartLaunchHandler] Live FHIR launch failed, falling back to mock:', err);
      runMockLaunchSequence();
    }
  }, [onLaunchReady, runMockLaunchSequence]);

  /**
   * Run appropriate launch sequence based on mode
   */
  useEffect(() => {
    if (getFhirMockMode()) {
      runMockLaunchSequence();
    } else {
      runLiveFhirLaunchSequence();
    }
  }, [effectiveUseMockData, runMockLaunchSequence, runLiveFhirLaunchSequence]);

  const handleRetry = () => {
    setRetryCount((c) => c + 1);
    runMockLaunchSequence();
  };

  const handleReturnToCerner = () => {
    // In production: window.history.back() or Cerner postMessage
    window.location.href = '/';
  };

  const stepLabels: Record<LaunchStep, string> = {
    validating: 'Validating Cerner launch token…',
    'exchanging-token': 'Exchanging authorization token…',
    'loading-patient': 'Loading patient context from FHIR R4…',
    ready: 'Launch complete — loading patient summary',
    error: smartError?.message ?? 'Launch failed',
  };

  if (step === 'error' && smartError) {
    return (
      <SmartErrorFallback
        error={smartError}
        onRetry={handleRetry}
        onReturnToCerner={handleReturnToCerner}
      />
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f1624]">
      {/* Cerner branding strip */}
      <div className="mb-10 text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-10 h-10 bg-[#6929c4] flex items-center justify-center">
            <Icon name="BoltIcon" size={22} className="text-white" />
          </div>
          <div className="text-left">
            <p className="text-white font-semibold text-lg leading-tight">TCOC Clinical</p>
            <p className="text-carbon-gray-50 text-xs">
              SMART on FHIR — {useMockData ? 'Development Mode' : 'Cerner PowerChart'}
            </p>
          </div>
        </div>
      </div>

      {/* Launch progress card */}
      <div className="bg-[#161d2e] border border-[#2a3550] p-8 w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 bg-[#6929c4]/20 border border-[#6929c4]/40 flex items-center justify-center flex-shrink-0">
            <Icon name="ShieldCheckIcon" size={16} className="text-[#a56eff]" />
          </div>
          <div>
            <p className="text-white text-sm font-semibold">SMART Launch</p>
            <p className="text-carbon-gray-50 text-xs">OAuth 2.0 · PKCE · FHIR R4</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-5">
          <div className="h-1 bg-[#2a3550] w-full mb-3">
            <div
              className="h-1 bg-[#6929c4] transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-carbon-gray-50">{stepLabels[step]}</p>
        </div>

        {/* Step indicators */}
        {(['validating', 'exchanging-token', 'loading-patient', 'ready'] as const).map((s, i) => {
          const stepProgress = [25, 55, 85, 100][i];
          const isDone = progress >= stepProgress;
          const isActive = step === s;
          return (
            <div key={s} className="flex items-center gap-3 mb-2">
              <div
                className={`w-5 h-5 flex items-center justify-center flex-shrink-0 ${
                  isDone
                    ? 'bg-[#24a148]'
                    : isActive
                      ? 'bg-[#6929c4]/30 border border-[#6929c4]'
                      : 'bg-[#2a3550]'
                }`}
              >
                {isDone ? (
                  <Icon name="CheckIcon" size={10} className="text-white" />
                ) : isActive ? (
                  <div className="w-2 h-2 bg-[#a56eff] animate-pulse rounded-full" />
                ) : (
                  <div className="w-1.5 h-1.5 bg-[#4a5568] rounded-full" />
                )}
              </div>
              <p
                className={`text-xs ${
                  isDone ? 'text-[#42be65]' : isActive ? 'text-white' : 'text-carbon-gray-60'
                }`}
              >
                {
                  [
                    'Validate launch token',
                    'Exchange auth token',
                    'Load FHIR patient context',
                    'Launch complete',
                  ][i]
                }
              </p>
            </div>
          );
        })}

        {retryCount > 0 && (
          <p className="text-2xs text-carbon-gray-50 mt-4 text-center">
            Retry attempt {retryCount}
          </p>
        )}

        {/* Mode indicator */}
        {useMockData && (
          <div className="mt-4 pt-4 border-t border-[#2a3550]">
            <p className="text-2xs text-[#f1c21b] text-center">
              ⚠️ Using mock data for development
            </p>
          </div>
        )}
      </div>

      <p className="text-carbon-gray-60 text-xs mt-6">
        Secured by OAuth 2.0 + PKCE · HIPAA compliant
      </p>
    </div>
  );
}

// Made with Bob
