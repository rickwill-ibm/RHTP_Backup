/**
 * useMedicationSubmit — FHIR MedicationRequest write + DetectedIssue write-back.
 * Extracted from AddMedicationForm to keep that file under the 400-line cap.
 * All API calls go through the BFF (no keys in browser).
 */
import { useState, useCallback } from 'react';
import { getFhirClient } from '@/lib/services/fhirClient';
import type { SmartLaunchContext } from '@/lib/smartFhirTypes';
import type { MtmFinding, PatientAllergy } from '@/lib/agents/mtm/types';

interface UseMedicationSubmitOptions {
  patientId: string;
  encounterId: string;
  launchContext: SmartLaunchContext;
  allergies: PatientAllergy[];
}

interface MedicationSubmitFields {
  medName: string;
  rxCode: string;
  ndcCode: string;
  sig: string;
  refills: string;
  note: string;
  mtmFindings: MtmFinding[];
}

interface UseMedicationSubmitReturn {
  saving: boolean;
  error: string | null;
  handleSubmit: (fields: MedicationSubmitFields) => Promise<void>;
}

export function useMedicationSubmit(
  { patientId, encounterId, launchContext, allergies }: UseMedicationSubmitOptions,
  onSaved: (resourceId: string, display: string) => void
): UseMedicationSubmitReturn {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (fields: MedicationSubmitFields) => {
      const { medName, rxCode, ndcCode, sig, refills, note, mtmFindings } = fields;
      if (!medName.trim()) {
        setError('Medication name is required.');
        return;
      }
      setSaving(true);
      setError(null);
      try {
        const todayIso = new Date().toISOString();
        const resource = {
          resourceType: 'MedicationRequest',
          status: 'active',
          intent: 'order',
          medicationCodeableConcept: {
            coding: rxCode.trim()
              ? [
                  {
                    system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
                    code: rxCode.trim(),
                    display: medName.trim(),
                  },
                ]
              : [{ display: medName.trim() }],
            text: medName.trim(),
          },
          subject: { reference: `Patient/${patientId}` },
          encounter: { reference: `Encounter/${encounterId}` },
          authoredOn: todayIso,
          requester: {
            reference: `Practitioner/${launchContext.practitionerId}`,
            display: launchContext.practitionerName,
          },
          dosageInstruction: sig.trim() ? [{ text: sig.trim() }] : undefined,
          dispenseRequest: { numberOfRepeatsAllowed: Math.max(0, parseInt(refills, 10) || 0) },
          note: note.trim() ? [{ text: note.trim(), time: todayIso }] : undefined,
          ...(ndcCode.trim() && {
            identifier: [{ system: 'http://hl7.org/fhir/sid/ndc', value: ndcCode.trim() }],
          }),
        };

        const created = await getFhirClient().create<{ id?: string }>(resource);
        const savedId = created.id ?? 'unknown';

        // Write DetectedIssue for each acknowledged non-hard-block finding (Da Vinci MTM pattern)
        const findingsToRecord = mtmFindings.filter((f) => !f.hardBlock);
        if (findingsToRecord.length > 0) {
          const allergyFinding = findingsToRecord.find((f) => f.type === 'drug-allergy');
          const allergyIntoleranceId = allergyFinding ? (allergies[0]?.id ?? undefined) : undefined;
          await fetch('/api/mtm/detected-issues', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              findings: findingsToRecord,
              context: {
                patientId,
                newMedicationRequestId: savedId,
                practitionerRef: `Practitioner/${launchContext.practitionerId}`,
                allergyIntoleranceId,
              },
            }),
          }).catch(() => {
            /* best-effort */
          });
        }

        onSaved(savedId, medName.trim());
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    },
    [patientId, encounterId, launchContext, allergies, onSaved]
  );

  return { saving, error, handleSubmit };
}
