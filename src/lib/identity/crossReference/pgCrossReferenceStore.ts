// SEAM: crossReference  // DP-7
/**
 * Postgres-backed CrossReferenceStore. Runs against real `pg` and in-process
 * `pg-mem` alike (see PgLike) — the SAME DDL and parametrized SQL.
 *
 * Append-only: link/unlink/merge/unmerge each INSERT one immutable fact row with a
 * monotonic `seq`. There is no UPDATE and no DELETE — an unlink is a fact, not a
 * deletion, so the history stays replayable (DP-7). lookup folds the fact rows in
 * `seq` order into the same links/merges structure the sync engine uses and shares
 * the ONE resolveLookup so fragmentation + E9 semantics are identical everywhere.
 */
import * as clock from '@/lib/clock';
import type { C2Event } from '@/lib/outbox';
import { linkedEvent, unlinkedEvent, mergedEvent, unmergedEvent } from './events';
import { resolveLookup } from './xref';
import type { CrossReferenceStore, PgLike, XrefEventDeps, XrefLookup } from './types';

export const CROSS_REFERENCE_DDL = `
CREATE TABLE IF NOT EXISTS identity_xref (
  seq                  BIGSERIAL PRIMARY KEY,
  op                   TEXT NOT NULL,
  source_id            TEXT,
  member_id            TEXT,
  surviving_member_id  TEXT,
  merged_member_id     TEXT,
  feed                 TEXT,
  created_at           TEXT NOT NULL
);`;

/** Ensure the schema exists (idempotent). Call once at store init. */
export async function ensureCrossReferenceSchema(pg: PgLike): Promise<void> {
  await pg.query(CROSS_REFERENCE_DDL);
}

interface XrefRow {
  op: string;
  source_id: string | null;
  member_id: string | null;
  surviving_member_id: string | null;
  merged_member_id: string | null;
}

export function createPgCrossReferenceStore(
  pg: PgLike,
  id = 'pg-cross-reference',
  deps?: Partial<XrefEventDeps>
): CrossReferenceStore {
  const eventDeps: XrefEventDeps = { now: deps?.now ?? clock.now, rng: deps?.rng ?? clock.rng };

  async function insert(
    op: string,
    cols: Partial<
      Record<
        'source_id' | 'member_id' | 'surviving_member_id' | 'merged_member_id' | 'feed',
        string | null
      >
    >
  ): Promise<void> {
    await pg.query(
      `INSERT INTO identity_xref
         (op, source_id, member_id, surviving_member_id, merged_member_id, feed, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        op,
        cols.source_id ?? null,
        cols.member_id ?? null,
        cols.surviving_member_id ?? null,
        cols.merged_member_id ?? null,
        cols.feed ?? null,
        clock.nowIso(),
      ]
    );
  }

  async function foldFacts(): Promise<{
    links: Map<string, Set<string>>;
    merges: Map<string, string>;
  }> {
    const res = await pg.query<XrefRow>(
      `SELECT op, source_id, member_id, surviving_member_id, merged_member_id
         FROM identity_xref ORDER BY seq ASC`
    );
    const links = new Map<string, Set<string>>();
    const merges = new Map<string, string>();
    for (const r of res.rows) {
      if (r.op === 'link' && r.source_id && r.member_id) {
        const s = links.get(r.source_id) ?? new Set<string>();
        s.add(r.member_id);
        links.set(r.source_id, s);
      } else if (r.op === 'unlink' && r.source_id && r.member_id) {
        links.get(r.source_id)?.delete(r.member_id);
      } else if (r.op === 'merge' && r.surviving_member_id && r.merged_member_id) {
        if (r.surviving_member_id !== r.merged_member_id) {
          merges.set(r.merged_member_id, r.surviving_member_id);
        }
      } else if (r.op === 'unmerge' && r.merged_member_id) {
        merges.delete(r.merged_member_id);
      }
    }
    return { links, merges };
  }

  return {
    id,
    async link(sourceId, memberId, feed): Promise<C2Event> {
      await insert('link', { source_id: sourceId, member_id: memberId, feed: feed ?? null });
      return linkedEvent(sourceId, memberId, feed, eventDeps);
    },
    async unlink(sourceId, memberId): Promise<C2Event> {
      await insert('unlink', { source_id: sourceId, member_id: memberId });
      return unlinkedEvent(sourceId, memberId, eventDeps);
    },
    async lookup(sourceId): Promise<XrefLookup> {
      const { links, merges } = await foldFacts();
      return resolveLookup(links, merges, sourceId);
    },
    async merge(survivingMemberId, mergedMemberId): Promise<C2Event> {
      await insert('merge', {
        surviving_member_id: survivingMemberId,
        merged_member_id: mergedMemberId,
      });
      return mergedEvent(survivingMemberId, mergedMemberId, eventDeps);
    },
    async unmerge(survivingMemberId, mergedMemberId): Promise<C2Event> {
      await insert('unmerge', {
        surviving_member_id: survivingMemberId,
        merged_member_id: mergedMemberId,
      });
      return unmergedEvent(survivingMemberId, mergedMemberId, eventDeps);
    },
    async events(): Promise<C2Event[]> {
      // Rebuild the emitted stream from the fact rows in order (deterministic).
      const res = await pg.query<XrefRow>(
        `SELECT op, source_id, member_id, surviving_member_id, merged_member_id
           FROM identity_xref ORDER BY seq ASC`
      );
      return res.rows.map((r) => {
        if (r.op === 'link') return linkedEvent(r.source_id!, r.member_id!, undefined, eventDeps);
        if (r.op === 'unlink') return unlinkedEvent(r.source_id!, r.member_id!, eventDeps);
        if (r.op === 'merge')
          return mergedEvent(r.surviving_member_id!, r.merged_member_id!, eventDeps);
        return unmergedEvent(r.surviving_member_id!, r.merged_member_id!, eventDeps);
      });
    },
  };
}
