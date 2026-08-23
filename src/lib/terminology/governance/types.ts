/**
 * Value-set governance — domain types (I8A-iii Wave A).
 *
 * The lifecycle of ONE value-set VERSION and the immutable audit of how it moved
 * through that lifecycle. A version is proposed as a `draft`, submitted `in-review`
 * by its steward (the MAKER), then `approved` (becoming the single ACTIVE version)
 * or `rejected` by a reviewer (the CHECKER); an active version is later `retired`
 * or `superseded` when a newer version is approved.
 *
 * PHI-free by construction: a governance record carries value-set ids, versions,
 * lifecycle states, principal ids, and reasons — never member/clinical data.
 */
import type { GovernanceRole, GovernancePrincipal } from '@/lib/authz/principal/types';

export type { GovernanceRole, GovernancePrincipal };

/** The lifecycle states of one value-set version. `approved` IS the active state. */
export const LIFECYCLE_STATES = Object.freeze([
  'draft',
  'in-review',
  'approved',
  'rejected',
  'retired',
  'superseded',
] as const);
export type VersionLifecycleState = (typeof LIFECYCLE_STATES)[number];

/** The transition-driving actions. `supersede` is a system action (one-active rule). */
export const GOVERNANCE_ACTIONS = Object.freeze([
  'submit',
  'approve',
  'reject',
  'retire',
  'supersede',
] as const);
export type GovernanceAction = (typeof GOVERNANCE_ACTIONS)[number];

/** Approval posture. `maker-checker` (default) enforces separation of duties. */
export const APPROVAL_MODES = Object.freeze(['maker-checker', 'single-approver'] as const);
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

export interface GovernanceConfig {
  approvalMode: ApprovalMode;
}

/** The enforced default: maker-checker (the submitter cannot approve their own version). */
export const DEFAULT_GOVERNANCE_CONFIG: Readonly<GovernanceConfig> = Object.freeze({
  approvalMode: 'maker-checker',
});

/**
 * The materialized current state of one governed value-set version. Assets sharing
 * a `valueSetId` are versions of one logical value set; at most ONE is `approved`.
 * `system` is the terminology system key (e.g. 'ICD-10-CM') used for replay.
 */
export interface GovernedVersionRecord {
  valueSetId: string;
  version: string;
  system?: string;
  state: VersionLifecycleState;
  createdBy: string;
  createdAt: string;
  /** The MAKER: principal who submitted this version for review. */
  submittedBy?: string;
  submittedAt?: string;
  /** The CHECKER: principal who approved or rejected it. */
  decidedBy?: string;
  decidedAt?: string;
  updatedAt: string;
}

/**
 * One immutable audit entry for a single lifecycle transition. Appended to the
 * ledger, never mutated (the same append-only discipline as the evidence ledger:
 * lib/evidence/evidenceRecord.ts). PHI-free.
 */
export interface GovernanceTransitionRecord {
  /** Monotonic sequence within the ledger (append order). */
  seq: number;
  valueSetId: string;
  version: string;
  action: GovernanceAction;
  from: VersionLifecycleState;
  to: VersionLifecycleState;
  /** Acting principal id (matched for separation of duties). */
  principalId: string;
  /** Acting role, or 'system' for the automatic supersede transition. */
  principalRole: GovernanceRole | 'system';
  reason?: string;
  /** ISO timestamp via the injected clock. */
  at: string;
}

// ── errors ─────────────────────────────────────────────────────────────────────

/** Thrown when an action is not permitted from the version's current state. */
export class IllegalTransitionError extends Error {
  readonly from: VersionLifecycleState;
  readonly action: GovernanceAction;
  constructor(from: VersionLifecycleState, action: GovernanceAction) {
    super(`Illegal value-set lifecycle transition: cannot '${action}' from state '${from}'.`);
    this.name = 'IllegalTransitionError';
    this.from = from;
    this.action = action;
  }
}

/** Thrown when maker-checker separation of duties is violated (ENFORCED, not advisory). */
export class MakerCheckerViolationError extends Error {
  readonly reasonCode: 'self-approval' | 'not-a-reviewer';
  constructor(reasonCode: 'self-approval' | 'not-a-reviewer', detail: string) {
    super(`Maker-checker violation (${reasonCode}): ${detail}`);
    this.name = 'MakerCheckerViolationError';
    this.reasonCode = reasonCode;
  }
}

/** Thrown when a referenced value-set version is not registered in governance. */
export class VersionNotFoundError extends Error {
  readonly valueSetId: string;
  readonly version: string;
  constructor(valueSetId: string, version: string) {
    super(`Governed value-set version not found: '${valueSetId}' @ '${version}'.`);
    this.name = 'VersionNotFoundError';
    this.valueSetId = valueSetId;
    this.version = version;
  }
}
