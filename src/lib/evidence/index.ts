/**
 * Golden Thread Evidence Record — public surface (increment GT-2).
 */
export {
  createEvidenceRecord,
  appendEntry,
  withStatus,
  recordDetermination,
  recordGoldCard,
  recordPasSubmission,
  entriesForStage,
  latestOfType,
  summarize,
  type EvidenceRecord,
  type EvidenceEntry,
  type EvidenceEntryType,
  type EvidenceStage,
  type EvidenceStatus,
  type EvidenceSummary,
  type EvidenceApprover,
  type GoldCardEvidence,
  type GovernedActionType,
  type OrderRef,
} from './evidenceRecord';

export { toAuditEvents } from './auditProjection';

export {
  recordPasDecision,
  recordClaimSubmission,
  recordRemittance,
  recordReconciliation,
  recordRecovery,
  recordRecoveryTerminal,
  recordSubmission,
  recordGovernedAction,
  hasEntryId,
} from './financialRecorders';

export {
  entryHash,
  chainOfRecord,
  sealRecord,
  verifyLedgerIntegrity,
  type LedgerSeal,
  type SigningKey,
} from './ledgerIntegrity';

export { loadVerifiedRecord, type StoredIntegrity, type VerifiedRecord } from './verifyStored';

export { tierOfEntry, computeProcessTier, type ProcessTierScope } from './tier';
export {
  EVIDENCE_TIER_ORDER,
  RUNG_ORDER,
  TIER_RUNG_CEILING,
  type EvidenceTier,
  type AuthorityRung,
} from './tierConfig';
