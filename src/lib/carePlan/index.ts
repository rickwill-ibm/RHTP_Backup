/**
 * Care Plan domain — public surface (re-exports ONLY, conventions §4).
 * Cross-domain callers import from '@/lib/carePlan' and never deep-import.
 *
 * Stable API (unchanged names, unchanged shapes — the legacy
 * src/lib/services/carePlanGenerator*.ts files delegate here):
 *   generateComprehensiveCarePlan, generateHolisticCarePlan, GeneratedCarePlan
 */
export type {
  Patient,
  HCCSuspect,
  CareGap,
  UtilizationAlert,
  CarePlanGoal,
  CarePlanIntervention,
  CareTeamMember,
  Referral,
  ComprehensivePlanInput,
  QualityMeasureImpact,
  GeneratedCarePlan,
  PatientAnalysis,
  GuidelineCitation,
  PlanCitationIndex,
  SdohSummary,
} from './types';

export {
  generateComprehensiveCarePlan,
  generateGoals,
  generateInterventions,
  determineSharing,
  calculateImpact,
  createInterventionId,
} from './builder';

export { assignInterventionsToGoals } from './assignment';

export {
  generateHolisticCarePlan,
  convertHolisticToStandardPlan,
  mapModalityToType,
  mapStatusToStandard,
  calculateDueDate,
  calculateDateFromWeek,
  type HolisticGeneratedCarePlan,
} from './holistic';

export {
  analyzePatientData,
  identifySpecialties,
  detectSDoHNeeds,
  identifyMedicationIssues,
  identifyUrgentActions,
} from './analysis';

export { assembleCareTeam, buildCareTeamFromHolisticPlan } from './careTeam';
export { createReferralsForCareGaps, specialtyForGap } from './referrals';

export {
  determineOptimalModality,
  categorizeGap,
  generateTitleAndDescription,
  generateClinicalSummary,
  extractAddresses,
  bonusForProgram,
  PROGRAM_BONUS,
  SHARED_SAVINGS_FACTOR,
  HEALTH_PLAN_SHARE_REVENUE_THRESHOLD,
  type GapCategory,
} from './templates';

export {
  buildCitationIndex,
  withCitations,
  categorizeGoalForCitation,
  categorizeInterventionForCitation,
  CITATION_DISCLAIMER,
} from './citations';

export {
  validateGeneratedPlan,
  checkGoalsHaveInterventions,
  checkCitationCoverage,
  checkSdohDisposition,
  checkDataLimitations,
  type PlanValidationResult,
} from './validator';

export { toFhirCarePlan, toFhirGoal, type FhirCarePlanProjection } from './fhirMappers';
