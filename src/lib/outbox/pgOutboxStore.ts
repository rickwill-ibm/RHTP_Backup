// SEAM: cdc-relay
/**
 * Postgres-backed OutboxStore. Runs against real Postgres in CI (testcontainers)
 * and against pg-mem in unit tests here — the same DDL and the same parametrized
 * SQL, no container required. The table is append-mostly (status/sequence/attempts
 * mutate in place; rows are never deleted — amendment §3: the outbox is the
 * sanctioned per-member ordered event history, retained per the audit policy).
 */
import type { OutboxIntentInput, OutboxIntentRow, OutboxStore, PgQueryable } from './types';

export const OUTBOX_DDL = `
CREATE TABLE IF NOT EXISTS outbox_intent (
  id                TEXT PRIMARY KEY,
  member_id         TEXT NOT NULL,
  event_type        TEXT NOT NULL,
  fhir_resource_id  TEXT NOT NULL,
  idempotency_key   TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL,
  sequence          INTEGER,
  attempts          INTEGER NOT NULL DEFAULT 0,
  actor             TEXT NOT NULL,
  correlation_id    TEXT NOT NULL,
  created_at_ms     BIGINT NOT NULL,
  updated_at_ms     BIGINT NOT NULL,
  envelope          JSONB NOT NULL,
  -- Per-member sequence is unique: two events can never share a (member, seq)
  -- slot. NULLs are distinct in SQL, so many pending rows (sequence NULL) coexist
  -- while confirmed rows are strictly ordered. This is the backstop that turns a
  -- concurrent same-member sequence collision into a caught error, not a dup.
  UNIQUE (member_id, sequence)
);`;

/** Ensure the schema exists (idempotent). Call once at store init. */
export async function ensureOutboxSchema(db: PgQueryable): Promise<void> {
  await db.query(OUTBOX_DDL);
}

/** True for a Postgres unique-constraint violation (real pg code 23505, or the
 * pg-mem error text) — the sequence-slot collision claimForConfirm retries. */
function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  if (code === '23505') return true;
  const msg = (err as { message?: unknown }).message;
  return typeof msg === 'string' && /unique|duplicate key/i.test(msg);
}

function toRow(r: Record<string, unknown>): OutboxIntentRow {
  const env = typeof r.envelope === 'string' ? JSON.parse(r.envelope) : r.envelope;
  return {
    id: String(r.id),
    memberId: String(r.member_id),
    eventType: String(r.event_type),
    fhirResourceId: String(r.fhir_resource_id),
    idempotencyKey: String(r.idempotency_key),
    status: r.status as OutboxIntentRow['status'],
    sequence: r.sequence === null || r.sequence === undefined ? null : Number(r.sequence),
    attempts: Number(r.attempts),
    actor: String(r.actor),
    correlationId: String(r.correlation_id),
    createdAtMs: Number(r.created_at_ms),
    updatedAtMs: Number(r.updated_at_ms),
    envelope: env as OutboxIntentInput,
  };
}

export function createPgOutboxStore(db: PgQueryable, id = 'pg-outbox'): OutboxStore {
  return {
    id,
    async enqueue(row) {
      const ins = await db.query(
        `INSERT INTO outbox_intent
           (id, member_id, event_type, fhir_resource_id, idempotency_key, status,
            sequence, attempts, actor, correlation_id, created_at_ms, updated_at_ms, envelope)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING *`,
        [
          row.id,
          row.memberId,
          row.eventType,
          row.fhirResourceId,
          row.idempotencyKey,
          row.status,
          row.sequence,
          row.attempts,
          row.actor,
          row.correlationId,
          row.createdAtMs,
          row.updatedAtMs,
          JSON.stringify(row.envelope),
        ]
      );
      // Real Postgres: a conflicting DO NOTHING returns 0 rows. pg-mem instead
      // returns the EXISTING row, so we detect dedupe by comparing ids, not count.
      if (ins.rows.length > 0) {
        const returned = toRow(ins.rows[0]);
        return { row: returned, deduped: returned.id !== row.id };
      }
      const existing = await db.query(`SELECT * FROM outbox_intent WHERE idempotency_key = $1`, [
        row.idempotencyKey,
      ]);
      return { row: toRow(existing.rows[0]), deduped: true };
    },
    async pendingForMember(memberId) {
      const r = await db.query(
        `SELECT * FROM outbox_intent WHERE member_id=$1 AND status='pending'
         ORDER BY created_at_ms ASC, id ASC`,
        [memberId]
      );
      return r.rows.map(toRow);
    },
    async confirmedForMember(memberId) {
      const r = await db.query(
        `SELECT * FROM outbox_intent WHERE member_id=$1 AND status='confirmed'
         ORDER BY sequence ASC`,
        [memberId]
      );
      return r.rows.map(toRow);
    },
    async nextSequence(memberId) {
      const r = await db.query(
        `SELECT COALESCE(MAX(sequence), -1) + 1 AS next FROM outbox_intent WHERE member_id=$1`,
        [memberId]
      );
      return Number(r.rows[0].next);
    },
    async claimForConfirm(id, memberId, nowMs) {
      // ONE statement does the compare-and-set AND the sequence assignment:
      //  - WHERE status='pending'  -> only the first worker to arrive matches;
      //    a re-run (writer vs sweep, or two instances) matches 0 rows -> null.
      //  - sequence = MAX+1 computed server-side, never a read-modify-write in app.
      // If two claims for DIFFERENT rows of the same member race and compute the
      // same MAX, the UNIQUE(member_id, sequence) constraint rejects the loser;
      // we retry, which re-reads the now-higher MAX. Bounded to avoid a hot spin.
      for (let attempt = 0; attempt < 16; attempt++) {
        try {
          const r = await db.query(
            `UPDATE outbox_intent
                SET status='confirmed',
                    sequence = COALESCE((SELECT MAX(sequence) FROM outbox_intent WHERE member_id=$1), -1) + 1,
                    updated_at_ms=$2
              WHERE id=$3 AND status='pending'
              RETURNING sequence`,
            [memberId, nowMs, id]
          );
          if (r.rows.length === 0) return null; // claim lost — someone else has it
          return Number(r.rows[0].sequence);
        } catch (err) {
          if (isUniqueViolation(err)) continue; // sequence collision — recompute
          throw err;
        }
      }
      // Exhausted retries under sustained contention: signal a lost claim rather
      // than risk a duplicate publish. The sweep will revisit the row.
      return null;
    },
    async update(id, patch) {
      const sets: string[] = [];
      const vals: unknown[] = [];
      let i = 1;
      for (const [k, v] of Object.entries(patch)) {
        const col = k === 'updatedAtMs' ? 'updated_at_ms' : k;
        sets.push(`${col}=$${i++}`);
        vals.push(v);
      }
      if (sets.length === 0) return;
      vals.push(id);
      await db.query(`UPDATE outbox_intent SET ${sets.join(', ')} WHERE id=$${i}`, vals);
    },
    async stalePending(olderThanMs) {
      const r = await db.query(
        `SELECT * FROM outbox_intent WHERE status='pending' AND created_at_ms < $1
         ORDER BY created_at_ms ASC`,
        [olderThanMs]
      );
      return r.rows.map(toRow);
    },
    async get(id) {
      const r = await db.query(`SELECT * FROM outbox_intent WHERE id=$1`, [id]);
      return r.rows.length ? toRow(r.rows[0]) : null;
    },
    async all() {
      const r = await db.query(
        `SELECT * FROM outbox_intent ORDER BY member_id ASC, sequence ASC NULLS LAST, created_at_ms ASC`
      );
      return r.rows.map(toRow);
    },
  };
}
