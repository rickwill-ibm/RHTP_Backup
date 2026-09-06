/**
 * MTM allergy mapper — converts FHIR AllergyIntolerance[] → PatientAllergy[].
 *
 * Called at the UI boundary (AddMedicationForm callers) to transform what
 * useAllergies() returns into the domain's PatientAllergy type.
 *
 * This is the ONLY place that reads FHIR AllergyIntolerance for MTM purposes.
 * The engine itself only sees PatientAllergy[].
 */
import type { FhirAllergyIntolerance } from '@/lib/fhir/types';
import type { PatientAllergy } from '@/lib/agents/mtm/types';
import { normaliseAllergyClasses } from '@/lib/agents/mtm/allergyChecker';

/**
 * Map a single FHIR AllergyIntolerance to PatientAllergy.
 * Returns null when the resource has no substance name (unparseable).
 */
function mapOne(a: FhirAllergyIntolerance): PatientAllergy | null {
  const substanceName = a.code?.text ?? a.code?.coding?.[0]?.display ?? a.code?.coding?.[0]?.code;

  if (!substanceName) return null;

  const worstReaction = a.reaction?.reduce<string | undefined>((worst, r) => {
    const sev = r.severity;
    if (!sev) return worst;
    if (sev === 'severe') return 'severe';
    if (sev === 'moderate' && worst !== 'severe') return 'moderate';
    return worst ?? sev;
  }, undefined);

  return {
    id: a.id ?? 'unknown',
    substanceName,
    allergyClasses: normaliseAllergyClasses(substanceName),
    criticality: a.criticality,
    reactionSeverity: worstReaction,
  };
}

/**
 * Map FHIR AllergyIntolerance[] → PatientAllergy[].
 * Skips resources that cannot be parsed (no false positives).
 */
export function mapAllergiesToMtm(fhirAllergies: FhirAllergyIntolerance[]): PatientAllergy[] {
  return fhirAllergies.flatMap((a) => {
    const mapped = mapOne(a);
    return mapped ? [mapped] : [];
  });
}
