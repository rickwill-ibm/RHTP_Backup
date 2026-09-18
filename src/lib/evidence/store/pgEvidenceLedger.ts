/**
 * Postgres-backed append-only evidence ledger (O-1, ADR-005).
 *
 * Implements the EXISTING `EvidenceStore` interface (save / get / list) so it
 * drops in behind the seam without touching callers. Every `save` writes a NEW
 * immutable row: a monotonic `seq`, a per-record `record_version`, attributed
 * `actor`, correlation id, and injected-clock `appendedAt`. There is no update
 * and no delete method — the only write is append. `get` returns the latest
 * snapshot for an id; `readLedger` returns the full ordered version history.
 *
 * Runs against real `pg` and in-process `pg-mem` alike (see PgLike).
 */
import * as clock from '@/lib/clock';
import type { EvidenceStore } from '../evidenceStore';
import type { EvidenceRecord } from '../evidenceRecord';
import type { LedgerEntry, LedgerProvenance, PgEvidenceLedgerOptions, PgLike } from './types';

/** Structural guard mirroring the file-store's isEvidenceRecord: reject foreign JSON. */
function isEvidenceRecord(v: unknown): v is EvidenceRecord {
  const r = v as Record<string, unknown> | null;
  return (
    !!r && typeof r.id === 'string' && typeof r.memberId === 'string' && Array.isArray(r.entries)
  );
}

/** node-postgres returns BIGINT as string; pg-mem as number. Normalize to number. */
function toNum(v: unknown): number {
  return typeof v === 'number' ? v : Number(v);
}

/** Actor for an append: the record's latest entry actor, else the configured floor. */
function actorFor(record: EvidenceRecord, floor: string): string {
  for (let i = record.entries.length - 1; i >= 0; i -= 1) {
    const a = record.entries[i]?.actor;
    if (a) return a;
  }
  return floor;
}

interface LedgerRow {
  seq: unknown;
  record_version: unknown;
  actor: string;
  correlation_id: string | null;
  appended_at: string | Date;
  payload: unknown;
}

function rowToProvenance(row: LedgerRow): LedgerProvenance {
  return {
    seq: toNum(row.seq),
    version: toNum(row.record_version),
    actor: row.actor,
    correlationId: row.correlation_id,
    appendedAt:
      row.appended_at instanceof Date ? row.appended_at.toISOString() : String(row.appended_at),
  };
}

function rowToRecord(row: LedgerRow): EvidenceRecord {
  const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
  if (!isEvidenceRecord(payload)) {
    throw new Error('evidence_ledger: stored payload is not a valid EvidenceRecord');
  }
  return payload;
}

/**
 * The append-only ledger. Returns an EvidenceStore plus append-only introspection
 * (`readLedger`, `maxSeq`). No mutation method is exposed by construction.
 */
export interface PgEvidenceLedger extends EvidenceStore {
  /** Full ordered version history for one record (oldest first). */
  readLedger(id: string): Promise<LedgerEntry[]>;
  /** Highest sequence assigned so far (0 when empty). */
  maxSeq(): Promise<number>;
}

export function createPgEvidenceLedger(
  pg: PgLike,
  options: PgEvidenceLedgerOptions = {}
): PgEvidenceLedger {
  const defaultActor = options.defaultActor ?? 'system';
  const correlationIdFor = options.correlationIdFor ?? ((r: EvidenceRecord) => r.id);

  return {
    /** Append a new immutable snapshot row. The next per-record version is derived
     *  atomically from a subselect, so concurrent appends land on distinct seqs
     *  and the unique (record_id, record_version) index rejects a racing dup. */
    async save(record: EvidenceRecord): Promise<void> {
      const payload = JSON.stringify(record);
      const actor = actorFor(record, defaultActor);
      const correlationId = correlationIdFor(record);
      const appendedAt = clock.nowIso();
      await pg.query(
        `INSERT INTO evidence_ledger
           (record_id, record_version, member_id, status, entry_count,
            payload, actor, correlation_id, appended_at)
         VALUES (
           $1,
           (SELECT COALESCE(MAX(record_version), 0) + 1
              FROM evidence_ledger WHERE record_id = $1),
           $2, $3, $4, $5, $6, $7, $8)`,
        [
          record.id,
          record.memberId,
          record.status,
          record.entries.length,
          payload,
          actor,
          correlationId,
          appendedAt,
        ]
      );
    },

    /** Latest snapshot for an id, or null. */
    async get(id: string): Promise<EvidenceRecord | null> {
      const res = await pg.query<LedgerRow>(
        `SELECT seq, record_version, actor, correlation_id, appended_at, payload
           FROM evidence_ledger
          WHERE record_id = $1
          ORDER BY seq DESC
          LIMIT 1`,
        [id]
      );
      const row = res.rows[0];
      return row ? rowToRecord(row) : null;
    },

    /** Distinct record ids present in the ledger. */
    async list(): Promise<string[]> {
      const res = await pg.query<{ record_id: string }>(
        `SELECT DISTINCT record_id FROM evidence_ledger ORDER BY record_id ASC`
      );
      return res.rows.map((r) => r.record_id);
    },

    async readLedger(id: string): Promise<LedgerEntry[]> {
      const res = await pg.query<LedgerRow>(
        `SELECT seq, record_version, actor, correlation_id, appended_at, payload
           FROM evidence_ledger
          WHERE record_id = $1
          ORDER BY seq ASC`,
        [id]
      );
      return res.rows.map((row) => ({
        provenance: rowToProvenance(row),
        record: rowToRecord(row),
      }));
    },

    async maxSeq(): Promise<number> {
      const res = await pg.query<{ m: unknown }>(
        `SELECT COALESCE(MAX(seq), 0) AS m FROM evidence_ledger`
      );
      return toNum(res.rows[0]?.m ?? 0);
    },
  };
}
