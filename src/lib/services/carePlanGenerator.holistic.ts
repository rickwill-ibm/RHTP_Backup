/**
 * LEGACY DELEGATE (frozen, shrink-only — quality ratchet).
 * Logic moved to src/lib/carePlan/holistic.ts.
 */
export {
  convertHolisticToStandardPlan,
  mapModalityToType,
  calculateDueDate,
  calculateDateFromWeek,
  buildCareTeamFromHolisticPlan,
  mapStatusToStandard,
} from '@/lib/carePlan';
