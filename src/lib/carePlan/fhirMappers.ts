/**
 * Care Plan FHIR mappers — project a GeneratedCarePlan onto the existing
 * FHIR R4 resource shapes (src/lib/fhir/types.ts). Structural Tier-A
 * mapping only: offline, deterministic, never claimed as profile
 * conformance (conventions §11; C4 $validate is the backbone-gated gate).
 *
 * Contract: mapping NEVER throws for any plan the builder can produce —
 * defensive defaults everywhere. DP-4 invariant P6's assertable half.
 */
import type { FhirCarePlan, FhirGoal } from '@/lib/fhir/types';
import type { CarePlanGoal, CarePlanIntervention, GeneratedCarePlan } from './types';

const GOAL_LIFECYCLE: Record<string, string> = {
  'Not Started': 'proposed',
  'In Progress': 'active',
  Achieved: 'completed',
  Cancelled: 'cancelled',
};

const ACTIVITY_STATUS: Record<string, string> = {
  Pending: 'not-started',
  Scheduled: 'scheduled',
  Active: 'in-progress',
  Completed: 'completed',
  Cancelled: 'cancelled',
};

function slug(value: string): string {
  return (
    String(value || 'unknown')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown'
  );
}

/** Map one plan goal to a FHIR Goal resource (structural R4 shape). */
export function toFhirGoal(goal: CarePlanGoal, patientId: string): FhirGoal {
  const resource: FhirGoal = {
    resourceType: 'Goal',
    id: `careplan-goal-${slug(patientId)}-${slug(goal.id)}`,
    lifecycleStatus: GOAL_LIFECYCLE[goal.status] ?? 'proposed',
    description: { text: goal.description || 'Care plan goal' },
    subject: { reference: `Patient/${patientId}` },
  };
  if (goal.dueDate || goal.target) {
    resource.target = [
      {
        ...(goal.target ? { measure: { text: goal.target } } : {}),
        ...(goal.dueDate ? { dueDate: goal.dueDate } : {}),
      },
    ];
  }
  return resource;
}

function activityFromIntervention(intervention: CarePlanIntervention): {
  detail: { status: string; description: string };
} {
  return {
    detail: {
      status: ACTIVITY_STATUS[intervention.status] ?? 'not-started',
      description: `${intervention.type}: ${intervention.description}`,
    },
  };
}

export interface FhirCarePlanProjection {
  carePlan: FhirCarePlan;
  goals: FhirGoal[];
}

/**
 * Project a generated plan to a draft FHIR CarePlan plus its Goal resources.
 * Always `status: draft`, `intent: plan` — activation is a clinician (HITL)
 * transition, never a generation-time state.
 */
export function toFhirCarePlan(plan: GeneratedCarePlan, patientId: string): FhirCarePlanProjection {
  const goals = (plan.goals ?? []).map((goal) => toFhirGoal(goal, patientId));

  const nestedInterventions = (plan.goals ?? []).flatMap((g) => g.interventions ?? []);
  const seen = new Set<string>();
  const allInterventions = [...nestedInterventions, ...(plan.interventions ?? [])].filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });

  const carePlan: FhirCarePlan = {
    resourceType: 'CarePlan',
    id: `careplan-${slug(patientId)}`,
    status: 'draft',
    intent: 'plan',
    title: plan.title || 'Care Plan',
    subject: { reference: `Patient/${patientId}` },
    addresses: (plan.addresses ?? []).map((text) => ({ display: text })),
    goal: goals.map((g) => ({ reference: `Goal/${g.id}` })),
    activity: allInterventions.map(activityFromIntervention),
  };

  return { carePlan, goals };
}
