/**
 * Care Plan validator — negative-path tests: each invariant check must
 * actually detect the defect it exists for (a validator that can't fail
 * is decoration, not a gate).
 */
import { describe, it, expect } from 'vitest';
import {
  checkGoalsHaveInterventions,
  checkCitationCoverage,
  checkSdohDisposition,
  checkDataLimitations,
  validateGeneratedPlan,
  CITATION_DISCLAIMER,
  type GeneratedCarePlan,
  type ComprehensivePlanInput,
} from '@/lib/carePlan';

function bareplan(overrides: Partial<GeneratedCarePlan> = {}): GeneratedCarePlan {
  return {
    title: 'T',
    description: 'D',
    clinicalSummary: { conditions: [], needs: [], goals: [], interventions: [], referrals: [] },
    addresses: [],
    goals: [],
    interventions: [],
    careTeam: [],
    sharedWith: ['Patient Portal'],
    priority: 'Low',
    estimatedImpact: {
      rafDelta: 0,
      providerGainshare: 0,
      qualityGapsClosed: 0,
      qualityMeasureBreakdown: [],
    },
    referralsCreated: [],
    ...overrides,
  };
}

const goalNoInterventions = {
  id: 'goal-x',
  description: 'Close X quality gap',
  target: 't',
  status: 'Not Started' as const,
  dueDate: '2026-10-01',
  progress: 0,
  interventions: [],
};

describe('checkGoalsHaveInterventions (P1)', () => {
  it('flags a goal with no interventions', () => {
    const violations = checkGoalsHaveInterventions(bareplan({ goals: [goalNoInterventions] }));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('goal-x');
  });

  it('accepts a goal with interventions', () => {
    const plan = bareplan({
      goals: [
        {
          ...goalNoInterventions,
          interventions: [
            { id: 'i1', type: 'Appointment', description: 'follow up', status: 'Pending' },
          ],
        },
      ],
    });
    expect(checkGoalsHaveInterventions(plan)).toEqual([]);
  });
});

describe('checkCitationCoverage (P3)', () => {
  it('flags a plan with no citation index at all', () => {
    expect(checkCitationCoverage(bareplan())).toEqual(['P3: plan carries no citation index']);
  });

  it('flags uncited goals and interventions', () => {
    const plan = bareplan({
      goals: [
        {
          ...goalNoInterventions,
          interventions: [
            { id: 'i1', type: 'Appointment', description: 'follow up', status: 'Pending' },
          ],
        },
      ],
      interventions: [{ id: 'i2', type: 'Education', description: 'materials', status: 'Pending' }],
      citations: { goals: {}, interventions: {}, disclaimer: CITATION_DISCLAIMER },
    });
    const violations = checkCitationCoverage(plan);
    expect(violations.some((v) => v.includes('goal-x'))).toBe(true);
    expect(violations.some((v) => v.includes('i1'))).toBe(true);
    expect(violations.some((v) => v.includes('i2'))).toBe(true);
  });

  it('flags a missing not-SME-reviewed disclaimer', () => {
    const plan = bareplan({
      citations: { goals: {}, interventions: {}, disclaimer: 'all good, fully reviewed' },
    });
    expect(checkCitationCoverage(plan).some((v) => v.includes('disclaimer'))).toBe(true);
  });
});

describe('checkSdohDisposition (P4)', () => {
  const need = 'Transportation barrier: documented';

  it('flags a silently dropped SDOH need', () => {
    const plan = bareplan({ sdohSummary: { addressed: [], deferred: [] } });
    const violations = checkSdohDisposition(plan, [need]);
    expect(violations.some((v) => v.includes('silently dropped'))).toBe(true);
  });

  it('flags a missing sdohSummary when needs exist, accepts it when none do', () => {
    expect(checkSdohDisposition(bareplan(), [need])).toHaveLength(1);
    expect(checkSdohDisposition(bareplan(), [])).toEqual([]);
  });

  it('accepts addressed and reasoned-deferred needs', () => {
    const plan = bareplan({
      sdohSummary: {
        addressed: [need],
        deferred: [{ need: 'Food security: pending', reason: 'clinician review required' }],
      },
    });
    expect(checkSdohDisposition(plan, [need, 'Food security: pending'])).toEqual([]);
  });
});

describe('checkDataLimitations — honesty flags', () => {
  const input: ComprehensivePlanInput = {
    patient: { id: 'p1' } as ComprehensivePlanInput['patient'],
    hccSuspects: [],
    careGaps: [],
    alerts: [],
  };

  it('always names the contraindication scope boundary (no allergy/medication input exists)', () => {
    const limitations = checkDataLimitations(input);
    expect(limitations.some((l) => l.includes('contraindication-checking-not-asserted'))).toBe(
      true
    );
  });

  it('flags a minimal-data context', () => {
    expect(checkDataLimitations(input).some((l) => l.includes('minimal-data-context'))).toBe(true);
  });
});

describe('validateGeneratedPlan — aggregate', () => {
  it('aggregates violations across invariants and reports not-ok', () => {
    const input: ComprehensivePlanInput = {
      patient: { id: 'p1' } as ComprehensivePlanInput['patient'],
      hccSuspects: [],
      careGaps: [],
      alerts: [],
    };
    const result = validateGeneratedPlan(input, bareplan({ goals: [goalNoInterventions] }), [
      'Some need',
    ]);
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(3); // P1 + P3 + P4
    expect(result.dataLimitations.length).toBeGreaterThan(0);
  });
});
