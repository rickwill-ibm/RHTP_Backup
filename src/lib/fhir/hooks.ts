'use client';
import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
/**
 * Typed FHIR data hooks — one per clinical domain.
 *
 * Every hook goes through the shared FhirClient, so components are
 * mode-agnostic: in mock mode the client serves fixture bundles from the
 * in-memory store; in live mode it queries the FHIR server. Each hook
 * exposes { data, loading, error, refresh, fetchedAt }.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getFhirClient } from '@/lib/services/fhirClient';
import type {
  FhirAllergyIntolerance,
  FhirBundle,
  FhirCarePlan,
  FhirCareTeam,
  FhirCondition,
  FhirCoverage,
  FhirDiagnosticReport,
  FhirDocumentReference,
  FhirEncounter,
  FhirFamilyMemberHistory,
  FhirFlag,
  FhirGoal,
  FhirImmunization,
  FhirMedicationRequest,
  FhirObservation,
  FhirPatient,
  FhirProcedure,
  FhirResource,
  FhirServiceRequestR4,
} from './types';

export interface FhirQueryState<T> {
  data: T;
  loading: boolean;
  error: string | null;
  fetchedAt: string | null;
  refresh: () => void;
}

function entries<T extends FhirResource>(bundle: FhirBundle | undefined | null): T[] {
  return (bundle?.entry ?? [])
    .map((e) => e.resource)
    .filter((r): r is T => !!r);
}

/** Generic search hook. */
export function useFhirSearch<T extends FhirResource>(
  resourceType: string,
  params: Record<string, string | number | boolean>,
  enabled = true,
): FhirQueryState<T[]> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const paramsKey = JSON.stringify(params);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getFhirClient()
      .search<FhirBundle>(resourceType, paramsRef.current)
      .then((bundle) => {
        if (cancelled) return;
        setData(entries<T>(bundle));
        setFetchedAt(clock.nowIso());
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resourceType, paramsKey, enabled, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, fetchedAt, refresh };
}

/** Generic single-resource read hook. */
export function useFhirRead<T extends FhirResource>(
  resourceType: string,
  id: string | undefined,
): FhirQueryState<T | null> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getFhirClient()
      .read<T>(resourceType, id)
      .then((res) => {
        if (cancelled) return;
        setData(res && (res as FhirResource).resourceType === resourceType ? res : null);
        setFetchedAt(clock.nowIso());
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [resourceType, id, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, fetchedAt, refresh };
}

// ── Domain hooks ─────────────────────────────────────────────────────────────

export function usePatient(patientId?: string) {
  return useFhirRead<FhirPatient>('Patient', patientId);
}

export function useEncounter(encounterId?: string) {
  return useFhirRead<FhirEncounter>('Encounter', encounterId);
}

export function useEncounterHistory(patientId?: string) {
  return useFhirSearch<FhirEncounter>(
    'Encounter',
    { patient: patientId ?? '', _sort: '-date', _count: 20 },
    !!patientId,
  );
}

export function useProblemList(patientId?: string) {
  return useFhirSearch<FhirCondition>(
    'Condition',
    { patient: patientId ?? '', category: 'problem-list-item', 'clinical-status': 'active' },
    !!patientId,
  );
}

export function useEncounterDiagnoses(patientId?: string, encounterId?: string) {
  return useFhirSearch<FhirCondition>(
    'Condition',
    { patient: patientId ?? '', category: 'encounter-diagnosis', encounter: encounterId ?? '' },
    !!patientId && !!encounterId,
  );
}

export function useVitals(patientId?: string) {
  return useFhirSearch<FhirObservation>(
    'Observation',
    { patient: patientId ?? '', category: 'vital-signs', _sort: '-date', _count: 50 },
    !!patientId,
  );
}

export function useLabs(patientId?: string) {
  return useFhirSearch<FhirObservation>(
    'Observation',
    { patient: patientId ?? '', category: 'laboratory', _sort: '-date', _count: 100 },
    !!patientId,
  );
}

export function useObservationTrend(patientId?: string, loincCode?: string) {
  return useFhirSearch<FhirObservation>(
    'Observation',
    { patient: patientId ?? '', code: loincCode ?? '', _sort: '-date' },
    !!patientId && !!loincCode,
  );
}

export function useSdohObservations(patientId?: string) {
  return useFhirSearch<FhirObservation>(
    'Observation',
    { patient: patientId ?? '', category: 'social-history', _sort: '-date' },
    !!patientId,
  );
}

export function useActiveMedications(patientId?: string) {
  return useFhirSearch<FhirMedicationRequest>(
    'MedicationRequest',
    { patient: patientId ?? '', status: 'active', _sort: '-date' },
    !!patientId,
  );
}

export function useAllergies(patientId?: string) {
  return useFhirSearch<FhirAllergyIntolerance>(
    'AllergyIntolerance',
    { patient: patientId ?? '', 'clinical-status': 'active' },
    !!patientId,
  );
}

export function useImmunizations(patientId?: string) {
  return useFhirSearch<FhirImmunization>(
    'Immunization',
    { patient: patientId ?? '', _sort: '-date' },
    !!patientId,
  );
}

export function useFlags(patientId?: string) {
  return useFhirSearch<FhirFlag>(
    'Flag',
    { patient: patientId ?? '', status: 'active' },
    !!patientId,
  );
}

export function useCoverage(patientId?: string) {
  return useFhirSearch<FhirCoverage>(
    'Coverage',
    { patient: patientId ?? '', status: 'active' },
    !!patientId,
  );
}

export function useCareTeamFhir(patientId?: string) {
  return useFhirSearch<FhirCareTeam>(
    'CareTeam',
    { patient: patientId ?? '', status: 'active' },
    !!patientId,
  );
}

export function useCarePlans(patientId?: string) {
  return useFhirSearch<FhirCarePlan>(
    'CarePlan',
    { patient: patientId ?? '', status: 'active' },
    !!patientId,
  );
}

export function useGoals(patientId?: string) {
  return useFhirSearch<FhirGoal>('Goal', { patient: patientId ?? '' }, !!patientId);
}

export function useServiceRequests(patientId?: string) {
  return useFhirSearch<FhirServiceRequestR4>(
    'ServiceRequest',
    { patient: patientId ?? '', _sort: '-date' },
    !!patientId,
  );
}

export function useDiagnosticReports(patientId?: string) {
  return useFhirSearch<FhirDiagnosticReport>(
    'DiagnosticReport',
    { patient: patientId ?? '', _sort: '-date' },
    !!patientId,
  );
}

export function useDocuments(patientId?: string) {
  return useFhirSearch<FhirDocumentReference>(
    'DocumentReference',
    { patient: patientId ?? '', _sort: '-date' },
    !!patientId,
  );
}

export function useFamilyHistory(patientId?: string) {
  return useFhirSearch<FhirFamilyMemberHistory>(
    'FamilyMemberHistory',
    { patient: patientId ?? '' },
    !!patientId,
  );
}

export function useProcedures(patientId?: string) {
  return useFhirSearch<FhirProcedure>(
    'Procedure',
    { patient: patientId ?? '', _sort: '-date' },
    !!patientId,
  );
}
