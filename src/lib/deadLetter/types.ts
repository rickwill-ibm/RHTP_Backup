/**
 * Dead-letter / held-review store — shared types (register finding NS-01).
 *
 * The pipeline builds three kinds of record that were, before this subsystem,
 * RETURNED then DROPPED — so a held member silently disappeared:
 *   - `quarantine`     structural (stage 2) + profile/semantic (stage 4) rejects;
 *   - `held-identity`  an inbound record whose subject scored in the EMPI
 *                      possible-match band (60-90), diverted from auto-linking;
 *   - `failed-outbox`  an outbox intent whose retry budget was exhausted.
 *
 * This module gives them ONE durable, append-only home plus an operator surface.
 * Every field is PHI-safe by construction: ids, codes, and references only —
 * never a name, DOB, SSN, or raw clinical payload (the litmus-test trust
 * guarantee). `memberRef` is an ANCHORED member id (mem-xxxx) or a source handle,
 * `payloadRef` is a stable reference to where the raw record lives, never the
 * record itself.
 *
 * The pg surface mirrors the evidence ledger (PgLike) so the same store code runs
 * against real `pg` and the in-process `pg-mem` test engine.
 */

/** The three record kinds this store persists (register-pinned enum). */
export const DEAD_LETTER_KINDS = Object.freeze([
  'quarantine',
  'held-identity',
  'failed-outbox',
] as const);
export type DeadLetterKind = (typeof DEAD_LETTER_KINDS)[number];

/** Lifecycle: open until a reviewer resolves / dismisses / retries it. */
export const DEAD_LETTER_STATUSES = Object.freeze([
  'open',
  'resolved',
  'dismissed',
  'retried',
] as const);
export type DeadLetterStatus = (typeof DEAD_LETTER_STATUSES)[number];

/** The three audited resolution actions a reviewer can take (register-pinned). */
export const RESOLUTION_ACTIONS = Object.freeze(['retry', 'resolve', 'dismiss'] as const);
export type ResolutionAction = (typeof RESOLUTION_ACTIONS)[number];

/** Map a resolution action to the terminal status it drives. */
export const STATUS_FOR_ACTION: Readonly<Record<ResolutionAction, DeadLetterStatus>> = Object.freeze({
  retry: 'retried',
  resolve: 'resolved',
  dismiss: 'dismissed',
});

/**
 * One dead-letter record. Immutable once appended; a resolution appends a NEW
 * version rather than mutating the row, so the full history is preserved.
 * PHI-SAFE: every field is an id / code / reference.
 */
export interface DeadLetterRecord {
  /** Stable id, deterministic from (kind, sourceRef) unless supplied. */
  id: string;
  kind: DeadLetterKind;
  status: DeadLetterStatus;
  /** Anchored member id (mem-xxxx) or a PHI-safe source handle. Never raw PHI. */
  memberRef: string;
  /** Structured, PHI-safe reason, e.g. 'identity-possible-match', 'missing-field'. */
  reasonCode: string;
  /** PHI-free stable handle to the source record (row index, control id, intent id). */
  sourceRef: string;
  /** PHI-safe reference to where the raw record lives. Never the raw payload. */
  payloadRef: string;
  /** ISO-8601, injected-clock. */
  createdAt: string;
  /** Set on resolution. */
  resolvedAt: string | null;
  /** Actor who resolved it (ops principal id). */
  resolvedBy: string | null;
  /** The action that resolved it. */
  resolutionAction: ResolutionAction | null;
}

/** What a producer appends. `createdAt` defaults to the injected clock. */
export interface DeadLetterAppendInput {
  kind: DeadLetterKind;
  memberRef: string;
  reasonCode: string;
  sourceRef: string;
  payloadRef: string;
  /** Optional explicit id (else derived deterministically from kind + sourceRef). */
  id?: string;
  /** Optional explicit creation timestamp (else clock.nowIso()). */
  createdAt?: string;
}

/** Filter for list(): by kind and/or status. Omit a field to match all. */
export interface DeadLetterFilter {
  kind?: DeadLetterKind;
  status?: DeadLetterStatus;
}

/**
 * The durable store seam. Append + list + get + resolve. There is no update or
 * delete: a resolution is a new append (immutable history).
 */
export interface DeadLetterStore {
  /** Append a new open record (or a fresh version). Returns the stored record. */
  append(input: DeadLetterAppendInput): Promise<DeadLetterRecord>;
  /** Latest snapshot of every record, filtered by kind/status. Newest first. */
  list(filter?: DeadLetterFilter): Promise<DeadLetterRecord[]>;
  /** Latest snapshot for one id, or null. */
  get(id: string): Promise<DeadLetterRecord | null>;
  /**
   * Resolve one record: append a new version with the terminal status for the
   * action, stamped resolvedAt/resolvedBy. Returns the new snapshot, or null when
   * the id is unknown. A record that is already resolved/dismissed is returned
   * unchanged (no double-resolve).
   */
  resolve(id: string, action: ResolutionAction, actor: string): Promise<DeadLetterRecord | null>;
}

/** The subset of node-postgres the store depends on (pg Pool and pg-mem satisfy it). */
export interface PgQueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount?: number | null;
}

export interface PgLike {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<PgQueryResult<Row>>;
}

/** Type guards for the enums (route input validation). */
export function isDeadLetterKind(v: unknown): v is DeadLetterKind {
  return typeof v === 'string' && (DEAD_LETTER_KINDS as readonly string[]).includes(v);
}
export function isDeadLetterStatus(v: unknown): v is DeadLetterStatus {
  return typeof v === 'string' && (DEAD_LETTER_STATUSES as readonly string[]).includes(v);
}
export function isResolutionAction(v: unknown): v is ResolutionAction {
  return typeof v === 'string' && (RESOLUTION_ACTIONS as readonly string[]).includes(v);
}

/** Stable non-crypto content hash (djb2, hex) for deterministic ids. */
export function stableHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

/** Deterministic id for a record: dl-{kind-tag}-{hash(kind:sourceRef)}. */
export function deadLetterIdFor(kind: DeadLetterKind, sourceRef: string): string {
  const tag = kind === 'held-identity' ? 'hold' : kind === 'failed-outbox' ? 'out' : 'quar';
  return `dl-${tag}-${stableHash(`${kind}:${sourceRef}`)}`;
}
