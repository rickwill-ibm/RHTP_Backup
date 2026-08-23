/**
 * Care Plan validator — DP-4 property invariants as executable checks
 * (Cycle 2 split: builder / validator / templates per the debt register;
 * invariant set per coalition design g5-careplan.md section 3.2).
 *
 * Pure functions returning violation lists (expected-outcome values, never
 * throws — conventions §6.1). Used by the acceptance-oracle test suite and
 * available to any caller that wants to gate on plan integrity.
 *
 * Scope honesty: P2 (contraindication gating) is NOT implementable against
 * the current input shape — ComprehensivePlanInput carries no allergy or
 * medication-list data (FINDINGS F1). checkDataLimitations names that gap
 * explicitly instead of pretending the check exists.
 */
import type { ComprehensivePlanInput, GeneratedCarePlan } from './types';

export interface PlanValidationResult {
  ok: boolean;
  violations: string[];
  /** Honest capability flags — what this validator could NOT assert. */
  dataLimitations: string[];
}

/** P1: every goal has at least one intervention. */
export function checkGoalsHaveInterventions(plan: GeneratedCarePlan): string[] {
  const violations: string[] = [];
  for (const goal of plan.goals) {
    if (!goal.interventions || goal.interventions.length === 0) {
      violations.push(`P1: goal ${goal.id} has no interventions`);
    }
  }
  return violations;
}

/** P3: every clinical recommendation (goal + intervention) carries at least one citation. */
export function checkCitationCoverage(plan: GeneratedCarePlan): string[] {
  const violations: string[] = [];
  const citations = plan.citations;
  if (!citations) return ['P3: plan carries no citation index'];

  for (const goal of plan.goals) {
    if (!citations.goals[goal.id] || citations.goals[goal.id].length === 0) {
      violations.push(`P3: goal ${goal.id} has no citation`);
    }
    for (const intervention of goal.interventions ?? []) {
      if (
        !citations.interventions[intervention.id] ||
        citations.interventions[intervention.id].length === 0
      ) {
        violations.push(`P3: goal-nested intervention ${intervention.id} has no citation`);
      }
    }
  }
  for (const intervention of plan.interventions) {
    if (
      !citations.interventions[intervention.id] ||
      citations.interventions[intervention.id].length === 0
    ) {
      violations.push(`P3: intervention ${intervention.id} has no citation`);
    }
  }
  if (!citations.disclaimer || !citations.disclaimer.toLowerCase().includes('not sme-reviewed')) {
    violations.push('P3: citation index must carry the not-SME-reviewed disclaimer');
  }
  return violations;
}

/** P4: every SDOH barrier in the input is addressed or explicitly deferred — never silently dropped. */
export function checkSdohDisposition(plan: GeneratedCarePlan, detectedNeeds: string[]): string[] {
  const violations: string[] = [];
  const summary = plan.sdohSummary;
  if (!summary) {
    return detectedNeeds.length > 0 ? ['P4: plan carries no sdohSummary but SDOH needs exist'] : [];
  }
  for (const need of detectedNeeds) {
    const addressed = summary.addressed.includes(need);
    const deferred = summary.deferred.some((d) => d.need === need);
    if (!addressed && !deferred) {
      violations.push(`P4: SDOH need silently dropped: ${need}`);
    }
    if (deferred && !summary.deferred.find((d) => d.need === need)?.reason) {
      violations.push(`P4: deferred SDOH need lacks a reason: ${need}`);
    }
  }
  return violations;
}

/** Honest capability flags for what the input shape cannot support (P2 scope boundary). */
export function checkDataLimitations(input: ComprehensivePlanInput): string[] {
  const limitations: string[] = [
    'contraindication-checking-not-asserted: input carries no allergy or active-medication data (see FINDINGS F1)',
  ];
  if (input.hccSuspects.length === 0 && input.careGaps.length === 0 && input.alerts.length === 0) {
    limitations.push('minimal-data-context: plan generated from demographics and risk tier only');
  }
  return limitations;
}

/** Aggregate validation: run every assertable invariant, report honestly on the rest. */
export function validateGeneratedPlan(
  input: ComprehensivePlanInput,
  plan: GeneratedCarePlan,
  detectedNeeds: string[]
): PlanValidationResult {
  const violations = [
    ...checkGoalsHaveInterventions(plan),
    ...checkCitationCoverage(plan),
    ...checkSdohDisposition(plan, detectedNeeds),
  ];
  return {
    ok: violations.length === 0,
    violations,
    dataLimitations: checkDataLimitations(input),
  };
}
