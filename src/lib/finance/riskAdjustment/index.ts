/**
 * finance/riskAdjustment — RADV-defensible risk-adjustment integrity (HW-FIN / I18),
 * program-spine contract C-SUB. MEAT + source-document linkage on capture; a
 * pre-submission scrub + diagnosis retract so only defensible diagnoses earn risk
 * revenue. Consumed by the encounter-submission pipeline and the risk-adjustment UI.
 */
export {
  assessRadvDefensibility,
  type MeatEvidence,
  type HccCapture,
  type RadvDefensibility,
} from './meat';
export {
  evaluateSubmission,
  retractDiagnosis,
  scrubForSubmission,
  type SubmissionDecision,
  type SubmissionBatchResult,
} from './submission';
export {
  icdCategory,
  icdChapter,
  rollupWithheldByCategory,
  type CategoryRollup,
} from './icdRollup';
