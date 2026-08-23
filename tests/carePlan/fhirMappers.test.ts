/**
 * Care Plan FHIR mappers — structural mapping details (Tier-A offline;
 * never a conformance claim, conventions §11).
 */
import { describe, it, expect } from 'vitest';
import {
  toFhirCarePlan,
  toFhirGoal,
  type GeneratedCarePlan,
  type CarePlanGoal,
} from '@/lib/carePlan';

const goal: CarePlanGoal = {
  id: 'goal-1',
  description: 'Close HbA1c Lab Test quality gap',
  target: 'HbA1c documented',
  status: 'In Progress',
  dueDate: '2026-10-01',
  progress: 30,
  interventions: [
    {
      id: 'int-1',
      type: 'Procedure',
      description: 'Order at-home lab test kit',
      status: 'Pending',
    },
  ],
};

function plan(overrides: Partial<GeneratedCarePlan> = {}): GeneratedCarePlan {
  return {
    title: 'Test Plan',
    description: 'D',
    clinicalSummary: { conditions: [], needs: [], goals: [], interventions: [], referrals: [] },
    addresses: ['HEDIS: HbA1c Lab Test'],
    goals: [goal],
    interventions: [
      {
        id: 'int-2',
        type: 'Education',
        description: 'Patient education materials (digital)',
        status: 'Scheduled',
      },
      // duplicate id with nested — must be deduped in activities
      {
        id: 'int-1',
        type: 'Procedure',
        description: 'Order at-home lab test kit',
        status: 'Pending',
      },
    ],
    careTeam: [],
    sharedWith: ['Patient Portal'],
    priority: 'High',
    estimatedImpact: {
      rafDelta: 0.3,
      providerGainshare: 2500,
      qualityGapsClosed: 1,
      qualityMeasureBreakdown: [],
    },
    referralsCreated: [],
    ...overrides,
  };
}

describe('toFhirGoal', () => {
  it('maps goal statuses to lifecycleStatus', () => {
    expect(toFhirGoal({ ...goal, status: 'Not Started' }, 'p1').lifecycleStatus).toBe('proposed');
    expect(toFhirGoal({ ...goal, status: 'In Progress' }, 'p1').lifecycleStatus).toBe('active');
    expect(toFhirGoal({ ...goal, status: 'Achieved' }, 'p1').lifecycleStatus).toBe('completed');
    expect(toFhirGoal({ ...goal, status: 'Cancelled' }, 'p1').lifecycleStatus).toBe('cancelled');
  });

  it('carries description, subject, and target due date', () => {
    const resource = toFhirGoal(goal, 'member-1');
    expect(resource.resourceType).toBe('Goal');
    expect(resource.description?.text).toBe(goal.description);
    expect(resource.subject?.reference).toBe('Patient/member-1');
    expect(resource.target?.[0]?.dueDate).toBe('2026-10-01');
    expect(resource.target?.[0]?.measure?.text).toBe('HbA1c documented');
  });

  it('never throws on degenerate goals (defensive defaults)', () => {
    const degenerate = {
      id: '',
      description: '',
      target: '',
      status: 'Weird' as CarePlanGoal['status'],
      dueDate: '',
      progress: 0,
    };
    const resource = toFhirGoal(degenerate, '');
    expect(resource.lifecycleStatus).toBe('proposed');
    expect(resource.description?.text).toBe('Care plan goal');
  });
});

describe('toFhirCarePlan', () => {
  it('produces a draft plan-intent CarePlan referencing all goals', () => {
    const { carePlan, goals } = toFhirCarePlan(plan(), 'member-1');
    expect(carePlan.status).toBe('draft');
    expect(carePlan.intent).toBe('plan');
    expect(carePlan.title).toBe('Test Plan');
    expect(carePlan.subject?.reference).toBe('Patient/member-1');
    expect(goals).toHaveLength(1);
    expect(carePlan.goal).toHaveLength(1);
    expect(carePlan.goal?.[0]?.reference).toBe(`Goal/${goals[0].id}`);
  });

  it('maps addresses to display references and dedupes interventions into activities', () => {
    const { carePlan } = toFhirCarePlan(plan(), 'member-1');
    expect(carePlan.addresses?.[0]?.display).toBe('HEDIS: HbA1c Lab Test');
    // int-1 appears both nested and plan-level: exactly 2 unique activities (int-1, int-2)
    expect(carePlan.activity).toHaveLength(2);
    const statuses = (carePlan.activity ?? []).map((a) => a.detail?.status);
    expect(statuses).toContain('not-started');
    expect(statuses).toContain('scheduled');
  });

  it('handles an empty plan without throwing', () => {
    const empty = plan({ goals: [], interventions: [], addresses: [] });
    const { carePlan, goals } = toFhirCarePlan(empty, 'member-2');
    expect(carePlan.resourceType).toBe('CarePlan');
    expect(goals).toEqual([]);
    expect(carePlan.activity).toEqual([]);
  });
});
