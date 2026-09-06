/**
 * Duplicate Therapy Checker.
 *
 * CMS Part D MTM rule: a new drug is a "duplicate therapy" finding when
 * another active medication shares the same ATC Level-4 pharmacological class.
 *
 * ATC Level-4 = the first 5 characters of the ATC code (e.g. "C09AA" for
 * ACE inhibitors acting on renin-angiotensin).
 *
 * When ATC data is absent the check is silently skipped (returns empty array)
 * rather than generating a false positive.
 */
import type { CurrentMedication, DrugLookupResult, MtmFinding } from './types';

/** Extract ATC level-4 key (first 5 chars, upper-cased). */
function atcL4(code: string | undefined): string | null {
  if (!code || code.length < 5) return null;
  return code.slice(0, 5).toUpperCase();
}

/**
 * Check whether the new drug duplicates any ATC Level-4 class already present
 * in the patient's active medication list.
 *
 * @param newDrug          - Proposed new drug (from drug-lookup BFF)
 * @param currentMedications - Patient's active med list
 * @returns Array of MtmFinding (may be empty)
 */
export function checkDuplicateTherapy(
  newDrug: DrugLookupResult,
  currentMedications: CurrentMedication[]
): MtmFinding[] {
  const newClass = atcL4(newDrug.atcLevel4);
  if (!newClass) return [];

  const duplicates = currentMedications.filter((m) => atcL4(m.atcLevel4) === newClass);

  return duplicates.map((dup) => ({
    type: 'duplicate-therapy',
    severity: 'moderate',
    headline: `Duplicate therapy: ${newDrug.name} (same class as ${dup.name})`,
    detail:
      `Both ${newDrug.name} and ${dup.name} belong to pharmacological class ` +
      `${newClass}. Review whether both are clinically necessary per CMS Part D MTM guidelines.`,
    requiresAcknowledgement: true,
    hardBlock: false,
  }));
}
