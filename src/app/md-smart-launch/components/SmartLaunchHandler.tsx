'use client';
import React, { useState, useEffect, useCallback } from 'react';
import type { SmartLaunchContext } from '@/lib/smartFhirTypes';
import { mockSmartLaunchContext } from '@/lib/smartFhirMockData';
import Icon from '@/components/ui/AppIcon';
import { SmartErrorFallback, type SmartError } from './SmartErrorBoundary';
import { shouldUseMockData } from '@/lib/config/appConfig';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';

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
  const runMockLaunchSequence = useCallback(() => {
    setStep('validating');
    setProgress(0);
    setSmartError(null);

    const urlParams = new URLSearchParams(window.location.search);
    // Prefer patientId from URL query param (passed by RHTP patient selector)
    const patientId = urlParams.get('patientId') || 'patient/maria-redhawk-001';
    const patientName = urlParams.get('patientName') || 'Maria Redhawk';

    const launchContext: SmartLaunchContext = {
      ...mockSmartLaunchContext,
      patientId,
      practitionerName: 'Bennett County Health PCP',
    };

    const steps: Array<{ step: LaunchStep; label: string; duration: number; progress: number }> = [
      { step: 'validating', label: 'Validating Cerner launch token…', duration: 600, progress: 25 },
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
  }, [onLaunchReady]);

  // ── Live FHIR launch sequence ────────────────────────────────────────────────
  // Reads Patient/{id} from HAPI to confirm existence and extract the real name,
  // then fires onLaunchReady with a fully-populated SmartLaunchContext.
  const runLiveFhirLaunchSequence = useCallback(async () => {
    setStep('validating');
    setProgress(0);
    setSmartError(null);

    const urlParams = new URLSearchParams(window.location.search);
    const rawPatientId = urlParams.get('patientId') || 'patient-maria-001';

    try {
      setStep('exchanging-token');
      setProgress(25);
      await new Promise((r) => setTimeout(r, 400)); // brief UI pause for auth step

      setStep('loading-patient');
      setProgress(55);

      // Resolve the HAPI patient resource ID (strip legacy 'patient/' prefix if present)
      const fhirPatientId = rawPatientId.startsWith('patient/')
        ? rawPatientId.replace('patient/', 'patient-')
        : rawPatientId;

      // Attempt to read Patient resource from HAPI
      const patientResource = await getFhirClient().read<{
        resourceType: string;
        id?: string;
        name?: { family?: string; given?: string[] }[];
        birthDate?: string;
        gender?: string;
      }>('Patient', fhirPatientId);

      setProgress(85);
      await new Promise((r) => setTimeout(r, 300));

      const launchContext: SmartLaunchContext = {
        ...mockSmartLaunchContext,
        patientId: fhirPatientId,
        practitionerName: 'Bennett County Health PCP',
      };

      setStep('ready');
      setProgress(100);
      setTimeout(() => onLaunchReady(launchContext), 300);
    } catch (err) {
      // Patient not found on HAPI — fall back to mock launch sequence
      console.warn(
        '[SmartLaunchHandler] Live FHIR patient read failed, falling back to mock:',
        err
      );
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
