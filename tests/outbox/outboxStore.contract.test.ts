import { describe, it, expect } from 'vitest';
import { createMemoryOutboxStore, intentRowFrom, type OutboxStore } from '@/lib/outbox';
import { makePgMemStore } from './pgMem';
import { intent } from './fakes';

/**
 * OutboxStore contract suite (C3 rule 7: one suite runs against mock AND real).
 * Runs against the in-memory store and the pg-mem-backed Postgres store; a swap
 * that passes both is a safe swap.
 */
const backends: Array<[string, () => Promise<OutboxStore>]> = [
  ['memory', async () => createMemoryOutboxStore()],
  ['pg-mem', async () => (await makePgMemStore()).store],
];

function row(id: string, memberId: string, key: string, createdAtMs: number) {
  return { ...intentRowFrom(intent({ memberId, idempotencyKey: key }), id, createdAtMs) };
}

describe.each(backends)('OutboxStore contract [%s]', (_name, make) => {
  it('enqueue is idempotent on idempotencyKey', async () => {
    const store = await make();
    const a = await store.enqueue(row('i1', 'mem-a', 'k-1', 1000));
    expect(a.deduped).toBe(false);
    const b = await store.enqueue(row('i2', 'mem-a', 'k-1', 2000));
    expect(b.deduped).toBe(true);
    expect(b.row.id).toBe('i1'); // returns the FIRST intent, not the duplicate
    expect((await store.all()).length).toBe(1);
  });

  it('pendingForMember returns FIFO order (oldest first)', async () => {
    const store = await make();
    await store.enqueue(row('i2', 'mem-a', 'k-2', 2000));
    await store.enqueue(row('i1', 'mem-a', 'k-1', 1000));
    await store.enqueue(row('iB', 'mem-b', 'k-b', 1500));
    const pending = await store.pendingForMember('mem-a');
    expect(pending.map((r) => r.id)).toEqual(['i1', 'i2']);
  });

  it('nextSequence increments per member, isolated across members', async () => {
    const store = await make();
    await store.enqueue(row('i1', 'mem-a', 'k-1', 1000));
    expect(await store.nextSequence('mem-a')).toBe(0);
    await store.update('i1', { status: 'confirmed', sequence: 0 });
    expect(await store.nextSequence('mem-a')).toBe(1);
    expect(await store.nextSequence('mem-b')).toBe(0);
  });

  it('stalePending only returns pending rows older than the cutoff', async () => {
    const store = await make();
    await store.enqueue(row('old', 'mem-a', 'k-old', 1000));
    await store.enqueue(row('new', 'mem-a', 'k-new', 9000));
    await store.update('old-x', {}); // no-op on a missing id must not throw
    const stale = await store.stalePending(5000);
    expect(stale.map((r) => r.id)).toEqual(['old']);
  });

  it('claimForConfirm is a compare-and-set: claims once, assigns sequence, then loses', async () => {
    const store = await make();
    await store.enqueue(row('i1', 'mem-a', 'k-1', 1000));
    // First claim wins: pending -> confirmed, sequence 0.
    const first = await store.claimForConfirm('i1', 'mem-a', 5000);
    expect(first).toBe(0);
    expect((await store.get('i1'))?.status).toBe('confirmed');
    expect((await store.get('i1'))?.sequence).toBe(0);
    // Second claim of the SAME row loses (no longer pending) — the double-publish
    // window is closed at the data layer: the loser publishes nothing.
    const second = await store.claimForConfirm('i1', 'mem-a', 6000);
    expect(second).toBeNull();
  });

  it('claimForConfirm assigns dense per-member sequences, isolated across members', async () => {
    const store = await make();
    await store.enqueue(row('a1', 'mem-a', 'ka1', 1000));
    await store.enqueue(row('a2', 'mem-a', 'ka2', 2000));
    await store.enqueue(row('b1', 'mem-b', 'kb1', 1500));
    expect(await store.claimForConfirm('a1', 'mem-a', 5000)).toBe(0);
    expect(await store.claimForConfirm('a2', 'mem-a', 5000)).toBe(1);
    expect(await store.claimForConfirm('b1', 'mem-b', 5000)).toBe(0);
  });

  it('claimForConfirm on a missing id returns null (never throws)', async () => {
    const store = await make();
    expect(await store.claimForConfirm('nope', 'mem-a', 5000)).toBeNull();
  });

  it('update mutates status/sequence/attempts and get reflects it', async () => {
    const store = await make();
    await store.enqueue(row('i1', 'mem-a', 'k-1', 1000));
    await store.update('i1', { status: 'published', sequence: 3, attempts: 2 });
    const r = await store.get('i1');
    expect(r?.status).toBe('published');
    expect(r?.sequence).toBe(3);
    expect(r?.attempts).toBe(2);
  });
});
