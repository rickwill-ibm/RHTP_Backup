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
import type { GapClosureEvidence, PatientSharedState, EpisodeStatus, BHRiskLevel, GapStatus } from './patientContext.types';

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

export function PatientContextProvider({ patientId, children }: { patientId?: string; children: React.ReactNode }) {
  const { useMockData } = useAppContext();
  const gapStore = useContext(GapClosureStoreContext);

  const getInitialState = (): PatientSharedState => {
    if (!patientId) return defaultMariaState;
    const registryState = buildStateFromRegistry(patientId);
    if (registryState) return registryState;
    if (patientId === 'PAT-0042' || patientId === 'patient-001') return defaultDorothyState;
    if (patientId === DEMO_MEMBER_ID || patientId === '') return defaultMariaState;
    return defaultMariaState;
  };

  const [patient, setPatient] = useState<PatientSharedState>(getInitialState);

  useEffect(() => {
    setPatient(getInitialState());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, useMockData]);

  useEffect(() => {
    const platformId = patientId ?? '';
    const fhirId =
      PLATFORM_TO_FHIR_ID_MAP[platformId] ??
      (platformId ? platformId.replace(/^patient\//, '') : '');
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
        g.id === gapId ? { ...g, status: 'Closed' as GapStatus, evidence, closedDate: clock.nowDate().toLocaleDateString() } : g
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
