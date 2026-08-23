/**
 * Care Plan domain — shared types (single source of truth for the domain).
 *
 * Extracted from src/lib/services/carePlanGenerator.types.ts (Cycle 2 split:
 * builder / validator / templates per the debt register). The legacy file
 * re-exports from here; callers keep importing the same names.
 *
 * Input entity shapes (Patient, CareGap, ...) remain owned by @/lib/types;
 * plan component shapes (CarePlanGoal, ...) remain owned by the mock-data
 * domain until the FHIR record becomes the system of record. This module
 * re-exports both so care-plan code has ONE import point.
 */
import type { CarePlanGoal, CarePlanIntervention, CareTeamMember, Referral } from '@/lib/mockData';
import type { Patient, HCCSuspect, CareGap, UtilizationAlert } from '@/lib/types';

export type { Patient, HCCSuspect, CareGap, UtilizationAlert };
export type { CarePlanGoal, CarePlanIntervention, CareTeamMember, Referral };

export interface ComprehensivePlanInput {
  patient: Patient;
  hccSuspects: HCCSuspect[];
  careGaps: CareGap[];
  alerts: UtilizationAlert[];
  /** Unvalidated extra clinical payload; currently unread by the engine. */
  clinicalData?: unknown;
}

export interface QualityMeasureImpact {
  measureId: string;
  measureName: string;
  program: 'HEDIS' | 'STARS' | 'MIPS';
  relatedGoals: string[]; // Goal IDs that address this measure
  relatedInterventions: string[]; // Intervention IDs that address this measure
  estimatedBonus: number; // Financial value of closing this gap
}

/**
 * A reference-level guideline citation attached to a plan recommendation.
 * HONESTY MARKER: reviewLevel is always 'reference-level' and smeReviewed is
 * always false until GB-3 SME sign-off exists — consumers must render that.
 */
export interface GuidelineCitation {
  sourceId: string;
  system: string; // e.g. 'ADA' | 'USPSTF' | 'HEDIS' | 'CMS' | 'AHRQ' | 'AAP' | 'AGS' | 'Gravity' | 'CDC'
  title: string;
  url?: string;
  reviewLevel: 'reference-level';
  smeReviewed: false;
}

/** Citation coverage for every clinical recommendation in a generated plan. */
export interface PlanCitationIndex {
  /** goal id -> at least one citation */
  goals: Record<string, GuidelineCitation[]>;
  /** intervention id -> at least one citation (plan-level and goal-nested) */
  interventions: Record<string, GuidelineCitation[]>;
  disclaimer: string;
}

/** SDOH barrier disposition: every detected barrier is addressed or explicitly deferred. */
export interface SdohSummary {
  addressed: string[];
  deferred: Array<{ need: string; reason: string }>;
}

export interface GeneratedCarePlan {
  title: string;
  description: string;
  clinicalSummary: {
    conditions: string[];
    needs: string[];
    goals: string[];
    interventions: string[];
    referrals: string[];
  };
  addresses: string[];
  goals: CarePlanGoal[];
  interventions: CarePlanIntervention[];
  careTeam: CareTeamMember[];
  sharedWith: string[];
  priority: 'Critical' | 'High' | 'Moderate' | 'Low';
  estimatedImpact: {
    rafDelta: number;
    providerGainshare: number;
    qualityGapsClosed: number;
    qualityMeasureBreakdown: QualityMeasureImpact[]; // Detailed breakdown by measure
  };
  referralsCreated: Referral[]; // Auto-created referrals for care gaps
  /** Additive (Cycle 2): reference-level citations for every goal/intervention. */
  citations?: PlanCitationIndex;
  /** Additive (Cycle 2): explicit addressed-or-deferred disposition of SDOH barriers. */
  sdohSummary?: SdohSummary;
}

export interface PatientAnalysis {
  overallPriority: 'Critical' | 'High' | 'Moderate' | 'Low';
  primaryConditions: string[];
  hccOpportunities: HCCSuspect[];
  qualityGaps: CareGap[];
  utilizationRisks: UtilizationAlert[];
  sdohNeeds: string[];
  medicationIssues: string[];
  specialtiesNeeded: string[];
  urgentActions: string[];
  totalRafDelta: number;
  totalRevenueDelta: number;
}
