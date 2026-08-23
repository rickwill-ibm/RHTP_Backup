/**
 * Care Plan acceptance oracle — golden member-context fixtures (DP-4).
 *
 * Each fixture in tests/carePlan/fixtures/*.json carries an
 * expected-characteristics assertion set: STRUCTURAL truths about the
 * generated plan (goal ordering, modality substitution, sharing scope,
 * referral routing) — never byte-exact snapshots, so clinically-neutral
 * refactors do not churn the oracle.
 *
 * Review state: every fixture header must carry
 * "medical-lens drafted, SME sign-off pending (GB-3)" — asserted below.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setClock } from '@/lib/clock';
import {
  generateComprehensiveCarePlan,
  detectSDoHNeeds,
  validateGeneratedPlan,
  type ComprehensivePlanInput,
  type GeneratedCarePlan,
} from '@/lib/carePlan';

import diabetesTransportation from './fixtures/diabetes-transportation.json';
import bhPart2 from './fixtures/bh-part2.json';
import polypharmacyElder from './fixtures/polypharmacy-elder.json';
import pregnancy from './fixtures/pregnancy.json';
import pediatricCaregiver from './fixtures/pediatric-caregiver.json';
import minimalData from './fixtures/minimal-data.json';

interface FixtureExpected {
  priority?: string;
  title?: string;
  goalCount?: { min: number; max: number };
  firstGoalIncludes?: string;
  goalDescriptionsInclude?: string[];
  interventionDescriptionsInclude?: string[];
  referralCount?: number;
  referralSpecialtiesInclude?: string[];
  sharedWithIncludes?: string[];
  sharedWithExcludes?: string[];
  addressesInclude?: string[];
}

interface Fixture {
  _fixture: { id: string; description: string; clinicalReview: string; clock: string };
  input: ComprehensivePlanInput;
  expected: FixtureExpected;
}

const FIXTURES = [
  diabetesTransportation,
  bhPart2,
  polypharmacyElder,
  pregnancy,
  pediatricCaregiver,
  minimalData,
] as unknown as Fixture[];

const FIXED_TIME = new Date('2026-08-22T12:00:00Z').getTime();

beforeAll(() => setClock(() => FIXED_TIME));
afterAll(() => setClock(null));

function allInterventionDescriptions(plan: GeneratedCarePlan): string[] {
  return [
    ...plan.interventions.map((i) => i.description),
    ...plan.goals.flatMap((g) => (g.interventions ?? []).map((i) => i.description)),
  ];
}

describe('golden fixtures — review-state discipline', () => {
  it('every fixture is marked medical-lens drafted, SME sign-off pending (GB-3)', () => {
    for (const fixture of FIXTURES) {
      expect(fixture._fixture.clinicalReview).toBe(
        'medical-lens drafted, SME sign-off pending (GB-3)'
      );
      expect(fixture._fixture.id.length).toBeGreaterThan(0);
      expect(fixture._fixture.description.length).toBeGreaterThan(0);
    }
  });

  it('fixture set spans the six required journey archetypes', () => {
    const ids = FIXTURES.map((f) => f._fixture.id).sort();
    expect(ids).toEqual([
      'bh-part2',
      'diabetes-transportation',
      'minimal-data',
      'pediatric-caregiver',
      'polypharmacy-elder',
      'pregnancy',
    ]);
  });
});

describe.each(FIXTURES.map((f) => [f._fixture.id, f] as const))(
  'golden fixture: %s',
  (_id, fixture) => {
    const plan = (): GeneratedCarePlan => generateComprehensiveCarePlan(fixture.input);

    it('matches expected structural characteristics', () => {
      const p = plan();
      const e = fixture.expected;

      if (e.priority) expect(p.priority).toBe(e.priority);
      if (e.title) expect(p.title).toBe(e.title);
      if (e.goalCount) {
        expect(p.goals.length).toBeGreaterThanOrEqual(e.goalCount.min);
        expect(p.goals.length).toBeLessThanOrEqual(e.goalCount.max);
      }
      if (e.firstGoalIncludes) {
        expect(p.goals[0]?.description ?? '').toContain(e.firstGoalIncludes);
      }
      for (const wanted of e.goalDescriptionsInclude ?? []) {
        expect(p.goals.map((g) => g.description)).toContain(wanted);
      }
      const interventionDescriptions = allInterventionDescriptions(p);
      for (const wanted of e.interventionDescriptionsInclude ?? []) {
        expect(
          interventionDescriptions.some((d) => d.includes(wanted)),
          `expected an intervention including "${wanted}"`
        ).toBe(true);
      }
      if (e.referralCount !== undefined) expect(p.referralsCreated.length).toBe(e.referralCount);
      for (const specialty of e.referralSpecialtiesInclude ?? []) {
        expect(p.referralsCreated.map((r) => r.specialistType)).toContain(specialty);
      }
      for (const target of e.sharedWithIncludes ?? []) {
        expect(p.sharedWith).toContain(target);
      }
      for (const banned of e.sharedWithExcludes ?? []) {
        expect(
          p.sharedWith.some((s) => s.includes(banned)),
          `sharedWith must not include anything matching "${banned}" but was ${JSON.stringify(p.sharedWith)}`
        ).toBe(false);
      }
      for (const address of e.addressesInclude ?? []) {
        expect(p.addresses).toContain(address);
      }
    });

    it('passes the DP-4 invariant validator', () => {
      const p = plan();
      const needs = detectSDoHNeeds(
        fixture.input.patient,
        fixture.input.alerts,
        fixture.input.careGaps
      );
      const result = validateGeneratedPlan(fixture.input, p, needs);
      expect(result.violations).toEqual([]);
      expect(result.ok).toBe(true);
      // Honesty flag: contraindication checking is NOT asserted (no allergy/med input exists).
      expect(
        result.dataLimitations.some((l) => l.includes('contraindication-checking-not-asserted'))
      ).toBe(true);
    });

    it('mints persona-free referral ids derived from the member id', () => {
      const p = plan();
      for (const referral of p.referralsCreated) {
        expect(
          referral.referralId.startsWith(`ref-${fixture.input.patient.id.toLowerCase()}-`)
        ).toBe(true);
        expect(referral.referralId).not.toMatch(/margaret|maria/i);
      }
    });
  }
);
