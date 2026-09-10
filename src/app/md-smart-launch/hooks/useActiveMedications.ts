/**
 * useActiveMedications — fetches the patient's active MedicationRequest list
 * from the active FHIR source (mock or live) and normalises to CurrentMedication[].
 *
 * Falls back to an empty array on any error so the MTM form still renders.
 */
import { useState, useEffect } from 'react';
import type { CurrentMedication } from '@/lib/agents/mtm/types';
import { getFhirClient, getFhirMockMode } from '@/lib/services/fhirClient';
import { storeSearch } from '@/lib/fhir/store';

function mapMedResource(r: Record<string, unknown>): CurrentMedication {
  const cc = r['medicationCodeableConcept'] as Record<string, unknown> | undefined;
  const codingArr = cc?.['coding'] as Array<Record<string, string>> | undefined;
  const coding = codingArr?.[0];
  return {
    rxcui: coding?.['code'] ?? '',
    name: coding?.['display'] ?? (cc?.['text'] as string) ?? 'Unknown',
  };
}

export function useActiveMedications(patientId: string): CurrentMedication[] {
  const [medications, setMedications] = useState<CurrentMedication[]>([]);

  useEffect(() => {
    if (!patientId) return;

    if (getFhirMockMode()) {
      // ── Mock path ────────────────────────────────────────────────────────────
      const bundle = storeSearch<{ entry?: { resource?: unknown }[] }>('MedicationRequest', {
        patient: patientId,
        status: 'active',
        _count: 50,
      });
      const resources = (bundle?.entry ?? [])
        .map((e: { resource?: unknown }) => e.resource)
        .filter(
          (r: unknown): r is Record<string, unknown> =>
            !!r && (r as Record<string, unknown>)['resourceType'] === 'MedicationRequest'
        );
      setMedications(resources.map(mapMedResource));
    } else {
      // ── Live FHIR path ────────────────────────────────────────────────────────
      const client = getFhirClient();
      client
        .search<{ entry?: { resource?: Record<string, unknown> }[] }>('MedicationRequest', {
          patient: patientId,
          status: 'active',
          _count: 50,
        })
        .then((bundle) => {
          const entries = bundle.entry ?? [];
          setMedications(
            entries
              .map((e) => e.resource)
              .filter(
                (r): r is Record<string, unknown> =>
                  !!r && r['resourceType'] === 'MedicationRequest'
              )
              .map(mapMedResource)
          );
        })
        .catch(() => setMedications([]));
    }
  }, [patientId]);

  return medications;
}
