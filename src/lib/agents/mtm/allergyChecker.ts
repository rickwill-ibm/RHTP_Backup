/**
 * Drug-Allergy Contraindication Checker.
 *
 * Cross-references the proposed new drug's pharmacological class(es) against
 * the patient's active allergy list. Matches at the CLASS level — e.g. a
 * documented "Penicillin" allergy catches Amoxicillin, Ampicillin, and all
 * other penicillin-class agents, not just an exact name match.
 *
 * Class membership is resolved from:
 *   1. Drug class table (deterministic, offline — preferred)
 *   2. allergyClasses already populated on DrugLookupResult (from BFF)
 *
 * Severity mapping:
 *   FHIR criticality 'high' + reaction severity 'severe' → contraindicated (hardBlock)
 *   FHIR criticality 'high' or reaction 'severe'         → major
 *   All other                                             → moderate
 *
 * INVARIANT: returns empty array when drug class data is absent (no false positives).
 */
import type { DrugLookupResult, PatientAllergy, MtmFinding, MtmSeverity } from './types';
import { lookupDrugClass, resolveAllergyClasses } from './drugClassTable';

// ── Severity derivation ───────────────────────────────────────────────────────

function deriveSeverity(allergy: PatientAllergy): MtmSeverity {
  const isCriticalHigh = allergy.criticality === 'high';
  const isSevereReaction = allergy.reactionSeverity === 'severe';
  if (isCriticalHigh && isSevereReaction) return 'contraindicated';
  if (isCriticalHigh || isSevereReaction) return 'major';
  return 'moderate';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Normalise an AllergyIntolerance substance name into allergyClasses[].
 * Exported so the UI can call it when mapping FHIR AllergyIntolerance → PatientAllergy.
 */
export function normaliseAllergyClasses(substanceName: string): string[] {
  return resolveAllergyClasses(substanceName);
}

/**
 * Check the proposed new drug against the patient's active allergy list.
 * Matches at the pharmacological class level.
 *
 * @param newDrug   - Proposed drug (RxCUI + name used for class lookup)
 * @param allergies - Patient's active allergies (mapped from FHIR AllergyIntolerance)
 * @returns Array of MtmFinding — one per matching allergy (may be empty)
 */
export function checkDrugAllergy(
  newDrug: DrugLookupResult,
  allergies: PatientAllergy[]
): MtmFinding[] {
  if (allergies.length === 0) return [];

  // Resolve drug class info — prefer table, fall back to what BFF gave us
  const classInfo = lookupDrugClass(newDrug.rxcui, newDrug.name);
  const drugAllergyClasses = classInfo?.allergyClasses ?? newDrug.allergyClasses ?? [];

  if (drugAllergyClasses.length === 0) return [];

  const findings: MtmFinding[] = [];

  for (const allergy of allergies) {
    // Build the patient's effective allergy class set
    const patientClasses = new Set<string>([
      ...allergy.allergyClasses,
      ...resolveAllergyClasses(allergy.substanceName),
    ]);

    // Test intersection between drug's classes and patient's allergy classes
    const matchedClass = drugAllergyClasses.find((c) => patientClasses.has(c));
    if (!matchedClass) continue;

    const severity = deriveSeverity(allergy);
    const isContra = severity === 'contraindicated';

    findings.push({
      type: 'drug-allergy',
      severity,
      headline: `Drug-Allergy Alert: ${newDrug.name} — documented ${allergy.substanceName} allergy`,
      detail:
        `${newDrug.name} belongs to the ${classInfo?.pharmacologicalClass ?? matchedClass} class. ` +
        `Patient has a documented${allergy.criticality === 'high' ? ' HIGH-CRITICALITY' : ''} ` +
        `${allergy.substanceName} allergy` +
        (allergy.reactionSeverity ? ` (reaction severity: ${allergy.reactionSeverity})` : '') +
        `. Cross-reactivity is well-established within this drug class.`,
      requiresAcknowledgement: true,
      hardBlock: isContra,
    });
  }

  return findings;
}
