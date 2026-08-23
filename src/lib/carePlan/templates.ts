/**
 * Care Plan templates — the content layer of the generator (Cycle 2 split:
 * builder / validator / templates per the debt register).
 *
 * Everything here is presentation/content selection: gap-category matching,
 * per-category intervention templates, care-modality selection, plan
 * title/description/summary assembly, and the financial constants.
 * Behavior-preserving extraction from carePlanGenerator.goals.ts /
 * carePlanGenerator.ts. Keyword matching on free-text names is the frozen
 * legacy behavior (see g5-careplan.md section 2 item 4); coded triggers are
 * the named follow-on, not this pass.
 */
import type {
  CareGap,
  CarePlanGoal,
  CarePlanIntervention,
  CareTeamMember,
  GeneratedCarePlan,
  PatientAnalysis,
} from './types';

// ── Financial constants (frozen legacy values; see FINDINGS F4 in CYCLE2B_REPORT) ──
export const PROGRAM_BONUS: Record<'HEDIS' | 'STARS' | 'MIPS', number> = {
  HEDIS: 2500,
  MIPS: 2000,
  STARS: 3000,
};
export const SHARED_SAVINGS_FACTOR = 0.15;
export const HEALTH_PLAN_SHARE_REVENUE_THRESHOLD = 5000;

/** Estimated bonus for closing a gap, by program (legacy constants). */
export function bonusForProgram(program: CareGap['program']): number {
  return PROGRAM_BONUS[program] ?? PROGRAM_BONUS.HEDIS;
}

// ── Modality selection ─────────────────────────────────────────────────────

/**
 * Determine best care modality based on patient barriers.
 * Prioritizes home-based and telehealth when barriers exist.
 */
export function determineOptimalModality(
  interventionType: string,
  hasTransportationBarrier: boolean,
  hasCaregiverBurden: boolean
): { modality: string; notes: string } {
  if (interventionType === 'SDoH_Referral') {
    return { modality: 'digital', notes: 'Remote enrollment via patient portal or phone' };
  }
  if (interventionType === 'BH_Screening') {
    return { modality: 'digital', notes: 'Self-administered via patient portal (10-15 minutes)' };
  }
  if (interventionType === 'Lab_Test' && hasTransportationBarrier) {
    return {
      modality: 'home-based',
      notes: 'At-home test kit (mail-order, self-collection, mail back)',
    };
  }
  if (interventionType === 'Follow_Up' && (hasTransportationBarrier || hasCaregiverBurden)) {
    return { modality: 'telehealth', notes: 'Video visit via MyChart or phone call' };
  }
  if (interventionType === 'Physical_Exam') {
    if (hasTransportationBarrier) {
      return {
        modality: 'in-person',
        notes: 'Required in-person visit - schedule after transportation assistance secured',
      };
    }
    return { modality: 'in-person', notes: 'Required for physical examination' };
  }
  if (hasTransportationBarrier || hasCaregiverBurden) {
    return { modality: 'telehealth', notes: 'Video visit to minimize travel burden' };
  }
  return { modality: 'in-person', notes: 'Standard office visit' };
}

// ── Gap-category matching (frozen legacy keyword behavior) ─────────────────

export type GapCategory = 'lab' | 'behavioral-screening' | 'physical-visit' | 'other';

export function categorizeGap(gap: CareGap): GapCategory {
  const name = gap.measureName.toLowerCase();
  if (name.includes('lab') || name.includes('a1c') || name.includes('hba1c')) return 'lab';
  if (name.includes('depression') || name.includes('phq') || name.includes('edinburgh')) {
    return 'behavioral-screening';
  }
  if (
    name.includes('well-child') ||
    name.includes('physical exam') ||
    name.includes('immunization')
  ) {
    return 'physical-visit';
  }
  return 'other';
}

/** Per-category intervention templates for a quality-gap goal (verbatim legacy content). */
export function gapInterventionTemplates(
  gap: CareGap,
  hasTransportationBarrier: boolean,
  hasCaregiverBurden: boolean,
  mintId: () => string
): CarePlanIntervention[] {
  switch (categorizeGap(gap)) {
    case 'lab':
      if (hasTransportationBarrier) {
        return [
          {
            id: mintId(),
            type: 'Procedure',
            description: 'Order at-home lab test kit',
            status: 'Pending',
            provider: 'Quest Diagnostics Home Testing',
            notes:
              'Mail-order kit, self-collection at home, mail back for processing. Results in 5-7 days.',
          },
          {
            id: mintId(),
            type: 'Appointment',
            description: 'Telehealth follow-up to review lab results',
            status: 'Pending',
            provider: 'Primary Care Provider',
            notes: 'Video visit via MyChart to discuss results and adjust care plan.',
          },
        ];
      }
      return [
        {
          id: mintId(),
          type: 'Appointment',
          description: 'Schedule lab test',
          status: 'Pending',
          notes: 'In-person lab visit',
        },
      ];
    case 'behavioral-screening':
      return [
        {
          id: mintId(),
          type: 'Monitoring',
          description: 'Complete screening via patient portal',
          status: 'Pending',
          provider: 'Care Manager (via patient portal)',
          notes: 'Self-administered digital screening (10-15 minutes). No appointment needed.',
        },
        {
          id: mintId(),
          type: 'Appointment',
          description: 'Telehealth follow-up if screening indicates need',
          status: 'Pending',
          provider: 'Behavioral Health Specialist',
          notes: 'Conditional - only scheduled if screening score indicates clinical concern.',
        },
      ];
    case 'physical-visit':
      if (hasTransportationBarrier) {
        return [
          {
            id: mintId(),
            type: 'Appointment',
            description: 'Schedule in-person visit (after transportation secured)',
            status: 'Pending',
            notes:
              'Required in-person visit. Schedule AFTER transportation assistance is in place (Goal 1). Bundle with any other necessary in-person care.',
          },
        ];
      }
      return [
        {
          id: mintId(),
          type: 'Appointment',
          description: 'Schedule in-person visit',
          status: 'Pending',
          notes: 'Required for physical examination and/or immunizations.',
        },
      ];
    default: {
      const modality = determineOptimalModality(
        'Follow_Up',
        hasTransportationBarrier,
        hasCaregiverBurden
      );
      return [
        {
          id: mintId(),
          type: 'Appointment',
          description: `Address ${gap.measureName} (${modality.modality})`,
          status: 'Pending',
          notes: modality.notes,
        },
      ];
    }
  }
}

// ── Plan text assembly (verbatim legacy content) ───────────────────────────

export function generateTitleAndDescription(analysis: PatientAnalysis): {
  title: string;
  description: string;
} {
  const conditionCount = analysis.primaryConditions.length;
  const gapCount = analysis.qualityGaps.length;
  const hccCount = analysis.hccOpportunities.length;

  let title = 'Comprehensive Care Plan';
  if (analysis.primaryConditions.length > 0) {
    title = `${analysis.primaryConditions[0]} Management Plan`;
    if (conditionCount > 1) title = `Multi-Condition Care Plan (${conditionCount} conditions)`;
  }

  const descriptionParts: string[] = [];
  descriptionParts.push(
    `Holistic care plan addressing ${conditionCount} active condition${conditionCount !== 1 ? 's' : ''}`
  );
  if (hccCount > 0)
    descriptionParts.push(
      `${hccCount} HCC documentation opportunit${hccCount !== 1 ? 'ies' : 'y'}`
    );
  if (gapCount > 0) descriptionParts.push(`${gapCount} quality gap${gapCount !== 1 ? 's' : ''}`);
  if (analysis.sdohNeeds.length > 0)
    descriptionParts.push(
      `${analysis.sdohNeeds.length} social determinant${analysis.sdohNeeds.length !== 1 ? 's' : ''} of health`
    );
  descriptionParts.push(
    `Coordinated care across ${analysis.specialtiesNeeded.length} specialt${analysis.specialtiesNeeded.length !== 1 ? 'ies' : 'y'}`
  );

  return { title, description: descriptionParts.join(', ') + '.' };
}

export function generateClinicalSummary(
  analysis: PatientAnalysis,
  goals: CarePlanGoal[],
  interventions: CarePlanIntervention[],
  careTeam: CareTeamMember[]
): GeneratedCarePlan['clinicalSummary'] {
  const conditions = [...analysis.primaryConditions];
  const needs: string[] = [];

  if (analysis.hccOpportunities.length > 0)
    needs.push(`${analysis.hccOpportunities.length} HCC documentation opportunities`);
  if (analysis.qualityGaps.length > 0)
    needs.push(`${analysis.qualityGaps.length} quality measure gaps`);
  analysis.sdohNeeds.forEach((need) => needs.push(need));
  if (analysis.utilizationRisks.length > 0)
    needs.push(`${analysis.utilizationRisks.length} utilization alerts`);

  const goalSummaries = goals.slice(0, 4).map((g) => g.description);

  const interventionSummaries: string[] = [];
  const interventionsByType = interventions.reduce(
    (acc, i) => {
      const bucket = acc[i.type] ?? (acc[i.type] = []);
      bucket.push(i);
      return acc;
    },
    {} as Record<string, CarePlanIntervention[]>
  );

  Object.entries(interventionsByType).forEach(([type, items]) => {
    if (items.length === 1) interventionSummaries.push(items[0].description);
    else interventionSummaries.push(`${items.length} ${type.toLowerCase()} interventions`);
  });

  const referrals = careTeam
    .filter(
      (member) =>
        member.role !== 'Primary Care Physician' &&
        member.role !== 'Care Manager' &&
        member.role !== 'Social Worker'
    )
    .map((member) => `${member.role}${member.specialty ? ` (${member.specialty})` : ''}`);

  return {
    conditions,
    needs,
    goals: goalSummaries,
    interventions: interventionSummaries.slice(0, 5),
    referrals,
  };
}

export function extractAddresses(analysis: PatientAnalysis): string[] {
  const addresses: string[] = [];
  analysis.hccOpportunities.forEach((hcc) =>
    addresses.push(`${hcc.icdCode} - ${hcc.icdDescription}`)
  );
  analysis.qualityGaps.forEach((gap) => addresses.push(`${gap.program}: ${gap.measureName}`));
  analysis.sdohNeeds.forEach((need) => addresses.push(`SDoH: ${need}`));
  return [...new Set(addresses)];
}
