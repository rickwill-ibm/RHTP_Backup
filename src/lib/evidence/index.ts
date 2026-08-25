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
  toAuditEvents,
  type EvidenceRecord,
  type EvidenceEntry,
  type EvidenceEntryType,
  type EvidenceStage,
  type EvidenceStatus,
  type EvidenceSummary,
  type EvidenceApprover,
  type GoldCardEvidence,
  type OrderRef,
} from './evidenceRecord';
