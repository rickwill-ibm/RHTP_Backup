/**
 * useSmartAllergies — fetches the patient's active AllergyIntolerance list
 * from the active FHIR source (mock or live) and normalises to PatientAllergy[].
 *
 * Returns a tuple of [allergies, refresh] so callers can re-fetch after adding
 * a new allergy via AddAllergyForm.
 *
 * Falls back to an empty array on any error.
 */
import { useState, useEffect, useCallback } from 'react';
import type { PatientAllergy } from '@/lib/agents/mtm';
import { normaliseAllergyClasses } from '@/lib/agents/mtm';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';
import { storeSearch } from '@/lib/fhir/store';

function mapAllergyResource(r: Record<string, unknown>): PatientAllergy {
  const cc = r['code'] as Record<string, unknown> | undefined;
  const codingArr = cc?.['coding'] as Array<Record<string, string>> | undefined;
  const coding = codingArr?.[0];
  const substanceName = coding?.['display'] ?? (cc?.['text'] as string) ?? 'Unknown';
  return {
    id: String(r['id'] ?? ''),
    substanceName,
    allergyClasses: normaliseAllergyClasses(substanceName),
    criticality: r['criticality'] as string | undefined,
  };
}

export function useSmartAllergies(patientId: string): [PatientAllergy[], () => void] {
  const [allergies, setAllergies] = useState<PatientAllergy[]>([]);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!patientId) return;

    if (getFhirMockMode()) {
      // ── Mock path ────────────────────────────────────────────────────────────
      const bundle = storeSearch<{ entry?: { resource?: unknown }[] }>('AllergyIntolerance', {
        patient: patientId,
        'clinical-status': 'active',
        _count: 50,
      });
      const resources = (bundle?.entry ?? [])
        .map((e: { resource?: unknown }) => e.resource)
        .filter(
          (r: unknown): r is Record<string, unknown> =>
            !!r && (r as Record<string, unknown>)['resourceType'] === 'AllergyIntolerance'
        );
      setAllergies(resources.map(mapAllergyResource));
    } else {
      // ── Live FHIR path ────────────────────────────────────────────────────────
      const client = getFhirClient();
      client
        .search<{ entry?: { resource?: Record<string, unknown> }[] }>('AllergyIntolerance', {
          patient: patientId,
          'clinical-status': 'active',
          _count: 50,
        })
        .then((bundle) => {
          const entries = bundle.entry ?? [];
          setAllergies(
            entries
              .map((e) => e.resource)
              .filter(
                (r): r is Record<string, unknown> =>
                  !!r && r['resourceType'] === 'AllergyIntolerance'
              )
              .map(mapAllergyResource)
          );
        })
        .catch(() => setAllergies([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, tick]);

  return [allergies, refresh];
}
