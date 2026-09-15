/**
 * Root Cause Analyzer
 *
 * Analyzes patient's holistic context to identify:
 * - Primary blocker (root cause)
 * - Secondary blockers
 * - Compounding factors
 * - Cascading effects
 * - Critical interventions needed
 */

import type { HolisticPatientContext } from './holisticContextEngine';
import type {
  Blocker,
  BlockerType,
  CompoundingFactor,
  RootCause,
  RootCauseAnalysis,
} from './rootCauseAnalyzer.types';

export type {
  Blocker,
  BlockerType,
  CompoundingFactor,
  RootCause,
  RootCauseAnalysis,
} from './rootCauseAnalyzer.types';

// ============================================================================
// ROOT CAUSE ANALYZER
// ============================================================================

export class RootCauseAnalyzer {
  /**
   * Analyze patient context to identify root cause and blockers
   */
  analyze(context: HolisticPatientContext): RootCauseAnalysis {
    const blockers = this.identifyBlockers(context);
    const compoundingFactors = this.identifyCompoundingFactors(blockers, context);
    const rootCause = this.determineRootCause(blockers, context);
    const criticalInsight = this.generateCriticalInsight(rootCause, context);

    return {
      primaryBlocker: blockers[0],
      secondaryBlockers: blockers.slice(1),
      compoundingFactors,
      rootCause,
      criticalInsight,
      successProbabilityWithoutIntervention: this.calculateSuccessProbability(context, false),
      successProbabilityWithIntervention: this.calculateSuccessProbability(context, true),
    };
  }

  /**
   * Identify all blockers and rank by severity and impact
   */
  private identifyBlockers(context: HolisticPatientContext): Blocker[] {
    const blockers: Blocker[] = [];

    // Analyze caregiver burden
    if (context.caregiverStatus.isCaregiverForOthers) {
      const totalCareHours = context.caregiverStatus.dependents.reduce(
        (sum, dep) => sum + dep.careRequirements.dailyCareHours,
        0
      );

      const cannotLeaveHome = context.caregiverStatus.dependents.some(
        (dep) => !dep.careRequirements.canBeLeftAlone
      );

      const hasSpecialNeedsDependent = context.caregiverStatus.dependents.some(
        (dep) => dep.healthStatus === 'special-needs' || dep.healthStatus === 'frail'
      );

      blockers.push({
        type: 'caregiver-burden',
        severity: context.caregiverStatus.caregiverBurdenScore,
        impact: context.caregiverStatus.caregiverBurdenScore >= 70 ? 'critical' : 'high',
        description: `Caregiver for ${context.caregiverStatus.dependents.length} dependents requiring ${totalCareHours} hours/day`,
        constraints: {
          totalCareHours,
          cannotLeaveHome,
          hasSpecialNeedsDependent,
          dependentCount: context.caregiverStatus.dependents.length,
          respiteCareAvailable: context.caregiverStatus.respiteCareAvailable,
          timeAvailability: context.caregiverStatus.timeAvailability,
        },
        enablesOtherInterventions: true, // KEY: This must be addressed first
      });
    }

    // Analyze transportation barrier
    if (
      context.barriers.transportation.severity === 'high' ||
      context.barriers.transportation.severity === 'critical'
    ) {
      const severityScore = context.barriers.transportation.severity === 'critical' ? 90 : 80;

      blockers.push({
        type: 'transportation',
        severity: severityScore,
        impact: 'high',
        description: context.barriers.transportation.description || 'Transportation barrier',
        constraints: {
          distanceToProvider: context.accessProfile.distanceToProvider,
          publicTransitAvailable: context.accessProfile.publicTransitAvailable,
          interventionActive: context.barriers.transportation.status === 'intervention-active',
          ruralStatus: context.accessProfile.ruralStatus,
        },
      });
    }

    // Analyze financial burden
    if (context.financialProfile.financialStressScore > 60) {
      blockers.push({
        type: 'financial',
        severity: context.financialProfile.financialStressScore,
        impact: context.financialProfile.financialStressScore >= 80 ? 'high' : 'moderate',
        description: `$${context.financialProfile.outOfPocketBurden}/month out-of-pocket burden`,
        constraints: {
          outOfPocketBurden: context.financialProfile.outOfPocketBurden,
          householdIncome: context.financialProfile.householdIncome,
          employmentStatus: context.financialProfile.employmentStatus,
          insuranceType: context.financialProfile.insuranceCoverage.type,
        },
      });
    }

    // Analyze clinical complexity
    if (context.clinicalProfile.complexityScore > 60) {
      blockers.push({
        type: 'clinical-complexity',
        severity: context.clinicalProfile.complexityScore,
        impact: context.clinicalProfile.complexityScore >= 80 ? 'high' : 'moderate',
        description: `${context.clinicalProfile.conditionCount} chronic conditions, ${context.clinicalProfile.medications.length} medications`,
        constraints: {
          conditionCount: context.clinicalProfile.conditionCount,
          medicationCount: context.clinicalProfile.medications.length,
          riskLevel: context.clinicalProfile.riskLevel,
          openCareGaps: context.clinicalProfile.openCareGaps.length,
        },
      });
    }

    // Analyze time scarcity (related to caregiver burden)
    const availableTimeSlots = Object.values(context.caregiverStatus.timeAvailability).filter(
      (slot) => slot === 'available'
    ).length;

    if (availableTimeSlots <= 1) {
      blockers.push({
        type: 'time-scarcity',
        severity: 75,
        impact: 'high',
        description: 'Severely limited time availability',
        constraints: {
          availableTimeSlots,
          timeAvailability: context.caregiverStatus.timeAvailability,
        },
      });
    }

    // Analyze social isolation
    if (context.psychosocialProfile.socialIsolation) {
      blockers.push({
        type: 'social-isolation',
        severity: 60,
        impact: 'moderate',
        description: 'Socially isolated with no support system',
        constraints: {
          familyNearby: context.caregiverStatus.supportSystem.familyNearby,
          friendSupport: context.caregiverStatus.supportSystem.friendSupport,
          stressLevel: context.psychosocialProfile.stressLevel,
        },
      });
    }

    // Analyze geographic isolation
    if (
      context.accessProfile.ruralStatus === 'rural' ||
      context.accessProfile.ruralStatus === 'frontier'
    ) {
      blockers.push({
        type: 'geographic-isolation',
        severity: 50,
        impact: 'moderate',
        description: `Rural location, ${context.accessProfile.distanceToProvider} miles from provider`,
        constraints: {
          ruralStatus: context.accessProfile.ruralStatus,
          distanceToProvider: context.accessProfile.distanceToProvider,
          nearestER: context.accessProfile.nearestER,
        },
      });
    }

    // Sort by impact and severity
    blockers.sort((a, b) => {
      const impactOrder: Record<string, number> = { critical: 1, high: 2, moderate: 3, low: 4 };
      if (impactOrder[a.impact] !== impactOrder[b.impact]) {
        return impactOrder[a.impact] - impactOrder[b.impact];
      }
      return b.severity - a.severity;
    });

    return blockers;
  }

  /**
   * Identify compounding factors that multiply difficulty
   */
  private identifyCompoundingFactors(
    blockers: Blocker[],
    context: HolisticPatientContext
  ): CompoundingFactor[] {
    const factors: CompoundingFactor[] = [];

    const hasCaregiverBurden = blockers.some((b) => b.type === 'caregiver-burden');
    const hasTransportation = blockers.some((b) => b.type === 'transportation');
    const hasFinancial = blockers.some((b) => b.type === 'financial');
    const hasClinical = blockers.some((b) => b.type === 'clinical-complexity');
    const hasSocialIsolation = blockers.some((b) => b.type === 'social-isolation');

    if (hasCaregiverBurden && hasTransportation) {
      factors.push({
        factor: 'Caregiver burden + Transportation barrier',
        description: 'Cannot take dependents on long trips to appointments',
        multiplierEffect: 2.5,
      });
    }

    if (hasCaregiverBurden && hasFinancial) {
      factors.push({
        factor: 'Caregiver burden + Financial stress',
        description: 'Cannot work due to caregiving, leading to financial strain',
        multiplierEffect: 2.0,
      });
    }

    if (hasCaregiverBurden && hasClinical) {
      factors.push({
        factor: 'Caregiver burden + Clinical complexity',
        description: 'Managing own complex health while caring for others',
        multiplierEffect: 1.8,
      });
    }

    if (hasCaregiverBurden && hasSocialIsolation) {
      factors.push({
        factor: 'Caregiver burden + Social isolation',
        description: 'No support system to help with caregiving',
        multiplierEffect: 1.5,
      });
    }

    if (
      context.clinicalProfile.conditionCount >= 5 &&
      context.clinicalProfile.medications.length >= 10
    ) {
      factors.push({
        factor: 'Multiple chronic conditions + Polypharmacy',
        description: 'Managing 5+ conditions with 10+ medications',
        multiplierEffect: 1.6,
      });
    }

    return factors;
  }

  /**
   * Determine the root cause (primary blocker that causes cascading effects)
   */
  private determineRootCause(blockers: Blocker[], _context: HolisticPatientContext): RootCause {
    if (blockers[0]?.type === 'caregiver-burden') {
      return {
        type: 'caregiver-burden',
        description: 'Patient is primary caregiver for multiple dependents with no support system',
        cascadingEffects: [
          'Cannot leave home for appointments (dependents cannot be left alone)',
          'No time for self-care (10+ hours/day caregiving)',
          'Cannot work (full-time caregiving)',
          "Financial stress (single income, multiple people's medical expenses)",
          'Transportation barrier compounded (cannot take dependents on long trips)',
          'Social isolation (no time for social connections)',
          'Caregiver stress → worsening health conditions',
          "Complexity overload (managing 3 people's healthcare)",
        ],
        criticalIntervention: 'Respite care and caregiver support MUST come first',
        interventionDependencies: [
          'Establish respite care (4-8 hours/week minimum)',
          'Connect with caregiver support services',
          'Arrange childcare/adult day care for dependents',
          'Build support network',
        ],
      };
    }

    if (blockers[0]?.type === 'transportation') {
      return {
        type: 'transportation',
        description: 'Lack of reliable transportation to healthcare facilities',
        cascadingEffects: [
          'Cannot attend appointments',
          'Care gaps remain open',
          'Conditions worsen without monitoring',
          'Emergency department utilization increases',
        ],
        criticalIntervention: 'Transportation assistance required',
        interventionDependencies: [
          'Connect with transportation services',
          'Maximize telehealth options',
          'Arrange home-based services',
        ],
      };
    }

    if (blockers[0]?.type === 'clinical-complexity') {
      return {
        type: 'clinical-complexity',
        description: 'Multiple chronic conditions requiring complex care coordination',
        cascadingEffects: [
          'Multiple specialists needed',
          'Frequent monitoring required',
          'Medication management complexity',
          'High risk of complications',
        ],
        criticalIntervention: 'Care coordination and management required',
        interventionDependencies: [
          'Assign dedicated care manager',
          'Consolidate appointments',
          'Simplify medication regimen',
          'Implement remote monitoring',
        ],
      };
    }

    return {
      type: (blockers[0]?.type ?? 'clinical-complexity') as BlockerType,
      description: 'Multiple compounding barriers without single root cause',
      cascadingEffects: blockers.map((b) => b.description),
      criticalIntervention: 'Address highest-impact barrier first',
      interventionDependencies: ['Prioritize interventions by impact'],
    };
  }

  /**
   * Generate critical insight about the patient's situation
   */
  private generateCriticalInsight(rootCause: RootCause, context: HolisticPatientContext): string {
    if (rootCause.type === 'caregiver-burden') {
      const dependentNames = context.caregiverStatus.dependents
        .map((d) => `${d.name} (${d.age}, ${d.healthStatus})`)
        .join(' and ');

      return (
        `${context.patient.name}'s health cannot improve until caregiver burden is addressed. ` +
        `As primary caregiver for ${dependentNames}, with no respite care or support system, ` +
        `${context.patient.name} cannot attend appointments or engage in self-care. ` +
        `All other interventions will fail without first establishing respite care and caregiver support.`
      );
    }

    if (rootCause.type === 'transportation') {
      return (
        `${context.patient.name} cannot access healthcare due to transportation barrier. ` +
        `Living ${context.accessProfile.distanceToProvider} miles from provider with no reliable transport, ` +
        `care gaps will remain open without transportation assistance or alternative care delivery methods.`
      );
    }

    return (
      `${context.patient.name} faces multiple barriers that must be addressed systematically. ` +
      `The primary blocker (${rootCause.type}) must be resolved before other interventions can succeed.`
    );
  }

  /**
   * Calculate success probability based on whether interventions address root cause
   */
  private calculateSuccessProbability(
    context: HolisticPatientContext,
    withRootCauseIntervention: boolean
  ): number {
    let baseProbability = 50;

    baseProbability -= context.clinicalProfile.complexityScore * 0.2;

    if (context.caregiverStatus.isCaregiverForOthers) {
      if (withRootCauseIntervention && context.caregiverStatus.respiteCareAvailable) {
        baseProbability += 35;
      } else if (!withRootCauseIntervention) {
        baseProbability -= context.caregiverStatus.caregiverBurdenScore * 0.4;
      }
    }

    Object.values(context.barriers).forEach((barrier) => {
      if (barrier.severity === 'high' || barrier.severity === 'critical') {
        if (withRootCauseIntervention && barrier.status === 'intervention-active') {
          baseProbability += 10;
        } else if (!withRootCauseIntervention) {
          baseProbability -= 15;
        }
      }
    });

    if (context.psychosocialProfile.motivationLevel === 'high') {
      baseProbability += 10;
    } else if (context.psychosocialProfile.motivationLevel === 'low') {
      baseProbability -= 10;
    }

    return Math.max(0, Math.min(100, Math.round(baseProbability)));
  }
}

// Export singleton instance
export const rootCauseAnalyzer = new RootCauseAnalyzer();
