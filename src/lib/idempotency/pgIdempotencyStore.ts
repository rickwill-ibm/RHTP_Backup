// SEAM: idempotency-store
/**
 * Postgres-backed IdempotencyStore. Runs against real Postgres in CI
 * (testcontainers) and against pg-mem in unit tests here — the SAME DDL and the
 * SAME parametrized SQL, no container required.
 *
 * The dedupe primitive is the composite PRIMARY KEY (consumer, event_id): a
 * plain INSERT that a real concurrent double-delivery races on. The constraint
 * lets exactly one row land; the loser's INSERT raises a unique violation, which
 * we translate to `firstProcessed: false`. (We catch the violation rather than
 * use ON CONFLICT DO NOTHING RETURNING because pg-mem returns the EXISTING row on
 * conflict — the same quirk the outbox store documents — so a RETURNING row-count
 * cannot portably tell winner from loser. The raise-and-catch is identical across
 * real Postgres and pg-mem.) Rows are append-only — a monotone processed-set.
 */
import type { IdempotencyStore, MarkResult, PgQueryable } from './types';

/** True for a Postgres unique-constraint violation (real pg 23505, or pg-mem text). */
function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  if ((err as { code?: unknown }).code === '23505') return true;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === 'string' && /unique|duplicate key|primary key|conflict/i.test(msg);
}

export const IDEMPOTENCY_DDL = `
CREATE TABLE IF NOT EXISTS idempotency_marker (
  consumer        TEXT   NOT NULL,
  event_id        TEXT   NOT NULL,
  processed_at_ms BIGINT NOT NULL,
  -- Per-consumer namespace: the SAME event_id is an independent marker for each
  -- consumer, so the SDE and every agent dedupe in isolation. The composite key
  -- is the atomic check-and-set backstop: two concurrent deliveries of one
  -- (consumer, event_id) can never both insert — exactly one wins, one no-ops.
  PRIMARY KEY (consumer, event_id)
);`;

/** Ensure the schema exists (idempotent). Call once at store init. */
export async function ensureIdempotencySchema(db: PgQueryable): Promise<void> {
  await db.query(IDEMPOTENCY_DDL);
}

export interface PgIdempotencyOptions {
  /** Injected clock (deterministic tests). Defaults to Date.now. */
  now?: () => number;
}

export function createPgIdempotencyStore(
  db: PgQueryable,
  id = 'pg-idempotency',
  opts: PgIdempotencyOptions = {},
): IdempotencyStore {
  const now = opts.now ?? (() => Date.now());
  return {
    id,
    async markProcessed(consumer, eventId): Promise<MarkResult> {
      try {
        await db.query(
          `INSERT INTO idempotency_marker (consumer, event_id, processed_at_ms)
           VALUES ($1, $2, $3)`,
          [consumer, eventId, now()],
        );
        return { firstProcessed: true };
      } catch (err) {
        if (isUniqueViolation(err)) return { firstProcessed: false }; // already marked
        throw err;
      }
    },
    async isProcessed(consumer, eventId): Promise<boolean> {
      const r = await db.query(
        `SELECT 1 FROM idempotency_marker WHERE consumer = $1 AND event_id = $2`,
        [consumer, eventId],
      );
      return r.rows.length > 0;
    },
  };
}
