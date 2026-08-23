/**
 * Care Plan builder — goals, interventions, assignment, and the
 * comprehensive-plan entry point (Cycle 2 split: builder/validator/templates).
 * Behavior-preserving extraction from carePlanGenerator.ts/.goals.ts/.helpers.ts
 * with two additive hardening changes only: (1) plans carry reference-level
 * citations and an SDOH addressed-or-deferred summary (additive fields);
 * (2) external sharing is consent-checked (default consent = legacy output).
 */
import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
import { getProviderAccessConsentStore } from '@/lib/consent/providerAccessOptOut';
import { log } from '@/lib/server/log';
import { analyzePatientData } from './analysis';
import { buildCitationIndex } from './citations';
import { assembleCareTeam } from './careTeam';
import { assignInterventionsToGoals } from './assignment';
import { createReferralsForCareGaps } from './referrals';
import {
  HEALTH_PLAN_SHARE_REVENUE_THRESHOLD,
  SHARED_SAVINGS_FACTOR,
  bonusForProgram,
  determineOptimalModality,
  extractAddresses,
  gapInterventionTemplates,
  generateClinicalSummary,
  generateTitleAndDescription,
} from './templates';
import type {
  CarePlanGoal,
  CarePlanIntervention,
  ComprehensivePlanInput,
  GeneratedCarePlan,
  PatientAnalysis,
  QualityMeasureImpact,
  SdohSummary,
} from './types';

export function createInterventionId(scope: string, interventionCounter: number): string {
  return `intervention-${scope}-${interventionCounter}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function inThirtyDays(): string {
  return new Date(clock.now() + 30 * DAY_MS).toISOString().split('T')[0];
}

function barrierFlags(analysis: PatientAnalysis): { transportation: boolean; caregiver: boolean } {
  return {
    transportation: analysis.sdohNeeds.some((need) =>
      need.toLowerCase().includes('transportation')
    ),
    caregiver: analysis.sdohNeeds.some(
      (need) => need.toLowerCase().includes('childcare') || need.toLowerCase().includes('caregiver')
    ),
  };
}

export function generateGoals(analysis: PatientAnalysis): CarePlanGoal[] {
  const goals: CarePlanGoal[] = [];
  let goalCounter = 1;
  let interventionCounter = 1;
  const mintId = (): string => createInterventionId('goal', interventionCounter++);
  const { transportation, caregiver } = barrierFlags(analysis);

  // Goals for SDoH needs - PRIORITIZE FIRST (barrier-first approach)
  if (analysis.sdohNeeds.length > 0) {
    const sdohGoal: CarePlanGoal = {
      id: `goal-${goalCounter++}`,
      description: `Address Social Determinants of Health barriers`,
      target: 'All identified barriers have support services in place',
      status: 'Not Started',
      dueDate: inThirtyDays(),
      progress: 0,
      notes: 'Priority: Address barriers FIRST to enable clinical care completion',
      interventions: [],
    };

    analysis.sdohNeeds.forEach((need) => {
      const modality = determineOptimalModality('SDoH_Referral', transportation, caregiver);
      sdohGoal.interventions!.push({
        id: mintId(),
        type: 'Referral',
        description: `${need} - Community resource connection`,
        status: 'Pending',
        provider: 'Social Services / Community Resources',
        notes: `${modality.notes}. No appointment needed - can be completed remotely.`,
      });
    });

    goals.push(sdohGoal);
  }

  // Goals for quality gaps - with barrier-aware interventions
  analysis.qualityGaps.forEach((gap) => {
    goals.push({
      id: `goal-${goalCounter++}`,
      description: `Close ${gap.measureName} quality gap`,
      target: gap.closureRequirement,
      status: gap.status === 'In Progress' ? 'In Progress' : 'Not Started',
      dueDate: gap.dueDate,
      progress: gap.status === 'In Progress' ? 30 : 0,
      notes: `${gap.program} measure - ${gap.daysOpen} days open`,
      interventions: gapInterventionTemplates(gap, transportation, caregiver, mintId),
    });
  });

  // Goals for HCC documentation
  analysis.hccOpportunities.forEach((hcc) => {
    goals.push({
      id: `goal-${goalCounter++}`,
      description: `Document and code ${hcc.hccDescription}`,
      target: `ICD-10: ${hcc.icdCode} documented and submitted`,
      status: 'Not Started',
      dueDate: hcc.submissionDeadline,
      progress: 0,
      notes: `RAF Delta: +${hcc.estimatedRafDelta.toFixed(2)}, Revenue: $${hcc.estimatedRevenueDelta.toLocaleString()}`,
    });
  });

  // Goals for utilization risks
  analysis.utilizationRisks.forEach((alert) => {
    if (alert.tier === 'Critical' || alert.tier === 'Important') {
      goals.push({
        id: `goal-${goalCounter++}`,
        description: `Mitigate ${alert.type}`,
        target: 'Risk reduced to low level',
        status: 'Not Started',
        dueDate: inThirtyDays(),
        progress: 0,
        notes: `Estimated cost impact: $${alert.estimatedCost.toLocaleString()}`,
      });
    }
  });

  return goals;
}

export function generateInterventions(analysis: PatientAnalysis): CarePlanIntervention[] {
  const interventions: CarePlanIntervention[] = [];
  let interventionCounter = 1;
  const mintId = (): string => createInterventionId('plan', interventionCounter++);
  const { transportation, caregiver } = barrierFlags(analysis);

  analysis.specialtiesNeeded.forEach((specialty) => {
    interventions.push({
      id: mintId(),
      type: 'Referral',
      description: `${specialty} consultation (referral pending)`,
      status: 'Pending',
      provider: `${specialty} specialist (to be assigned)`,
      notes: `Referral will be sent electronically. Specialist will contact patient to schedule.`,
    });
  });

  if (analysis.primaryConditions.length > 0) {
    interventions.push({
      id: mintId(),
      type: 'Monitoring',
      description: 'Home monitoring program enrollment',
      status: 'Pending',
      frequency: 'Daily',
      notes: `Remote monitoring for: ${analysis.primaryConditions.slice(0, 2).join(', ')}. Equipment shipped to home.`,
    });
  }

  if (analysis.medicationIssues.length > 0) {
    const modality = determineOptimalModality('Follow_Up', transportation, caregiver);
    interventions.push({
      id: mintId(),
      type: 'Appointment',
      description: `Medication review (${modality.modality})`,
      status: 'Pending',
      notes: `${modality.notes}. Review: ${analysis.medicationIssues.join('; ')}`,
    });
  }

  if (analysis.qualityGaps.length > 0) {
    interventions.push({
      id: mintId(),
      type: 'Education',
      description: 'Patient education materials (digital)',
      status: 'Pending',
      notes: `Educational resources sent via patient portal. Topics: ${analysis.qualityGaps
        .map((g) => g.measureName)
        .slice(0, 2)
        .join(', ')}`,
    });
  }

  const followUpModality = determineOptimalModality('Follow_Up', transportation, caregiver);
  interventions.push({
    id: mintId(),
    type: 'Appointment',
    description: `Care plan review (${followUpModality.modality})`,
    status: 'Pending',
    scheduledDate: inThirtyDays(),
    notes: `${followUpModality.notes}. Review progress on all goals and interventions.`,
  });

  analysis.sdohNeeds.forEach((need) => {
    const modality = determineOptimalModality('SDoH_Referral', transportation, caregiver);
    interventions.push({
      id: mintId(),
      type: 'Referral',
      description: `${need} - Community resource referral`,
      status: 'Pending',
      provider: 'Social Services / Community Resources',
      notes: `${modality.notes}. No appointment needed - enrollment can be completed remotely.`,
    });
  });

  return interventions;
}

/**
 * Sharing targets for the plan. Cycle 2 hardening: pushes beyond the
 * member's own portal / care manager are consent-checked through the
 * provider-access consent seam. Default consent state (no record) keeps
 * legacy output identical. If the seam is unavailable, sharing degrades
 * CLOSED (no external push) with a structured warning — never silently open.
 */
export function determineSharing(analysis: PatientAnalysis, patientId: string): string[] {
  const sharing: string[] = ['Patient Portal'];
  const externalShareBlocked = isExternalSharingBlocked(patientId);

  analysis.specialtiesNeeded.forEach((specialty) => {
    if (specialty !== 'Care Management' && specialty !== 'Social Work' && !externalShareBlocked) {
      sharing.push(`${specialty} (via FHIR)`);
    }
  });

  if (analysis.overallPriority === 'Critical' || analysis.overallPriority === 'High') {
    sharing.push('Care Manager');
  }
  // FINDINGS F3: revenue-gated health-plan sharing preserved this pass, now at least consent-checked.
  if (analysis.totalRevenueDelta > HEALTH_PLAN_SHARE_REVENUE_THRESHOLD && !externalShareBlocked) {
    sharing.push('Health Plan');
  }

  return sharing;
}

function isExternalSharingBlocked(patientId: string): boolean {
  try {
    return getProviderAccessConsentStore().isOptedOut(patientId);
  } catch {
    log.warn('carePlan.sharing.consentSeamUnavailable', { patientId, degraded: 'closed' });
    return true;
  }
}

export function calculateImpact(
  analysis: PatientAnalysis,
  goals: CarePlanGoal[],
  interventions: CarePlanIntervention[]
): GeneratedCarePlan['estimatedImpact'] {
  const qualityMeasureBreakdown: QualityMeasureImpact[] = analysis.qualityGaps.map((gap) => ({
    measureId: gap.measureId,
    measureName: gap.measureName,
    program: gap.program,
    relatedGoals: goals
      .filter(
        (goal) =>
          goal.description.toLowerCase().includes(gap.measureName.toLowerCase()) ||
          goal.notes?.toLowerCase().includes(gap.measureId.toLowerCase())
      )
      .map((goal) => goal.id),
    relatedInterventions: interventions
      .filter(
        (intervention) =>
          intervention.description.toLowerCase().includes(gap.measureName.toLowerCase()) ||
          intervention.notes?.toLowerCase().includes(gap.measureId.toLowerCase()) ||
          (intervention.type === 'Referral' &&
            gap.closureRequirement.toLowerCase().includes(intervention.description.toLowerCase()))
      )
      .map((intervention) => intervention.id),
    estimatedBonus: bonusForProgram(gap.program),
  }));

  const qualityBonus = qualityMeasureBreakdown.reduce((sum, m) => sum + m.estimatedBonus, 0);
  const sharedSavings = analysis.totalRevenueDelta * SHARED_SAVINGS_FACTOR;

  return {
    rafDelta: Math.round(analysis.totalRafDelta * 100) / 100,
    providerGainshare: Math.round(qualityBonus + sharedSavings),
    qualityGapsClosed: analysis.qualityGaps.length,
    qualityMeasureBreakdown,
  };
}

/** SDOH disposition: every detected need becomes an SDOH intervention, so all are addressed. */
function buildSdohSummary(analysis: PatientAnalysis): SdohSummary {
  return { addressed: [...analysis.sdohNeeds], deferred: [] };
}

/**
 * Main function to generate a comprehensive care plan.
 * Stable public entry point — callers and output shape unchanged.
 */
export function generateComprehensiveCarePlan(input: ComprehensivePlanInput): GeneratedCarePlan {
  const { patient, careGaps } = input;

  const analysis = analyzePatientData(input);
  const goals = generateGoals(analysis);
  const interventions = generateInterventions(analysis);

  try {
    assignInterventionsToGoals(goals, interventions, analysis);
  } catch (error) {
    // Legacy behavior preserved (swallow + continue); now structured + PHI-safe.
    log.error('carePlan.assignInterventions.failed', {
      patientId: patient.id,
      error: error instanceof Error ? error.name : 'unknown',
    });
  }

  const careTeam = assembleCareTeam(analysis, patient);
  const sharedWith = determineSharing(analysis, patient.id);
  const { title, description } = generateTitleAndDescription(analysis);

  const referralsCreated = createReferralsForCareGaps(
    patient,
    careGaps.filter((g) => g.status === 'Open' || g.status === 'In Progress'),
    analysis.specialtiesNeeded
  );

  // Structured logging (PHI-safe: patient id, not name); see src/lib/server/log.ts
  log.info('carePlan.referrals.autoCreated', {
    count: referralsCreated.length,
    patientId: patient.id,
  });

  return {
    title,
    description,
    clinicalSummary: generateClinicalSummary(analysis, goals, interventions, careTeam),
    addresses: extractAddresses(analysis),
    goals,
    interventions,
    careTeam,
    sharedWith,
    priority: analysis.overallPriority,
    estimatedImpact: calculateImpact(analysis, goals, interventions),
    referralsCreated,
    citations: buildCitationIndex(goals, interventions),
    sdohSummary: buildSdohSummary(analysis),
  };
}
