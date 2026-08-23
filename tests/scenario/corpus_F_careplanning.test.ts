/**
 * Corpus family F — Care planning. Executable scenarios driving the REAL
 * care-plan generator + DP-4 invariant validator (src/lib/carePlan/*) over the
 * Cycle-2 golden fixtures.
 *
 * Covered runnable-now:
 *   UC-28 Polypharmacy dual-eligible elder — medication-review intervention,
 *         cited, flagged not-SME-reviewed until GB-3.
 *   UC-29 Pregnancy plan — every SDOH barrier addressed-or-deferred; no orphan
 *         goals (DP-4 invariants P4 + P1).
 *   UC-31 Data-limitation honesty — the plan does NOT assert contraindication
 *         safety it cannot back (Cycle-2 acceptance oracle finding).
 *
 * Pending in this family: UC-27 (no coded allergy/med input — DP-4 P2 gating
 * unimplementable, F1) and UC-30 (RelatedPerson/Task caregiver assignment).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setClock } from '@/lib/clock';
import {
  generateComprehensiveCarePlan,
  detectSDoHNeeds,
  validateGeneratedPlan,
  type ComprehensivePlanInput,
} from '@/lib/carePlan';

import polypharmacyElder from '../carePlan/fixtures/polypharmacy-elder.json';
import pregnancy from '../carePlan/fixtures/pregnancy.json';
import diabetesTransportation from '../carePlan/fixtures/diabetes-transportation.json';

const asInput = (f: unknown): ComprehensivePlanInput =>
  (f as { input: ComprehensivePlanInput }).input;

// Pin the clock so referral ids / due dates are deterministic (fixtures use this instant).
beforeAll(() => setClock(() => new Date('2026-08-22T12:00:00Z').getTime()));
afterAll(() => setClock(null));

describe('UC-28 | Polypharmacy in a dual-eligible elder', () => {
  const input = asInput(polypharmacyElder);

  it('surfaces a deprescribing/medication-review goal + intervention', () => {
    const plan = generateComprehensiveCarePlan(input);
    // Deprescribing-review goal derived from the poly-pharmacy signal.
    expect(plan.goals.map((g) => g.description)).toContain('Mitigate Poly-Pharmacy');
    const allInterventions = [
      ...plan.interventions.map((i) => i.description),
      ...plan.goals.flatMap((g) => (g.interventions ?? []).map((i) => i.description)),
    ];
    expect(allInterventions.some((d) => /medication review/i.test(d))).toBe(true);
  });

  it('cites its source and is flagged NOT-SME-reviewed until GB-3', () => {
    const plan = generateComprehensiveCarePlan(input);
    expect(plan.citations).toBeTruthy();
    // Every citation is honestly reference-level, not SME-reviewed.
    const allCitations = [
      ...Object.values(plan.citations!.goals).flat(),
      ...Object.values(plan.citations!.interventions).flat(),
    ];
    expect(allCitations.length).toBeGreaterThan(0);
    for (const c of allCitations) {
      expect(c.reviewLevel).toBe('reference-level');
      expect(c.smeReviewed).toBe(false);
    }
    expect(plan.citations!.disclaimer.toLowerCase()).toContain('not sme-reviewed');
  });

  it('passes the DP-4 invariant validator (no orphan goals, all recommendations cited)', () => {
    const plan = generateComprehensiveCarePlan(input);
    const needs = detectSDoHNeeds(input.patient, input.alerts, input.careGaps);
    const result = validateGeneratedPlan(input, plan, needs);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe('UC-29 | Pregnancy plan with barriers addressed', () => {
  const input = asInput(pregnancy);

  it('addresses OR explicitly defers every SDOH barrier in context (DP-4 P4)', () => {
    const plan = generateComprehensiveCarePlan(input);
    const needs = detectSDoHNeeds(input.patient, input.alerts, input.careGaps);
    expect(needs.length).toBeGreaterThan(0); // food-insecurity screening is present
    const summary = plan.sdohSummary!;
    for (const need of needs) {
      const addressed = summary.addressed.includes(need);
      const deferred = summary.deferred.find((d) => d.need === need);
      expect(addressed || !!deferred, `barrier "${need}" must be addressed or deferred`).toBe(true);
      if (deferred) expect(deferred.reason.length).toBeGreaterThan(0);
    }
  });

  it('has no orphan goals — every goal carries at least one intervention (DP-4 P1)', () => {
    const plan = generateComprehensiveCarePlan(input);
    for (const goal of plan.goals) {
      expect((goal.interventions ?? []).length).toBeGreaterThan(0);
    }
    const needs = detectSDoHNeeds(input.patient, input.alerts, input.careGaps);
    const result = validateGeneratedPlan(input, plan, needs);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe('UC-31 | Data-limitation honesty flag (allergies only at T2)', () => {
  // The adversarial case (Cycle-2 acceptance oracle): the care-plan input shape
  // carries NO coded (T1) allergy/medication data — any allergy would be at the
  // document (T2) level only. The plan must therefore NOT assert contraindication
  // safety it cannot back; it must instead carry the data-limitation flag. This
  // holds for EVERY plan the current input shape can produce (class, not instance).
  const fixtures: Array<[string, ComprehensivePlanInput]> = [
    ['diabetes-transportation', asInput(diabetesTransportation)],
    ['polypharmacy-elder', asInput(polypharmacyElder)],
    ['pregnancy', asInput(pregnancy)],
  ];

  for (const [id, input] of fixtures) {
    it(`[${id}] carries the contraindication-not-asserted limitation flag`, () => {
      const plan = generateComprehensiveCarePlan(input);
      const needs = detectSDoHNeeds(input.patient, input.alerts, input.careGaps);
      const result = validateGeneratedPlan(input, plan, needs);
      expect(
        result.dataLimitations.some((l) => l.includes('contraindication-checking-not-asserted'))
      ).toBe(true);
    });

    it(`[${id}] never asserts a contraindication-safety claim it cannot back`, () => {
      const plan = generateComprehensiveCarePlan(input);
      const allText = [
        ...plan.goals.map((g) => g.description),
        ...plan.interventions.map((i) => i.description),
        ...plan.goals.flatMap((g) => (g.interventions ?? []).map((i) => i.description)),
        plan.clinicalSummary.conditions.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      // A false-assurance phrase would be a defect: the engine has no allergy
      // data, so it must not claim it screened for or cleared contraindications.
      expect(/contraindication (cleared|checked|verified|screened)/.test(allText)).toBe(false);
      expect(/no known (allergies|contraindications)/.test(allText)).toBe(false);
    });
  }
});
