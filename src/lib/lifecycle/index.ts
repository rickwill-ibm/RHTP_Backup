/**
 * Data-lifecycle — public surface (Wave C).
 *
 * Three governed capabilities over the platform's stores:
 *   1. RETENTION / PURGE over the mutable stores — policy-driven select
 *      (age / category / consent-withdrawal), legal-hold-aware, audited.
 *   2. RIGHT-TO-DELETE over the append-only evidence ledger — a governed
 *      tombstone that preserves immutability + auditability, never a row delete.
 *   3. LEGAL-HOLD — blocks both a purge and a right-to-delete (E9).
 */
export type {
  PurgeableItem,
  RetentionPolicy,
  PurgeSelection,
  PurgePlan,
  PurgeSource,
  PurgeResult,
  LegalHold,
  RightToDeleteRequest,
  RightToDeleteStatus,
  RightToDeleteResult,
  LifecycleAuditEvent,
} from './types';

export {
  selectByPolicy,
  selectByPolicies,
  itemMatchesPolicy,
  policyHasCriteria,
  validateRetentionPolicy,
  EmptyRetentionPolicyError,
} from './policy';

export {
  createLegalHoldRegistry,
  type LegalHoldRegistry,
  type PlaceHoldInput,
} from './legalHold';

export {
  planPurge,
  executePurge,
  runPurge,
  holdPredicate,
  type HoldPredicate,
} from './purge';

export {
  executeRightToDelete,
  isTombstoned,
  TOMBSTONE_MARKER,
  type LedgerLike,
} from './rightToDelete';

export {
  createFhirPurgeSource,
  type FhirPurgeSourceConfig,
} from './adapters/fhirPurgeSource';

export {
  auditPurged,
  auditHeldBack,
  auditRightToDelete,
  auditRightToDeleteBlocked,
  auditHoldPlaced,
  auditHoldReleased,
} from './audit';

// ── HW3 / I17: record lifecycle + content-hash idempotency (C-LIFE) ──────────
export {
  contentHash,
  classify,
  createMemoryRecordLifecycleStore,
  getRecordLifecycleStore,
  setProductionRecordLifecycleFactory,
  RecordLifecycleNotConfiguredError,
  _resetRecordLifecycleStore,
  type RecordStatus,
  type LifecycleDisposition,
  type RecordState,
  type ClassifyInput,
  type ClassifyResult,
  type RecordLifecycleStore,
} from './recordLifecycle';
