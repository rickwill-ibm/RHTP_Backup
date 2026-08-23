// CONTRACT: C2  // CONTRACT: C6  // SEAM: idempotency-store
/**
 * Durable consumer-idempotency store types (NS-04 fix).
 *
 * The outbox relay is at-least-once: a confirmed C2 event can be republished
 * (writer racing the reconciliation sweep, a consumer crash between effect and
 * offset commit, a partition rebalance). Without a durable dedupe a republish
 * double-produces signals (SDE intake) and double-sends outreach/referral
 * effects (the agents). The prior guard was a `Set` local to ONE function call,
 * so it protected only within a single in-process fold and vanished on the next
 * delivery.
 *
 * This seam is the durable replacement: a per-consumer namespace of processed
 * eventIds, with an ATOMIC check-and-set (`markProcessed`) built on the same
 * insert-if-absent pattern the outbox uses (INSERT ... ON CONFLICT DO NOTHING),
 * so a real concurrent double-delivery is deduped to exactly one winner.
 *
 * Per-consumer namespace: the SDE intake and EACH agent dedupe independently, so
 * the same eventId processed by `sde-intake` does not suppress the outreach
 * agent's own handling of it. A consumer id is a stable string (e.g.
 * 'sde-intake', 'outreach-agent', 'referral-coordination-agent').
 */

/** Minimal `pg`-compatible query surface (real pg Pool and pg-mem both satisfy it). */
export interface PgQueryable {
  query(text: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** Outcome of an atomic check-and-set. */
export interface MarkResult {
  /**
   * True when THIS call was the first to claim (consumer, eventId) — the caller
   * owns the effect and must proceed. False when the pair was already marked (a
   * duplicate / republish) — the caller must SKIP the effect. Exactly one
   * concurrent caller for the same pair sees `true`.
   */
  firstProcessed: boolean;
}

/**
 * A durable, per-consumer idempotency store. Two operations:
 *   - markProcessed  — atomic claim (check-and-set). The dedupe primitive.
 *   - isProcessed    — read-only probe (diagnostics / conditional flows).
 *
 * markProcessed is the load-bearing one: NEVER gate an effect on
 * `isProcessed` then `markProcessed` as two steps (a TOCTOU race two deliveries
 * can both pass). Call markProcessed once and branch on `firstProcessed`.
 */
export interface IdempotencyStore {
  readonly id: string;
  /**
   * Atomically record (consumer, eventId) as processed. Insert-if-absent:
   * returns `{ firstProcessed: true }` for the winner that inserted the row,
   * `{ firstProcessed: false }` for every later or losing caller.
   */
  markProcessed(consumer: string, eventId: string): Promise<MarkResult>;
  /** True when (consumer, eventId) is already marked. Read-only, no mutation. */
  isProcessed(consumer: string, eventId: string): Promise<boolean>;
}
