import * as clock from '@/lib/clock'; // deterministic time/rng seam (test setters: setClock/setRng)
/**
 * Tiered Intervention Generator
 *
 * Generates holistic, tiered care plans that address root cause first,
 * build on foundation with dependent interventions, adapt to patient context,
 * and minimize burden to maximize success probability.
 */

import type { HolisticPatientContext } from './holisticContextEngine';
import type { RootCauseAnalysis } from './rootCauseAnalyzer';

export type {
  HolisticCarePlan,
  TieredIntervention,
  InterventionCategory,
  InterventionAction,
  Timeline,
  TimelinePhase,
} from './tieredInterventionGenerator.types';

import type {
  HolisticCarePlan,
  TieredIntervention,
  Timeline,
} from './tieredInterventionGenerator.types';
import {
  buildCaregiverSupportIntervention,
  buildTransportationIntervention,
  buildCaregiverFriendlyTransportation,
  buildCareDeliveryOptimization,
  buildClinicalCareIntervention,
  buildSustainabilityIntervention,
} from './tieredInterventionGenerator.helpers';

export class TieredInterventionGenerator {
  generate(context: HolisticPatientContext, analysis: RootCauseAnalysis): HolisticCarePlan {
    const interventions = this.generateInterventions(context, analysis);
    const timeline = this.generateTimeline(interventions);
    return {
      patient: { id: context.patient.id, name: context.patient.name },
      rootCauseAnalysis: analysis,
      interventions,
      timeline,
      successProbability: analysis.successProbabilityWithIntervention,
      estimatedCostSavings: this.calculateCostSavings(context, interventions),
      estimatedBurdenReduction: this.calculateBurdenReduction(interventions),
      generatedAt: clock.nowIso(),
    };
  }

  private generateInterventions(
    context: HolisticPatientContext,
    analysis: RootCauseAnalysis
  ): TieredIntervention[] {
    const interventions: TieredIntervention[] = [];

    // TIER 1: Address root cause
    if (analysis.rootCause.type === 'caregiver-burden') {
      interventions.push(buildCaregiverSupportIntervention(context));
    } else if (analysis.rootCause.type === 'transportation') {
      interventions.push(buildTransportationIntervention(context));
    }

    // TIER 2: Transportation (if not root cause but still a barrier)
    if (
      analysis.rootCause.type !== 'transportation' &&
      context.barriers.transportation.severity === 'high'
    ) {
      interventions.push(buildCaregiverFriendlyTransportation(context));
    }

    interventions.push(buildCareDeliveryOptimization(context)); // TIER 3
    interventions.push(buildClinicalCareIntervention(context)); // TIER 4
    interventions.push(buildSustainabilityIntervention(context)); // TIER 5

    return interventions;
  }

  private generateTimeline(interventions: TieredIntervention[]): Timeline {
    return {
      totalDuration: '12 weeks',
      phases: [
        {
          phase: 'Phase 1: Foundation',
          weeks: 'Weeks 1-2',
          focus: 'Address root cause',
          keyMilestones: [
            'Respite care established',
            'Transportation coordinated',
            'Support services connected',
          ],
        },
        {
          phase: 'Phase 2: Optimization',
          weeks: 'Weeks 3-4',
          focus: 'Optimize care delivery',
          keyMilestones: [
            'Telehealth appointments scheduled',
            'Home services arranged',
            'Appointments consolidated',
          ],
        },
        {
          phase: 'Phase 3: Clinical Care',
          weeks: 'Weeks 4-12',
          focus: 'Close care gaps',
          keyMilestones: ['All labs completed', 'Specialist follow-ups done', 'Care gaps closed'],
        },
        {
          phase: 'Phase 4: Sustainability',
          weeks: 'Ongoing',
          focus: 'Maintain improvements',
          keyMilestones: [
            'Care management active',
            'Support system established',
            'Health maintained',
          ],
        },
      ],
    };
  }

  private calculateCostSavings(
    context: HolisticPatientContext,
    interventions: TieredIntervention[]
  ): number {
    const allActions = interventions.flatMap((i) => i.actions);
    let savings = allActions.filter((a) => a.modality === 'telehealth').length * 40;
    savings += allActions.filter((a) => a.modality === 'home-visit').length * 60;
    if (context.clinicalProfile.riskLevel === 'high') savings += 1500;
    return savings;
  }

  private calculateBurdenReduction(interventions: TieredIntervention[]): number {
    const avg = interventions.reduce((sum, i) => sum + i.burdenScore, 0) / interventions.length;
    return Math.round(100 - avg);
  }
}

export const tieredInterventionGenerator = new TieredInterventionGenerator();
