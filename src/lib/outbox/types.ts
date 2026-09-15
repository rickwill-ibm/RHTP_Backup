// CONTRACT: C2  // CONTRACT: C10  // SEAM: cdc-relay
/**
 * Outbox-intent propagation types (ADR-006 as amended by amendment-001 §2).
 *
 * Dual-write is BANNED. Every record change is born as a transactional intent
 * row committed to the application Postgres FIRST; the FHIR write follows over
 * the REST seam idempotently; a C2 event is published ONLY after the FHIR write
 * is confirmed; ordering is per-member FIFO by an outbox-assigned sequence.
 *
 * This file declares the wire types and the four seams the mechanism rides on:
 *   OutboxStore   — the transactional intent table (pg / in-memory).
 *   FhirApplier   — idempotent PUT-to-deterministic-id over the FHIR REST seam.
 *   EventPublisher— the Kafka-API backbone relay target (SEAM: event-backbone).
 *   AlarmSink / QuarantineSink — where exhausted intents raise.
 */

/** C2 event envelope (contracts.md C2). PHI-minimal payload: codes + refs only. */
export interface C2Event {
  eventId: string;
  eventType: string;
  eventVersion: string;
  occurredAt: string;
  recordedAt: string;
  memberId: string;
  partitionKey: string;
  class: 'stream' | 'batch';
  sequence?: number;
  correlationId: string;
  causationId?: string;
  idempotencyKey: string;
  source: { system: string; feed: string; batchId?: string; tier?: 'T1' | 'T2' | 'T3' };
  consentContext: { part2Restricted: boolean; segmentLabels?: string[] };
  payload: Record<string, unknown>;
}

/** Intent lifecycle: pending -> confirmed -> published, or terminally failed. */
export type IntentStatus = 'pending' | 'confirmed' | 'published' | 'failed';

/** What a writer submits to birth an intent (step 1, the transactional anchor). */
export interface OutboxIntentInput {
  memberId: string;
  eventType: string;
  /** Deterministic FHIR resource id the idempotent PUT targets (step 2). */
  fhirResourceId: string;
  /** Dedupe key: a re-submitted intent with the same key is a no-op. */
  idempotencyKey: string;
  actor: string;
  correlationId: string;
  causationId?: string;
  class: 'stream' | 'batch';
  source: C2Event['source'];
  consentContext: C2Event['consentContext'];
  eventVersion?: string;
  occurredAt?: string;
  payload: Record<string, unknown>;
}

/** A persisted intent row. `sequence` is null until confirmed (assigned per member). */
export interface OutboxIntentRow {
  id: string;
  memberId: string;
  eventType: string;
  fhirResourceId: string;
  idempotencyKey: string;
  status: IntentStatus;
  sequence: number | null;
  attempts: number;
  actor: string;
  correlationId: string;
  createdAtMs: number;
  updatedAtMs: number;
  /** The frozen C2 payload/envelope-seed captured at intent time. */
  envelope: OutboxIntentInput;
}

/** Minimal `pg`-compatible query surface (real pg Pool and pg-mem both satisfy it). */
export interface PgQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/**
 * The intent table seam. Every method is transactional at the row level; the
 * pg implementation makes enqueue atomic (unique idempotencyKey) and sequence
 * assignment single-writer per member.
 */
export interface OutboxStore {
  readonly id: string;
  /** Step 1: commit a pending intent. Idempotent on idempotencyKey. */
  enqueue(row: OutboxIntentRow): Promise<{ row: OutboxIntentRow; deduped: boolean }>;
  /** Pending intents for one member, oldest first (FIFO drain order). */
  pendingForMember(memberId: string): Promise<OutboxIntentRow[]>;
  /** Confirmed-but-unpublished intents for one member, sequence order. */
  confirmedForMember(memberId: string): Promise<OutboxIntentRow[]>;
  /** Next per-member sequence: max(sequence for member) + 1, min 0. */
  nextSequence(memberId: string): Promise<number>;
  /**
   * Atomic claim + sequence assignment (amendment §2 step 3, hardened for real
   * multi-writer Postgres). Compare-and-set: flip exactly one `pending` row to
   * `confirmed` and stamp its next per-member sequence in a SINGLE statement, so
   * the live writer and the reconciliation sweep can never both claim the same
   * intent. Returns the assigned sequence, or null when the claim was LOST (the
   * row was no longer `pending` — another worker got there first). This is the
   * data-layer guarantee that each event publishes exactly once.
   */
  claimForConfirm(id: string, memberId: string, nowMs: number): Promise<number | null>;
  /** Mutate status / sequence / attempts of one intent. */
  update(
    id: string,
    patch: Partial<Pick<OutboxIntentRow, 'status' | 'sequence' | 'attempts' | 'updatedAtMs'>>
  ): Promise<void>;
  /** Pending intents older than `olderThanMs` (the sweep's orphan candidates). */
  stalePending(olderThanMs: number): Promise<OutboxIntentRow[]>;
  /** Read one row (test + reconciliation support). */
  get(id: string): Promise<OutboxIntentRow | null>;
  /** All rows (test + replay support), ordered by member then sequence/created. */
  all(): Promise<OutboxIntentRow[]>;
}

/** Idempotent FHIR write over the REST seam (PUT to the deterministic id).
 * The apply targets the RESOURCE (payload), which is why it precedes sequence
 * assignment (amendment §2: step 2 apply, then step 3 confirm+sequence). */
export interface FhirApplier {
  readonly id: string;
  /** Idempotent apply. Returns the versionId on a 2xx commit; throws on failure. */
  apply(resourceId: string, intent: OutboxIntentInput): Promise<{ versionId: string }>;
  /** Does a resource already exist at this id? Used by the sweep after a crash. */
  exists(resourceId: string): Promise<boolean>;
}

/** The relay target: the Kafka-API backbone. Publishes confirmed events in order. */
export interface EventPublisher {
  readonly id: string;
  publish(event: C2Event): Promise<void>;
}

export interface AlarmSink {
  raise(alarm: { code: string; intentId: string; memberId: string; detail: string }): void;
}

export interface QuarantineSink {
  add(item: { intentId: string; memberId: string; reasonCode: string; attempts: number }): void;
}

/** Everything the writer / sweep need injected. Clock/rng come from clock.ts. */
export interface OutboxDeps {
  store: OutboxStore;
  fhir: FhirApplier;
  publisher: EventPublisher;
  now: () => number;
  rng: () => number;
  alarm?: AlarmSink;
  quarantine?: QuarantineSink;
  /** Retry budget before a pending intent goes terminally failed. Default 5. */
  maxAttempts?: number;
}
