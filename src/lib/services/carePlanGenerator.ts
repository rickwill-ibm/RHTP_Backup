/**
 * LEGACY DELEGATE (frozen, shrink-only — quality ratchet).
 * The care-plan generator now lives in src/lib/carePlan (Cycle 2 split:
 * builder / validator / templates). This file only preserves the historical
 * import path; new code imports from '@/lib/carePlan' directly.
 */
export { generateComprehensiveCarePlan, generateHolisticCarePlan } from '@/lib/carePlan';
export type {
  ComprehensivePlanInput,
  QualityMeasureImpact,
  GeneratedCarePlan,
} from '@/lib/carePlan';
