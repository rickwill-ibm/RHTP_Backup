/**
 * Reviewer operations surface (NS-01): list open items, inspect one, and
 * resolve / dismiss / retry. retry re-submits through the injected lane and only
 * marks the record 'retried' when the lane accepts it (fail-closed otherwise).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as clock from '@/lib/clock';
import { createMemoryDeadLetterStore, type DeadLetterRecord } from '@/lib/deadLetter';
import { createMemoryIdempotencyStore } from '@/lib/idempotency';
import {
  listOpenItems,
  inspectItem,
  reviewAction,
  type RetryLaneRouter,
} from '@/lib/deadLetter/review';

beforeEach(() => clock.setClock(() => Date.parse('2026-08-22T12:00:00.000Z')));
afterEach(() => clock.setClock(null));

async function seed() {
  const store = createMemoryDeadLetterStore();
  const held = await store.append({ kind: 'held-identity', memberRef: 's:adt', reasonCode: 'identity-possible-match', sourceRef: 'MSG-1', payloadRef: 'b#h1' });
  const quar = await store.append({ kind: 'quarantine', memberRef: 's:834', reasonCode: 'missing-field', sourceRef: 'INS-3', payloadRef: 'b#q1' });
  const outbox = await store.append({ kind: 'failed-outbox', memberRef: 'mem-1', reasonCode: 'fhir-503', sourceRef: 'i-9', payloadRef: 'intent:i-9;attempts=5' });
  return { store, held, quar, outbox };
}

describe('listOpenItems / inspectItem', () => {
  it('lists only open items, filterable by kind', async () => {
    const { store } = await seed();
    expect(await listOpenItems(store)).toHaveLength(3);
    expect(await listOpenItems(store, { kind: 'held-identity' })).toHaveLength(1);
  });

  it('inspect returns one item, null for unknown', async () => {
    const { store, quar } = await seed();
    expect((await inspectItem(store, quar.id))?.reasonCode).toBe('missing-field');
    expect(await inspectItem(store, 'nope')).toBeNull();
  });
});

describe('reviewAction — resolve / dismiss', () => {
  it('resolve closes the item and audits PHI-safe', async () => {
    const { store, quar } = await seed();
    const res = await reviewAction(store, { id: quar.id, action: 'resolve', actor: 'ops:jane' });
    expect(res.ok).toBe(true);
    expect(res.record?.status).toBe('resolved');
    expect(res.audit.action).toBe('dead-letter.resolve');
    expect(res.audit.outcome).toBe('success');
    // PHI-safe: audit detail carries kind + reason code only.
    expect(JSON.stringify(res.audit)).not.toMatch(/name|dob|ssn/i);
    expect(await listOpenItems(store)).toHaveLength(2);
  });

  it('dismiss closes the item', async () => {
    const { store, held } = await seed();
    const res = await reviewAction(store, { id: held.id, action: 'dismiss', actor: 'ops:jane' });
    expect(res.record?.status).toBe('dismissed');
  });

  it('unknown id → not-found failure', async () => {
    const { store } = await seed();
    const res = await reviewAction(store, { id: 'nope', action: 'resolve', actor: 'ops:jane' });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('not-found');
  });
});

describe('reviewAction — retry', () => {
  it('re-submits through the lane and marks the record retried', async () => {
    const { store, outbox } = await seed();
    const seen: DeadLetterRecord[] = [];
    const router: RetryLaneRouter = {
      'failed-outbox': async (record) => {
        seen.push(record);
        return { ok: true, detail: 're-enqueued intent' };
      },
    };
    const res = await reviewAction(store, { id: outbox.id, action: 'retry', actor: 'ops:jane' }, router);
    expect(res.ok).toBe(true);
    expect(res.record?.status).toBe('retried');
    expect(seen).toHaveLength(1);
    expect(seen[0].sourceRef).toBe('i-9');
  });

  it('fail-closed: no lane for the kind → not marked retried', async () => {
    const { store, held } = await seed();
    const res = await reviewAction(store, { id: held.id, action: 'retry', actor: 'ops:jane' }, {});
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('retry-lane-not-configured');
    // The record stays OPEN — a failed retry must not silently close it.
    expect((await inspectItem(store, held.id))?.status).toBe('open');
  });

  it('lane rejection → not marked retried, stays open', async () => {
    const { store, quar } = await seed();
    const router: RetryLaneRouter = {
      quarantine: async () => ({ ok: false, detail: 'source batch unavailable' }),
    };
    const res = await reviewAction(store, { id: quar.id, action: 'retry', actor: 'ops:jane' }, router);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('retry-lane-rejected');
    expect((await inspectItem(store, quar.id))?.status).toBe('open');
  });
});

describe('reviewAction — idempotency (register HIGH / R1-DL2)', () => {
  it('a double-clicked / replayed retry re-injects the lane EXACTLY once', async () => {
    const { store, outbox } = await seed();
    const idempotency = createMemoryIdempotencyStore('dl-review-test');
    let laneCalls = 0;
    const router: RetryLaneRouter = {
      'failed-outbox': async () => {
        laneCalls += 1;
        return { ok: true, detail: 're-enqueued' };
      },
    };
    const req = { id: outbox.id, action: 'retry' as const, actor: 'ops:jane' };
    const first = await reviewAction(store, req, router, idempotency);
    const second = await reviewAction(store, req, router, idempotency);
    expect(first.ok).toBe(true);
    expect(first.record?.status).toBe('retried');
    expect(second.ok).toBe(true);
    expect(second.reason).toBe('deduped');
    // The load-bearing assertion: the lane fired ONCE, no double-inject.
    expect(laneCalls).toBe(1);
  });

  it('concurrent retries of the same item inject once (single winner)', async () => {
    const { store, outbox } = await seed();
    const idempotency = createMemoryIdempotencyStore('dl-review-conc');
    let laneCalls = 0;
    const router: RetryLaneRouter = {
      'failed-outbox': async () => {
        laneCalls += 1;
        return { ok: true, detail: 're-enqueued' };
      },
    };
    const req = { id: outbox.id, action: 'retry' as const, actor: 'ops:jane' };
    const [a, b] = await Promise.all([
      reviewAction(store, req, router, idempotency),
      reviewAction(store, req, router, idempotency),
    ]);
    expect(laneCalls).toBe(1);
    expect([a.reason, b.reason].filter((r) => r === 'deduped')).toHaveLength(1);
  });

  it('a replayed resolve does not double-transition (terminal short-circuit, no store needed)', async () => {
    const { store, quar } = await seed();
    const first = await reviewAction(store, { id: quar.id, action: 'resolve', actor: 'ops:jane' });
    const second = await reviewAction(store, { id: quar.id, action: 'resolve', actor: 'ops:jane' });
    expect(first.record?.status).toBe('resolved');
    expect(second.ok).toBe(true);
    expect(second.reason).toBe('deduped');
    // Exactly one resolution version recorded (the terminal record was not re-appended).
    expect(store.history(quar.id).filter((v) => v.status === 'resolved')).toHaveLength(1);
  });

  it('an already-retried record is never re-submitted through the lane on replay', async () => {
    const { store, outbox } = await seed();
    let laneCalls = 0;
    const router: RetryLaneRouter = {
      'failed-outbox': async () => {
        laneCalls += 1;
        return { ok: true, detail: 're-enqueued' };
      },
    };
    // No idempotency store injected — the terminal-status guard alone must hold.
    await reviewAction(store, { id: outbox.id, action: 'retry', actor: 'ops:jane' }, router);
    const replay = await reviewAction(store, { id: outbox.id, action: 'retry', actor: 'ops:jane' }, router);
    expect(replay.reason).toBe('deduped');
    expect(laneCalls).toBe(1);
  });
});
