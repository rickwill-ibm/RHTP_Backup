/**
 * In-memory OutboxStore — the mock mode of the cdc-relay seam (C3 rule 3: mock
 * is a mode, not a stub). Same contract as the pg store; the outbox unit tests
 * run against BOTH so a swap that passes is a safe swap.
 */
import type { OutboxIntentRow, OutboxStore } from './types';

export function createMemoryOutboxStore(id = 'mock-outbox'): OutboxStore {
  const rows = new Map<string, OutboxIntentRow>();
  const byKey = new Map<string, string>(); // idempotencyKey -> intent id

  const clone = (r: OutboxIntentRow): OutboxIntentRow => ({ ...r, envelope: { ...r.envelope } });

  return {
    id,
    async enqueue(row) {
      const existingId = byKey.get(row.idempotencyKey);
      if (existingId) return { row: clone(rows.get(existingId)!), deduped: true };
      rows.set(row.id, clone(row));
      byKey.set(row.idempotencyKey, row.id);
      return { row: clone(row), deduped: false };
    },
    async pendingForMember(memberId) {
      return [...rows.values()]
        .filter((r) => r.memberId === memberId && r.status === 'pending')
        .sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id))
        .map(clone);
    },
    async confirmedForMember(memberId) {
      return [...rows.values()]
        .filter((r) => r.memberId === memberId && r.status === 'confirmed')
        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
        .map(clone);
    },
    async nextSequence(memberId) {
      const max = [...rows.values()]
        .filter((r) => r.memberId === memberId && r.sequence !== null)
        .reduce((m, r) => Math.max(m, r.sequence as number), -1);
      return max + 1;
    },
    async claimForConfirm(id, memberId, nowMs) {
      // Compare-and-set mirror of the pg store: a row is claimable exactly once.
      // The map is mutated synchronously with no await between read and write, so
      // this is the atomic single-writer the pg UPDATE...WHERE gives in Postgres.
      const r = rows.get(id);
      if (!r || r.status !== 'pending') return null; // lost the claim
      const sequence =
        [...rows.values()]
          .filter((x) => x.memberId === memberId && x.sequence !== null)
          .reduce((m, x) => Math.max(m, x.sequence as number), -1) + 1;
      rows.set(id, { ...r, status: 'confirmed', sequence, updatedAtMs: nowMs });
      return sequence;
    },
    async update(id, patch) {
      const r = rows.get(id);
      if (!r) return;
      rows.set(id, { ...r, ...patch });
    },
    async stalePending(olderThanMs) {
      return [...rows.values()]
        .filter((r) => r.status === 'pending' && r.createdAtMs < olderThanMs)
        .sort((a, b) => a.createdAtMs - b.createdAtMs)
        .map(clone);
    },
    async get(id) {
      const r = rows.get(id);
      return r ? clone(r) : null;
    },
    async all() {
      return [...rows.values()]
        .sort(
          (a, b) =>
            a.memberId.localeCompare(b.memberId) ||
            (a.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sequence ?? Number.MAX_SAFE_INTEGER) ||
            a.createdAtMs - b.createdAtMs
        )
        .map(clone);
    },
  };
}
