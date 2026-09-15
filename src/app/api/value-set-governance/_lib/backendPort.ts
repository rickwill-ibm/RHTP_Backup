/**
 * Value-set governance backend PORT (Iteration 8a-iii, Wave C — BFF/authz).
 *
 * This is the CONTRACT the BFF routes call for every lifecycle state change.
 * The IMPLEMENTATION is owned by Wave A (src/lib/terminology/governance):
 * lifecycle (submit/reject/retire), approval (approve + maker-checker), replay
 * (rebind a chosen version), and history. Wave C does NOT implement or duplicate
 * that logic — it authorizes + validates and then delegates through this port.
 *
 * INTEGRATION POINT: when Wave A publishes src/lib/terminology/governance, wire
 * its facade into the routes with a single call:
 *
 *     import { registerGovernanceBackend } from '.../_lib/backendAdapter';
 *     import { valueSetGovernanceBackend } from '@/lib/terminology/governance';
 *     registerGovernanceBackend(valueSetGovernanceBackend);
 *
 * The routes depend ONLY on this port, so no route changes when Wave A lands.
 * Until then a clearly-labeled in-memory integration double stands in (see
 * backendAdapter.ts) so this slice compiles, tests, and role-gates on its own.
 */

/** Lifecycle state of a governed value-set version. Mirrors Wave A's model. */
export type GovernanceState = 'draft' | 'pending-approval' | 'approved' | 'rejected' | 'retired';

/** A PHI-free governance record for one value-set logical id. */
export interface GovernanceRecord {
  valueSetId: string;
  version: string;
  state: GovernanceState;
  /** Stable id of the principal who submitted (Practitioner reference). */
  submittedBy?: string;
  /** Stable id of the principal who approved. */
  approvedBy?: string;
  /** ISO timestamp of the last state transition. */
  updatedAt: string;
}

/** One PHI-free entry in the governance audit history. */
export interface GovernanceHistoryEntry {
  at: string;
  actor: string;
  action: 'submit' | 'approve' | 'reject' | 'retire' | 'replay';
  fromState: GovernanceState | null;
  toState: GovernanceState;
  note?: string;
}

/** The binding a replay resolves for the chosen value-set version. */
export interface ReplayBinding {
  valueSetId: string;
  /** The version the caller chose to replay. */
  version: string;
  /** The version the resolver bound to (the chosen version, echoed for proof). */
  boundVersion: string;
  /** The active governance state of the bound version. */
  state: GovernanceState;
  resolvedAt: string;
}

/** Common input for a lifecycle mutation. */
export interface GovernanceMutationInput {
  valueSetId: string;
  version: string;
  /** Acting principal id (never PHI). */
  actor: string;
  correlationId: string;
}

/** Input for approve/reject — no version needed (acts on the pending record). */
export interface GovernanceDecisionInput {
  valueSetId: string;
  actor: string;
  correlationId: string;
}

/**
 * The governance backend facade the BFF calls. Wave A implements this; Wave C
 * consumes it. Every method is PHI-free (ids/versions/states only).
 */
export interface GovernanceBackend {
  /** STEWARD: submit a value-set version for review. */
  submit(input: GovernanceMutationInput): GovernanceRecord;
  /** REVIEWER: approve the pending version (backend also enforces maker-checker). */
  approve(input: GovernanceDecisionInput): GovernanceRecord;
  /** STEWARD: reject the pending version. */
  reject(input: GovernanceDecisionInput): GovernanceRecord;
  /** STEWARD: retire an approved/active version. */
  retire(input: GovernanceMutationInput): GovernanceRecord;
  /** STEWARD or REVIEWER: replay a chosen version and return its binding. */
  replay(valueSetId: string, version: string): ReplayBinding;
  /** STEWARD or REVIEWER: read the PHI-free governance history. */
  history(valueSetId: string): GovernanceHistoryEntry[];
  /** Current record for a value-set id (used by the route's maker-checker gate). */
  getRecord(valueSetId: string): GovernanceRecord | undefined;
  /** Whether maker-checker separation-of-duties is enforced. */
  makerCheckerEnabled(): boolean;
}

/** Thrown by the backend when an operation is invalid for the current state. */
export class GovernanceStateError extends Error {
  readonly code: string;
  constructor(message: string, code = 'conflict') {
    super(message);
    this.name = 'GovernanceStateError';
    this.code = code;
  }
}
