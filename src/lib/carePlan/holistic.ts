/**
 * Care Plan holistic path — context-aware plan built on the holistic
 * context engine / root-cause analyzer / tiered intervention generator,
 * converted to the standard GeneratedCarePlan shape for the existing UI.
 *
 * Behavior-preserving extraction from carePlanGenerator.holistic.ts and the
 * generateHolisticCarePlan entry in carePlanGenerator.ts.
 *
 * KNOWN DEFECTS, PRESERVED (see CYCLE2B_REPORT FINDINGS): demo-journey
 * keyword typing in mapModalityToType (F6); silent fallback to the
 * comprehensive path on any error (F7, now with a structured warning).
 */
import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
import { holisticContextEngine } from '@/lib/services/holisticContextEngine';
import { rootCauseAnalyzer } from '@/lib/services/rootCauseAnalyzer';
import {
  tieredInterventionGenerator,
  type HolisticCarePlan,
} from '@/lib/services/tieredInterventionGenerator';
import { log } from '@/lib/server/log';
import { detectSDoHNeeds } from './analysis';
import { generateComprehensiveCarePlan } from './builder';
import { buildCitationIndex } from './citations';
import { buildCareTeamFromHolisticPlan } from './careTeam';
import { createReferralsForCareGaps } from './referrals';
import { bonusForProgram } from './templates';
import type {
  CarePlanGoal,
  CarePlanIntervention,
  ComprehensivePlanInput,
  GeneratedCarePlan,
  SdohSummary,
} from './types';

export type HolisticGeneratedCarePlan = GeneratedCarePlan & {
  holisticPlan?: HolisticCarePlan;
  rootCauseInsight?: string;
};

/**
 * Generate holistic, context-aware care plan.
 * Falls back to the comprehensive plan on any error (legacy behavior,
 * preserved; the fallback is now logged instead of silent).
 */
export function generateHolisticCarePlan(input: ComprehensivePlanInput): HolisticGeneratedCarePlan {
  try {
    const { patient } = input;
    const context = holisticContextEngine.buildContext(patient.id);
    const analysis = rootCauseAnalyzer.analyze(context);
    const holisticPlan = tieredInterventionGenerator.generate(context, analysis);
    const standardPlan = convertHolisticToStandardPlan(holisticPlan, input);
    return {
      ...standardPlan,
      holisticPlan,
      rootCauseInsight: analysis.criticalInsight,
    };
  } catch (error) {
    log.warn('carePlan.holistic.fallbackToComprehensive', {
      patientId: input.patient.id,
      error: error instanceof Error ? error.name : 'unknown',
    });
    return generateComprehensiveCarePlan(input);
  }
}

/**
 * Convert holistic care plan to standard care plan format.
 * This maintains compatibility with existing UI components.
 */
export function convertHolisticToStandardPlan(
  holisticPlan: HolisticCarePlan,
  input: ComprehensivePlanInput
): GeneratedCarePlan {
  const { patient, careGaps } = input;

  const goals: CarePlanGoal[] = [];
  const interventions: CarePlanIntervention[] = [];
  let goalCounter = 1;
  let interventionCounter = 1;

  holisticPlan.interventions.forEach((tieredIntervention) => {
    const goal: CarePlanGoal = {
      id: `goal-holistic-${goalCounter++}`,
      description: tieredIntervention.title,
      target: tieredIntervention.successMetrics[0] || 'Intervention completed',
      status: 'Not Started',
      dueDate: calculateDueDate(tieredIntervention.estimatedTimeframe),
      progress: 0,
      notes: `${tieredIntervention.rationale}\n\nSuccess Metrics:\n${tieredIntervention.successMetrics.join('\n')}`,
      interventions: [],
    };

    tieredIntervention.actions.forEach((action) => {
      const intervention: CarePlanIntervention = {
        id: `intervention-holistic-${interventionCounter++}`,
        type: mapModalityToType(action.modality, action.action),
        description: action.action,
        status: mapStatusToStandard(action.status),
        provider: action.provider,
        notes: `${action.expectedOutcome}\n\nTimeline: ${action.timeline}\n\nModality: ${action.modality || 'TBD'}`,
        scheduledDate: action.timeline.includes('Week')
          ? calculateDateFromWeek(action.timeline)
          : undefined,
      };

      interventions.push(intervention);
      goal.interventions!.push(intervention);
    });

    goals.push(goal);
  });

  const careTeam = buildCareTeamFromHolisticPlan(holisticPlan, patient);

  const title = `Holistic Care Plan - ${
    holisticPlan.rootCauseAnalysis.primaryBlocker.type === 'caregiver-burden'
      ? 'Caregiver Support Focus'
      : 'Comprehensive Care'
  }`;

  const description =
    `Context-aware care plan addressing root cause: ${holisticPlan.rootCauseAnalysis.rootCause.description}. ` +
    `${holisticPlan.interventions.length} tiered interventions with ${holisticPlan.successProbability}% success probability.`;

  const clinicalSummary = {
    conditions: holisticPlan.rootCauseAnalysis.primaryBlocker.description.split(','),
    needs: holisticPlan.rootCauseAnalysis.rootCause.cascadingEffects.slice(0, 3),
    goals: goals.slice(0, 3).map((g) => g.description),
    interventions: interventions.slice(0, 5).map((i) => i.description),
    referrals: careTeam.filter((m) => m.role !== 'Primary Care Physician').map((m) => m.role),
  };

  const estimatedImpact = {
    rafDelta: 0,
    providerGainshare: holisticPlan.estimatedCostSavings,
    qualityGapsClosed: careGaps.filter((g) => g.status === 'Open').length,
    qualityMeasureBreakdown: careGaps.map((gap) => ({
      measureId: gap.measureId,
      measureName: gap.measureName,
      program: gap.program,
      relatedGoals: goals
        .filter((g) => g.description.toLowerCase().includes(gap.measureName.toLowerCase()))
        .map((g) => g.id),
      relatedInterventions: interventions
        .filter((i) => i.description.toLowerCase().includes(gap.measureName.toLowerCase()))
        .map((i) => i.id),
      estimatedBonus: bonusForProgram('HEDIS'),
    })),
  };

  const referralsCreated = createReferralsForCareGaps(
    patient,
    careGaps.filter((g) => g.status === 'Open' || g.status === 'In Progress'),
    []
  );

  return {
    title,
    description,
    clinicalSummary,
    addresses: holisticPlan.rootCauseAnalysis.rootCause.cascadingEffects,
    goals,
    interventions,
    careTeam,
    sharedWith: ['Patient Portal', 'Care Manager', 'Health Plan'],
    priority:
      holisticPlan.rootCauseAnalysis.primaryBlocker.impact === 'critical' ? 'Critical' : 'High',
    estimatedImpact,
    referralsCreated,
    citations: buildCitationIndex(goals, interventions),
    sdohSummary: buildHolisticSdohSummary(input, goals, interventions),
  };
}

/**
 * SDOH disposition for the holistic path: needs detected from the raw input
 * that no holistic goal/intervention mentions are explicitly DEFERRED (never
 * silently dropped) — DP-4 invariant P4 made visible.
 */
function buildHolisticSdohSummary(
  input: ComprehensivePlanInput,
  goals: CarePlanGoal[],
  interventions: CarePlanIntervention[]
): SdohSummary {
  const needs = detectSDoHNeeds(input.patient, input.alerts, input.careGaps);
  const corpus = [
    ...goals.map((g) => `${g.description} ${g.notes || ''}`),
    ...interventions.map((i) => `${i.description} ${i.notes || ''}`),
  ]
    .join('\n')
    .toLowerCase();

  const topicOf = (need: string): string => (need.split(/[:\s]/)[0] || need).toLowerCase();
  const addressed: string[] = [];
  const deferred: SdohSummary['deferred'] = [];
  for (const need of needs) {
    if (corpus.includes(topicOf(need))) addressed.push(need);
    else
      deferred.push({
        need,
        reason: 'not-covered-by-holistic-template; clinician review required',
      });
  }
  return { addressed, deferred };
}

/**
 * Map modality and action description to correct intervention type.
 * BARRIER-AWARE: Social services should be Referrals, not Appointments.
 */
export function mapModalityToType(
  modality?: string,
  actionDescription?: string
): CarePlanIntervention['type'] {
  const description = (actionDescription || '').toLowerCase();

  if (
    description.includes('enroll') ||
    description.includes('connect with') ||
    description.includes('activate unite us') ||
    description.includes('medicaid') ||
    description.includes('support group') ||
    description.includes('caregiver alliance') ||
    description.includes('autism family support') ||
    description.includes('adult day care') ||
    description.includes('respite care program')
  ) {
    return 'Referral';
  }
  if (
    description.includes('monitor') ||
    description.includes('screening') ||
    description.includes('assessment')
  ) {
    return 'Monitoring';
  }
  if (
    description.includes('education') ||
    description.includes('training') ||
    description.includes('information')
  ) {
    return 'Education';
  }
  if (
    description.includes('lab') ||
    description.includes('test') ||
    description.includes('procedure')
  ) {
    return 'Procedure';
  }

  if (!modality) return 'Appointment';

  const modalityMap: Record<string, CarePlanIntervention['type']> = {
    telehealth: 'Appointment',
    'in-person': 'Appointment',
    'home-visit': 'Monitoring',
    phone: 'Referral',
    'mobile-clinic': 'Appointment',
    digital: 'Monitoring',
  };

  return modalityMap[modality] || 'Appointment';
}

/** Calculate due date from timeframe string */
export function calculateDueDate(timeframe: string): string {
  const now = clock.nowDate();
  if (timeframe.includes('Immediate')) now.setDate(now.getDate() + 7);
  else if (timeframe.includes('Week 1')) now.setDate(now.getDate() + 7);
  else if (timeframe.includes('Week 2')) now.setDate(now.getDate() + 14);
  else if (timeframe.includes('Weeks 1-2')) now.setDate(now.getDate() + 14);
  else if (timeframe.includes('Weeks 3-4')) now.setDate(now.getDate() + 28);
  else if (timeframe.includes('Weeks 4-12')) now.setDate(now.getDate() + 84);
  else if (timeframe.includes('Ongoing')) now.setDate(now.getDate() + 90);
  else now.setDate(now.getDate() + 30);
  return now.toISOString().split('T')[0];
}

/** Calculate date from week string (e.g., "Week 1" -> 7 days from now) */
export function calculateDateFromWeek(weekString: string): string {
  const now = clock.nowDate();
  const weekMatch = weekString.match(/Week (\d+)/);
  if (weekMatch) {
    now.setDate(now.getDate() + parseInt(weekMatch[1]) * 7);
  } else {
    now.setDate(now.getDate() + 7);
  }
  return now.toISOString().split('T')[0];
}

/** Map action status to standard intervention status */
export function mapStatusToStandard(status?: string): CarePlanIntervention['status'] {
  if (!status) return 'Pending';
  const statusMap: Record<string, CarePlanIntervention['status']> = {
    pending: 'Pending',
    'in-progress': 'Active',
    completed: 'Completed',
  };
  return statusMap[status] || 'Pending';
}
