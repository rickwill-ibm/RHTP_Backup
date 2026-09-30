// SEAM: credentialing  (dataMode)
/**
 * Reviewer qualification (C-REVQUAL) — public surface.
 *
 * The executable form of 42 CFR 438.210(b)(3) (initial determination: appropriate expertise in the
 * enrollee's medical, behavioral health, or LTSS needs) and 42 CFR 438.406(b)(2) (appeal: not
 * involved in a prior level, not a subordinate of someone who was, and clinical expertise AS
 * DETERMINED BY THE STATE). See `types.ts` for what the adversarial-BEFORE round changed and why,
 * and `FAKE_FIDELITY.md` for what the seeded source does not do.
 */
export type {
  NeedDomain,
  DeterminationClass,
  ReviewerLicence,
  BoardCertification,
  ExpertiseAttestation,
  CredentialRecord,
  QualificationRefusalCode,
} from './types';
export { ReviewerNotQualifiedError, CredentialingNotConfiguredError } from './types';
export type {
  ReviewRequirement,
  InitialDeterminationRequirement,
  AppealReviewRequirement,
} from './requirement';
export {
  FEDERAL_INITIAL_STANDARD,
  ADMINISTRATIVE_STANDARD,
  MAX_CREDENTIAL_AGE_MS,
} from './requirement';
export {
  getCredentialingSource,
  setProductionCredentialingSource,
  seededCredentialingSource,
  type CredentialingSource,
} from './source';
export { assertReviewerQualified, isMintedProof, proofCovers } from './assertReviewerQualified';
export type {
  QualifiedReviewer,
  QualificationVerdict,
  ProofScope,
} from './assertReviewerQualified';
export { SEED_CREDENTIAL_RECORDS, SEED_EPOCH_MS } from './seedDirectory';
