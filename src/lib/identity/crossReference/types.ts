// SEAM: crossReference  (dataMode 'crossReference')  // DP-7
/**
 * Member <-> source-id cross-reference (F3).
 *
 * The xref is the table that closes identity fragmentation: it records which
 * anchored member id a raw source id belongs to, so a second feed carrying the
 * SAME source id resolves to the EXISTING member instead of minting a new one.
 *
 * It is append-only and merge-aware, per DP-7: link/unlink/merge/unmerge are
 * stored as facts and lookup RESOLVES them at read time (a merged member's source
 * ids follow to the survivor). No in-place key rewrite ever happens here — the
 * graph rekeys by REPLAY of the member.merged / member.unmerged events these
 * operations emit (src/lib/graph/replay.ts).
 */
import type { C2Event } from '@/lib/outbox';

/** A recorded source-id -> member-id association. */
export interface XrefLink {
  sourceId: string;
  memberId: string;
  /** Originating feed (audit provenance; never a match key). */
  feed?: string;
}

/**
 * The result of resolving a source id through the xref.
 *   linked     — exactly one surviving member owns this source id.
 *   ambiguous  — two or more DISTINCT surviving members claim it with no merge
 *                relating them. E9: the resolver must HOLD, never pick one and
 *                fail open to a wrong member.
 *   unlinked   — the source id is unknown (a genuinely new id -> mint + link).
 */
export type XrefLookup =
  | { status: 'linked'; memberId: string }
  | { status: 'ambiguous'; memberIds: string[] }
  | { status: 'unlinked' };

/**
 * The durable cross-reference store seam (async; pg / in-memory). Every mutating
 * operation returns the C2 event it emitted so the caller can relay it to the
 * event backbone for the graph projectors to replay.
 */
export interface CrossReferenceStore {
  readonly id: string;
  /** Associate a source id with an anchored member id. Emits identity.xref-linked. */
  link(sourceId: string, memberId: string, feed?: string): Promise<C2Event>;
  /** Remove one source-id -> member-id association. Emits identity.xref-unlinked. */
  unlink(sourceId: string, memberId: string): Promise<C2Event>;
  /** Resolve a source id to its surviving member (merge-aware). */
  lookup(sourceId: string): Promise<XrefLookup>;
  /** Subsume mergedMemberId into survivingMemberId. Emits member.merged (DP-7). */
  merge(survivingMemberId: string, mergedMemberId: string): Promise<C2Event>;
  /** Reverse a merge. Emits member.unmerged (DP-7). */
  unmerge(survivingMemberId: string, mergedMemberId: string): Promise<C2Event>;
  /** The emitted events in order — the replay source for graph rekey. */
  events(): Promise<C2Event[]>;
}

/** The subset of node-postgres the pg store depends on (pg Pool and pg-mem satisfy it). */
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

/** Deterministic id/time injection for event envelopes (clock.ts by default). */
export interface XrefEventDeps {
  now: () => number;
  rng: () => number;
}
