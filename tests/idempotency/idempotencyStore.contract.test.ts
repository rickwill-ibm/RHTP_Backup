/**
 * Idempotency store CONTRACT suite — run against BOTH the in-memory store and the
 * pg-mem-backed pg store, so a swap that passes here is a safe swap (the same
 * discipline the outbox contract suite uses). Proves the NS-04 properties:
 * atomic check-and-set, concurrent-double-delivery dedupe, and per-consumer
 * namespace isolation.
 */
import { describe, it, expect } from 'vitest';
import { createMemoryIdempotencyStore, type IdempotencyStore } from '@/lib/idempotency';
import { makePgMemIdempotencyStore } from './pgMem';

type Factory = () => Promise<IdempotencyStore>;

const backends: Array<{ name: string; make: Factory }> = [
  { name: 'memory', make: async () => createMemoryIdempotencyStore('test-mem') },
  { name: 'pg-mem', make: async () => (await makePgMemIdempotencyStore()).store },
];

for (const backend of backends) {
  describe(`IdempotencyStore contract [${backend.name}]`, () => {
    it('markProcessed is a check-and-set: the first delivery wins, the second is a no-op', async () => {
      const store = await backend.make();
      const first = await store.markProcessed('sde-intake', 'evt-1');
      const second = await store.markProcessed('sde-intake', 'evt-1');
      expect(first.firstProcessed).toBe(true);
      expect(second.firstProcessed).toBe(false); // republish of the same eventId
      expect(await store.isProcessed('sde-intake', 'evt-1')).toBe(true);
    });

    it('isProcessed is false until marked, true after (read-only, no mutation)', async () => {
      const store = await backend.make();
      expect(await store.isProcessed('sde-intake', 'evt-x')).toBe(false);
      // A probe must NOT mark: a later markProcessed still counts as first.
      expect(await store.isProcessed('sde-intake', 'evt-x')).toBe(false);
      const r = await store.markProcessed('sde-intake', 'evt-x');
      expect(r.firstProcessed).toBe(true);
    });

    it('concurrent double-delivery of the same eventId is deduped to exactly one winner', async () => {
      const store = await backend.make();
      // Fire many overlapping claims for the SAME pair at once. Exactly one may win.
      const results = await Promise.all(
        Array.from({ length: 20 }, () => store.markProcessed('outreach-agent', 'evt-race')),
      );
      const winners = results.filter((r) => r.firstProcessed);
      expect(winners).toHaveLength(1);
    });

    it('per-consumer namespace: the same eventId is independent across consumers', async () => {
      const store = await backend.make();
      const a = await store.markProcessed('sde-intake', 'evt-shared');
      const b = await store.markProcessed('outreach-agent', 'evt-shared');
      const c = await store.markProcessed('referral-coordination-agent', 'evt-shared');
      // Each consumer sees a FIRST claim for the shared eventId (no cross-suppress).
      expect([a.firstProcessed, b.firstProcessed, c.firstProcessed]).toEqual([true, true, true]);
      // But a second claim within one consumer is a no-op.
      expect((await store.markProcessed('sde-intake', 'evt-shared')).firstProcessed).toBe(false);
      expect(await store.isProcessed('sde-intake', 'evt-shared')).toBe(true);
      expect(await store.isProcessed('outreach-agent', 'evt-shared')).toBe(true);
    });

    it('distinct eventIds under one consumer are independent', async () => {
      const store = await backend.make();
      expect((await store.markProcessed('sde-intake', 'a')).firstProcessed).toBe(true);
      expect((await store.markProcessed('sde-intake', 'b')).firstProcessed).toBe(true);
      expect((await store.markProcessed('sde-intake', 'a')).firstProcessed).toBe(false);
    });
  });
}
