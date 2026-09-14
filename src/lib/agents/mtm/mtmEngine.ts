/**
 * MTM Engine — pure deterministic evaluator.
 *
 * evaluate(input) → MtmFinding[]
 *
 * Orchestrates all checkers and merges findings into a single ranked list.
 * Pure function: no I/O, no React, no random numbers — all effects are injected.
 *
 * INVARIANT: this function NEVER blocks a prescription; it returns findings
 *            that the UI presents to the physician for acknowledgement.
 *            Only hardBlock:true findings disable the submit button.
 */
import type { MtmCheckInput, MtmFinding } from './types';
import { checkDuplicateTherapy } from './duplicateTherapyChecker';
import { checkRefillTooSoon } from './refillTooSoonChecker';
import { checkBeersCriteria } from './beersCriteriaChecker';
import { checkDrugAllergy } from './allergyChecker';
import { normaliseSeverity } from './interactionChecker';
import { lookupDrugClass } from './drugClassTable';
import type { DrugInteraction, MtmSeverity } from './types';

// ── Severity ordering (higher index = more severe) ────────────────────────────

const SEVERITY_RANK: Record<MtmSeverity, number> = {
  info: 0,
  minor: 1,
  moderate: 2,
  major: 3,
  contraindicated: 4,
};

function sortFindings(findings: MtmFinding[]): MtmFinding[] {
  return [...findings].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

// ── Interaction findings ──────────────────────────────────────────────────────

function buildInteractionFindings(interactions: DrugInteraction[]): MtmFinding[] {
  return interactions.map((ix) => {
    const severity = normaliseSeverity(ix.severity);
    const isContra = severity === 'contraindicated';
    return {
      type: 'interaction',
      severity,
      headline: `${ix.drug1.name} ↔ ${ix.drug2.name}`,
      detail: ix.description || `Interaction reported by ${ix.source}.`,
      requiresAcknowledgement: true,
      hardBlock: isContra,
    } satisfies MtmFinding;
  });
}

// ── Public evaluate() ─────────────────────────────────────────────────────────

/**
 * Evaluate all MTM safety rules for a proposed new drug against the patient's
 * current medication list.
 *
 * @param input - Drug being ordered, current med list, pre-fetched interactions
 * @returns     Sorted findings (most severe first); empty array = safe to proceed
 */
export function evaluate(input: MtmCheckInput): MtmFinding[] {
  const { newDrug, currentMedications, interactions, allergies, patientAgeYears, nowIso } = input;

  // Augment newDrug with class info from the table if not already present
  // (covers the case where drug was typed manually rather than selected from typeahead)
  const classInfo =
    !newDrug.atcLevel4 || !newDrug.allergyClasses?.length
      ? lookupDrugClass(newDrug.rxcui, newDrug.name)
      : null;
  const augmentedDrug = classInfo
    ? {
        ...newDrug,
        atcLevel4: newDrug.atcLevel4 ?? classInfo.atcLevel4,
        allergyClasses: newDrug.allergyClasses?.length
          ? newDrug.allergyClasses
          : classInfo.allergyClasses,
      }
    : newDrug;

  // Augment currentMedications with class info from the table where missing
  const augmentedMeds = currentMedications.map((m) => {
    if (m.atcLevel4) return m;
    const info = lookupDrugClass(m.rxcui, m.name);
    return info ? { ...m, atcLevel4: info.atcLevel4 } : m;
  });

  const allFindings: MtmFinding[] = [
    ...buildInteractionFindings(interactions),
    ...checkDuplicateTherapy(augmentedDrug, augmentedMeds),
    ...checkRefillTooSoon(augmentedDrug, augmentedMeds, nowIso),
    ...(allergies?.length ? checkDrugAllergy(augmentedDrug, allergies) : []),
    ...(patientAgeYears !== undefined ? checkBeersCriteria(augmentedDrug, patientAgeYears) : []),
  ];

  return sortFindings(allFindings);
}
