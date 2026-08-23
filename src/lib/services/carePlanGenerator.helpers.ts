/**
 * LEGACY DELEGATE (frozen, shrink-only — quality ratchet).
 * Logic moved to src/lib/carePlan (analysis.ts / builder.ts / referrals.ts).
 */
export {
  createInterventionId,
  assignInterventionsToGoals,
  createReferralsForCareGaps,
  analyzePatientData,
  identifySpecialties,
  detectSDoHNeeds,
  identifyMedicationIssues,
  identifyUrgentActions,
} from '@/lib/carePlan';
