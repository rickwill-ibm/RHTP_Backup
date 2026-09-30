'use client';
// patientContext.tsx — Shared patient state for all patients.
// Single source of truth wired to all 11 screens.
// In Live FHIR mode, data is fetched from HAPI FHIR on load and every 30 seconds.

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getFhirClient } from './services/fhirClient';
import { PLATFORM_TO_FHIR_ID_MAP } from './patientRegistry';
import { useAppContext } from './appContext';
import { GapClosureStoreContext } from './patientContext.fhirObs';
import { defaultMariaState, defaultDorothyState } from './patientContext.defaults';
import { DEMO_MEMBER_ID } from './config/demoDefaults';
import * as clock from './clock'; // determinism seam (Cycle 1)
import { buildStateFromRegistry, buildStateFromFhirPatient } from './patientContext.builders';
import type {
  GapClosureEvidence,
  PatientSharedState,
  EpisodeStatus,
  BHRiskLevel,
  GapStatus,
} from './patientContext.types';

// Re-export everything consumers need from the sub-modules
export type {
  EpisodeStatus,
  BHRiskLevel,
  GapStatus,
  GapDomain,
  HedisCompliance,
  GapClosureSource,
  GapClosureStatus,
  GapClosureEvidence,
  GapClosureStoreValue,
  CareGap,
  PathwayStep,
  PatientSharedState,
} from './patientContext.types';
export { GapClosureStoreProvider, useGapClosureStore } from './patientContext.fhirObs';

// ─── Context Shape ────────────────────────────────────────────────────────────

interface PatientContextValue {
  patient: PatientSharedState;
  updateEpisodeStatus: (status: EpisodeStatus) => void;
  updateBHRisk: (risk: BHRiskLevel) => void;
  closeGap: (gapId: string, evidence: string) => void;
  updateGapStatus: (gapId: string, status: GapStatus) => void;
  completePathwayStep: (stepId: string, metric?: string) => void;
  updateCrisisState: (active: boolean) => void;
  updateSocialNeed: (field: keyof PatientSharedState, value: string) => void;
}

const PatientContext = createContext<PatientContextValue | null>(null);

export function PatientContextProvider({
  patientId,
  children,
}: {
  patientId?: string;
  children: React.ReactNode;
}) {
  const { useMockData } = useAppContext();
  const gapStore = useContext(GapClosureStoreContext);

  /**
   * INVARIANT: the ROUTE decides whether a member is in scope, not this provider.
   * `patient-detail` resolves the id against the registry and renders `MemberScopeNotice`
   * before mounting this provider, so an unresolvable id does not reach here.
   *
   * WHY THAT MATTERS: the last line of this function used to be a bare
   * `return defaultMariaState`, so ANY id outside the 5-member registry silently rendered
   * one real member's MRN, DOB, RAF, care gaps and BH risk under the member the operator had
   * navigated to. Six live nav targets did exactly that. The substitution is kept as the
   * golden-demo default — the demo's active member IS Maria — but it is now NAMED and warned,
   * so a future caller that mounts this provider without the route guard is visible in the
   * console instead of silently correct-looking. It is not a second guard; the route is the
   * guard. See gap register G-032.
   */
  const getInitialState = (): PatientSharedState => {
    if (!patientId) return defaultMariaState;
    const registryState = buildStateFromRegistry(patientId);
    if (registryState) return registryState;
    if (patientId === 'PAT-0042' || patientId === 'patient-001') return defaultDorothyState;
    if (patientId === DEMO_MEMBER_ID) return defaultMariaState;
    console.warn(
      '[PatientContext] UNGUARDED MOUNT: no registry member for "%s". Falling back to the ' +
        "golden-demo member, which means this screen is about to show a DIFFERENT member's " +
        'record. The caller must resolve the id and render MemberScopeNotice instead.',
      patientId
    );
    return defaultMariaState;
  };

  const [patient, setPatient] = useState<PatientSharedState>(getInitialState);

  useEffect(() => {
    setPatient(getInitialState());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, useMockData]);

  useEffect(() => {
    const platformId = patientId ?? '';
    // Only a MAPPED id is a FHIR id. This was
    //   PLATFORM_TO_FHIR_ID_MAP[platformId] ?? platformId.replace(/^patient\//, '')
    // which fabricates a truthy id for ANY string, so `PAT-0201` became `fhirId: 'PAT-0201'`.
    // Two consequences, the second worse than the first: the fetch below was issued for a
    // Patient that does not exist, and — because the fabricated id was ALSO handed to
    // `setActivePatientContext` — a subsequent `closeGap` wrote a gap-closure Observation
    // against `Patient/PAT-0201`. A care-gap closure filed against a non-existent patient is
    // a fabricated clinical record, not a missing one.
    const fhirId = PLATFORM_TO_FHIR_ID_MAP[platformId] ?? '';
    if (platformId && fhirId) gapStore?.setActivePatientContext(platformId, fhirId);

    if (useMockData || !patientId || !fhirId) return;

    const loadFromFhir = () => {
      getFhirClient()
        .getRegistryPatient(fhirId)
        .then((rp) => {
          if (rp) {
            setPatient(buildStateFromFhirPatient(rp));
            if (gapStore && rp.careGaps.length > 0) {
              const fhirUpdates: Record<string, GapClosureEvidence> = {};
              rp.careGaps.forEach((g) => {
                const obsId = `patient-${fhirId}-gap-${g.id}`;
                fhirUpdates[g.id] = {
                  gapId: g.id,
                  status: g.status === 'Closed' || g.status === 'Waived' ? 'CLOSED' : 'OPEN',
                  fhirObservationId: obsId,
                };
              });
              gapStore.seedObservationIds(fhirUpdates);
            }
          }
        })
        .catch((err) => {
          console.warn('[PatientContext] FHIR patient load failed, keeping registry state:', err);
        });
    };

    loadFromFhir();
    const interval = setInterval(loadFromFhir, 30_000);
    return () => clearInterval(interval);
  }, [patientId, useMockData, gapStore]);

  const updateEpisodeStatus = useCallback((status: EpisodeStatus) => {
    setPatient((p) => ({ ...p, episodeStatus: status }));
  }, []);

  const updateBHRisk = useCallback((risk: BHRiskLevel) => {
    setPatient((p) => ({ ...p, bhRisk: risk }));
  }, []);

  const closeGap = useCallback((gapId: string, evidence: string) => {
    setPatient((p) => ({
      ...p,
      careGaps: p.careGaps.map((g) =>
        g.id === gapId
          ? {
              ...g,
              status: 'Closed' as GapStatus,
              evidence,
              closedDate: clock.nowDate().toLocaleDateString(),
            }
          : g
      ),
    }));
  }, []);

  const updateGapStatus = useCallback((gapId: string, status: GapStatus) => {
    setPatient((p) => ({
      ...p,
      careGaps: p.careGaps.map((g) => (g.id === gapId ? { ...g, status } : g)),
    }));
  }, []);

  const completePathwayStep = useCallback((stepId: string, metric?: string) => {
    setPatient((p) => ({
      ...p,
      pathwaySteps: p.pathwaySteps.map((s) =>
        s.id === stepId ? { ...s, completed: true, metric: metric ?? s.metric } : s
      ),
    }));
  }, []);

  const updateCrisisState = useCallback((active: boolean) => {
    setPatient((p) => ({
      ...p,
      activeCrisis: active,
      crisisCount30d: active ? p.crisisCount30d + 1 : p.crisisCount30d,
    }));
  }, []);

  const updateSocialNeed = useCallback((field: keyof PatientSharedState, value: string) => {
    setPatient((p) => ({ ...p, [field]: value }));
  }, []);

  return (
    <PatientContext.Provider
      value={{
        patient,
        updateEpisodeStatus,
        updateBHRisk,
        closeGap,
        updateGapStatus,
        completePathwayStep,
        updateCrisisState,
        updateSocialNeed,
      }}
    >
      {children}
    </PatientContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePatientContext() {
  const ctx = useContext(PatientContext);
  if (!ctx) throw new Error('usePatientContext must be used within PatientContextProvider');
  return ctx;
}
