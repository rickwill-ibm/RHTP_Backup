/**
 * Care Plan goal-intervention assignment (Cycle 2 split; extracted from the
 * builder to keep every module under the 400-line cap).
 */
import type { CarePlanGoal, CarePlanIntervention, PatientAnalysis } from './types';

const DEFAULT_FOLLOW_UP = (
  idSuffix: string | number,
  goalDescription?: string
): CarePlanIntervention => ({
  id: `intervention-${idSuffix}`,
  type: 'Appointment',
  description: 'Follow-up to assess goal progress',
  status: 'Pending',
  notes: `Review progress on: ${goalDescription || 'this goal'}`,
});

/**
 * Assign interventions to their related goals (FHIR-aligned approach).
 * Each goal can have multiple interventions that help achieve it.
 * INVARIANT P1 backstop: no goal is left without at least one intervention.
 */
export function assignInterventionsToGoals(
  goals: CarePlanGoal[],
  interventions: CarePlanIntervention[],
  _analysis: PatientAnalysis
): void {
  if (!goals || goals.length === 0) return;

  goals.forEach((goal) => {
    if (!goal.interventions) goal.interventions = [];
  });

  if (!interventions || interventions.length === 0) {
    goals.forEach((goal, idx) => {
      goal.interventions = [DEFAULT_FOLLOW_UP(`default-${idx}`, goal.description)];
    });
    return;
  }

  const assignRoundRobin = (targets: CarePlanGoal[], items: CarePlanIntervention[]): void => {
    if (targets.length === 0 || items.length === 0) return;
    items.forEach((intervention, idx) => {
      const targetGoal = targets[idx % targets.length];
      if (targetGoal && targetGoal.interventions) targetGoal.interventions.push(intervention);
    });
  };

  const hccGoals = goals.filter(
    (g) => g.description && g.description.includes('Document and code')
  );
  const qualityGoals = goals.filter(
    (g) => g.description && g.description.includes('Close') && g.description.includes('quality gap')
  );
  const riskGoals = goals.filter((g) => g.description && g.description.includes('Mitigate'));

  assignRoundRobin(
    hccGoals,
    interventions.filter((i) => i.type === 'Referral')
  );
  assignRoundRobin(
    qualityGoals,
    interventions.filter((i) => i.type === 'Monitoring')
  );
  assignRoundRobin(
    qualityGoals,
    interventions.filter((i) => i.type === 'Medication')
  );
  assignRoundRobin(
    qualityGoals,
    interventions.filter((i) => i.type === 'Education')
  );

  const appointmentInterventions = interventions.filter((i) => i.type === 'Appointment');
  if (appointmentInterventions.length > 0) {
    if (riskGoals.length > 0) {
      assignRoundRobin(riskGoals, appointmentInterventions);
    } else if (goals[0].interventions) {
      goals[0].interventions.push(...appointmentInterventions);
    }
  }

  goals.forEach((goal, idx) => {
    if (!goal.interventions || goal.interventions.length === 0) {
      goal.interventions = [DEFAULT_FOLLOW_UP(`followup-${idx}`, goal.description)];
    }
  });
}
