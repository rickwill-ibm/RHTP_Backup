/**
 * Postgres-backed dead-letter store (NS-01).
 *
 * Implements the SAME `DeadLetterStore` interface as the in-memory store, so it
 * drops in behind the seam without touching callers. Append-only: every append
 * (a creation or a resolution) writes a NEW immutable row with a monotonic `seq`
 * and a per-record `record_version` derived atomically from a subselect, so
 * concurrent appends land on distinct versions and the unique
 * (record_id, record_version) index rejects a racing duplicate. There is no
 * UPDATE and no DELETE path — the only write is INSERT.
 *
 * Runs against real `pg` and in-process `pg-mem` alike (see PgLike). `list`
 * reduces to the latest snapshot per record_id in JS (portable across both
 * engines rather than relying on DISTINCT ON).
 */
import * as clock from '@/lib/clock';
import {
  deadLetterIdFor,
  STATUS_FOR_ACTION,
  type DeadLetterAppendInput,
  type DeadLetterFilter,
  type DeadLetterRecord,
  type DeadLetterStore,
  type PgLike,
  type ResolutionAction,
} from './types';

interface DlRow {
  record_id: string;
  kind: string;
  status: string;
  member_ref: string;
  reason_code: string;
  source_ref: string;
  payload_ref: string;
  created_at: string | Date;
  resolved_at: string | Date | null;
  resolved_by: string | null;
  resolution_action: string | null;
}

function iso(v: string | Date | null): string | null {
  if (v === null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

function rowToRecord(row: DlRow): DeadLetterRecord {
  return {
    id: row.record_id,
    kind: row.kind as DeadLetterRecord['kind'],
    status: row.status as DeadLetterRecord['status'],
    memberRef: row.member_ref,
    reasonCode: row.reason_code,
    sourceRef: row.source_ref,
    payloadRef: row.payload_ref,
    createdAt: iso(row.created_at) as string,
    resolvedAt: iso(row.resolved_at),
    resolvedBy: row.resolved_by,
    resolutionAction: row.resolution_action as DeadLetterRecord['resolutionAction'],
  };
}

const SELECT_COLS =
  'record_id, kind, status, member_ref, reason_code, source_ref, payload_ref, ' +
  'created_at, resolved_at, resolved_by, resolution_action';

function isTerminal(status: string): boolean {
  return status === 'resolved' || status === 'dismissed' || status === 'retried';
}

export function createPgDeadLetterStore(pg: PgLike): DeadLetterStore {
  async function latestRow(id: string): Promise<DlRow | null> {
    const res = await pg.query<DlRow>(
      `SELECT ${SELECT_COLS} FROM dead_letter WHERE record_id = $1 ORDER BY seq DESC LIMIT 1`,
      [id],
    );
    return res.rows[0] ?? null;
  }

  return {
    async append(input: DeadLetterAppendInput): Promise<DeadLetterRecord> {
      const id = input.id ?? deadLetterIdFor(input.kind, input.sourceRef);
      const createdAt = input.createdAt ?? clock.nowIso();
      const appendedAt = clock.nowIso();
      await pg.query(
        `INSERT INTO dead_letter
           (record_id, record_version, kind, status, member_ref, reason_code,
            source_ref, payload_ref, created_at, resolved_at, resolved_by,
            resolution_action, appended_at)
         VALUES (
           $1,
           (SELECT COALESCE(MAX(record_version), 0) + 1 FROM dead_letter WHERE record_id = $1),
           $2, 'open', $3, $4, $5, $6, $7, NULL, NULL, NULL, $8)`,
        [id, input.kind, input.memberRef, input.reasonCode, input.sourceRef, input.payloadRef, createdAt, appendedAt],
      );
      return {
        id,
        kind: input.kind,
        status: 'open',
        memberRef: input.memberRef,
        reasonCode: input.reasonCode,
        sourceRef: input.sourceRef,
        payloadRef: input.payloadRef,
        createdAt,
        resolvedAt: null,
        resolvedBy: null,
        resolutionAction: null,
      };
    },

    async get(id: string): Promise<DeadLetterRecord | null> {
      const row = await latestRow(id);
      return row ? rowToRecord(row) : null;
    },

    async list(filter?: DeadLetterFilter): Promise<DeadLetterRecord[]> {
      // Fetch all versions oldest-first, reduce to the latest per record_id.
      const res = await pg.query<DlRow & { seq: unknown }>(
        `SELECT ${SELECT_COLS}, seq FROM dead_letter ORDER BY seq ASC`,
      );
      const latest = new Map<string, DlRow>();
      for (const row of res.rows) latest.set(row.record_id, row);
      const out: DeadLetterRecord[] = [];
      for (const row of latest.values()) {
        const rec = rowToRecord(row);
        if (filter?.kind && rec.kind !== filter.kind) continue;
        if (filter?.status && rec.status !== filter.status) continue;
        out.push(rec);
      }
      return out.sort((a, b) =>
        a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : b.createdAt.localeCompare(a.createdAt),
      );
    },

    async resolve(
      id: string,
      action: ResolutionAction,
      actor: string,
    ): Promise<DeadLetterRecord | null> {
      const current = await latestRow(id);
      if (!current) return null;
      if (isTerminal(current.status)) return rowToRecord(current); // idempotent
      const resolvedAt = clock.nowIso();
      await pg.query(
        `INSERT INTO dead_letter
           (record_id, record_version, kind, status, member_ref, reason_code,
            source_ref, payload_ref, created_at, resolved_at, resolved_by,
            resolution_action, appended_at)
         VALUES (
           $1,
           (SELECT COALESCE(MAX(record_version), 0) + 1 FROM dead_letter WHERE record_id = $1),
           $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $9)`,
        [
          id,
          current.kind,
          STATUS_FOR_ACTION[action],
          current.member_ref,
          current.reason_code,
          current.source_ref,
          current.payload_ref,
          iso(current.created_at),
          resolvedAt,
          actor,
          action,
        ],
      );
      return {
        ...rowToRecord(current),
        status: STATUS_FOR_ACTION[action],
        resolvedAt,
        resolvedBy: actor,
        resolutionAction: action,
      };
    },
  };
}
