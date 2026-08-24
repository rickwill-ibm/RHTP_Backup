/**
 * finance/submission — encounter-submission pipeline + COB (HW-FIN-B / I24),
 * contract C-SUB pipeline half. Only ACCEPTED encounters earn risk revenue.
 */
export {
  buildBatch,
  reconcile,
  buildResubmission,
  type EncounterSubmission,
  type Acknowledgment,
  type SubmissionBatch,
  type ReconResult,
  type SubmissionStatus,
  type AckLevel,
} from './pipeline';
export { orderOfBenefits, primaryPayer, type Coverage, type CobOrder } from './cob';
