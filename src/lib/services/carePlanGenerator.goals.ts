/**
 * LEGACY DELEGATE (frozen, shrink-only — quality ratchet).
 * Logic moved to src/lib/carePlan (builder.ts / templates.ts / careTeam.ts).
 */
export {
  determineOptimalModality,
  generateGoals,
  generateInterventions,
  assembleCareTeam,
} from '@/lib/carePlan';
