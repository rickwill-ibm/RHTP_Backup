/**
 * Dead-letter store (NS-01): the in-memory reference AND the pg-backed store run
 * the SAME behavior suite (append / list byKind+byStatus / get / resolve /
 * append-only history), plus the seam selector (mock default, production throws
 * NotConfigured, production honors a registered factory). pg logic via pg-mem.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { newDb, type IMemoryDb } from 'pg-mem';
import * as clock from '@/lib/clock';
import {
  applyMigrations,
  createMemoryDeadLetterStore,
  createPgDeadLetterStore,
  defaultDeadLetterStore,
  resetDefaultDeadLetterStore,
  getDeadLetterStore,
  setProductionDeadLetterStoreFactory,
  DeadLetterStoreNotConfiguredError,
  type DeadLetterStore,
  type PgLike,
} from '@/lib/deadLetter';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';

async function freshPg(): Promise<{ db: IMemoryDb; store: DeadLetterStore }> {
  const db = newDb();
  const PoolCtor = db.adapters.createPg().Pool;
  const pool = new PoolCtor() as unknown as PgLike;
  await applyMigrations(pool, { realPostgres: false });
  return { db, store: createPgDeadLetterStore(pool) };
}

/** Run the same contract against both store implementations. */
const backends: Array<[string, () => Promise<DeadLetterStore>]> = [
  ['memory', async () => createMemoryDeadLetterStore()],
  ['pg-mem', async () => (await freshPg()).store],
];

describe.each(backends)('dead-letter store contract [%s]', (_name, make) => {
  beforeEach(() => clock.setClock(() => Date.parse('2026-08-22T12:00:00.000Z')));
  afterEach(() => clock.setClock(null));

  it('append lands an open record retrievable by id', async () => {
    const store = await make();
    const rec = await store.append({
      kind: 'held-identity',
      memberRef: 'src:eligibility',
      reasonCode: 'identity-possible-match',
      sourceRef: 'INS-2',
      payloadRef: 'batch:b1#hold-x;tier=possible-match;score=72',
    });
    expect(rec.status).toBe('open');
    expect(rec.createdAt).toBe('2026-08-22T12:00:00.000Z');
    const got = await store.get(rec.id);
    expect(got).toEqual(rec);
  });

  it('a held-identity record is retrievable, not dropped (NS-01 core)', async () => {
    const store = await make();
    await store.append({
      kind: 'held-identity',
      memberRef: 'src:adt',
      reasonCode: 'identity-possible-match',
      sourceRef: 'MSG-9',
      payloadRef: 'batch:b2#hold-y',
    });
    const held = await store.list({ kind: 'held-identity' });
    expect(held).toHaveLength(1);
    expect(held[0].reasonCode).toBe('identity-possible-match');
  });

  it('list filters by kind and by status', async () => {
    const store = await make();
    await store.append({ kind: 'quarantine', memberRef: 's:a', reasonCode: 'missing-field', sourceRef: 'r1', payloadRef: 'p1' });
    await store.append({ kind: 'held-identity', memberRef: 's:b', reasonCode: 'identity-possible-match', sourceRef: 'r2', payloadRef: 'p2' });
    await store.append({ kind: 'failed-outbox', memberRef: 'mem-1', reasonCode: 'fhir-503', sourceRef: 'i1', payloadRef: 'intent:i1;attempts=5' });
    expect(await store.list({ kind: 'quarantine' })).toHaveLength(1);
    expect(await store.list({ kind: 'held-identity' })).toHaveLength(1);
    expect(await store.list({ kind: 'failed-outbox' })).toHaveLength(1);
    expect(await store.list()).toHaveLength(3);
    expect(await store.list({ status: 'open' })).toHaveLength(3);
    expect(await store.list({ status: 'resolved' })).toHaveLength(0);
  });

  it('resolve transitions status, stamps resolver, and is append-only', async () => {
    const store = await make();
    const rec = await store.append({ kind: 'quarantine', memberRef: 's:a', reasonCode: 'bad-segment', sourceRef: 'r1', payloadRef: 'p1' });
    const resolved = await store.resolve(rec.id, 'resolve', 'ops:jane');
    expect(resolved?.status).toBe('resolved');
    expect(resolved?.resolvedBy).toBe('ops:jane');
    expect(resolved?.resolutionAction).toBe('resolve');
    expect(resolved?.resolvedAt).toBe('2026-08-22T12:00:00.000Z');
    // get returns the latest (resolved) snapshot; the item is no longer open.
    expect((await store.get(rec.id))?.status).toBe('resolved');
    expect(await store.list({ status: 'open' })).toHaveLength(0);
    expect(await store.list({ status: 'resolved' })).toHaveLength(1);
  });

  it('retry and dismiss map to their terminal statuses', async () => {
    const store = await make();
    const a = await store.append({ kind: 'failed-outbox', memberRef: 'mem-1', reasonCode: 'x', sourceRef: 'i1', payloadRef: 'p' });
    const b = await store.append({ kind: 'quarantine', memberRef: 's:b', reasonCode: 'y', sourceRef: 'r2', payloadRef: 'p' });
    expect((await store.resolve(a.id, 'retry', 'ops:x'))?.status).toBe('retried');
    expect((await store.resolve(b.id, 'dismiss', 'ops:x'))?.status).toBe('dismissed');
  });

  it('resolve is idempotent: a terminal record is not re-resolved', async () => {
    const store = await make();
    const rec = await store.append({ kind: 'quarantine', memberRef: 's:a', reasonCode: 'z', sourceRef: 'r1', payloadRef: 'p' });
    await store.resolve(rec.id, 'dismiss', 'ops:a');
    const again = await store.resolve(rec.id, 'resolve', 'ops:b');
    expect(again?.status).toBe('dismissed'); // unchanged
    expect(again?.resolvedBy).toBe('ops:a');
  });

  it('resolve returns null for an unknown id', async () => {
    const store = await make();
    expect(await store.resolve('nope', 'resolve', 'ops:a')).toBeNull();
    expect(await store.get('nope')).toBeNull();
  });
});

describe('dead-letter store seam selector', () => {
  afterEach(() => {
    clearSessionDataModes();
    setProductionDeadLetterStoreFactory(null);
    resetDefaultDeadLetterStore();
  });

  it('mock mode returns the in-memory default store', () => {
    setSessionDataMode('deadLetterStore', 'mock');
    expect(getDeadLetterStore()).toBe(defaultDeadLetterStore());
  });

  it('production mode without a registered factory throws NotConfigured', () => {
    setSessionDataMode('deadLetterStore', 'production');
    expect(() => getDeadLetterStore()).toThrow(DeadLetterStoreNotConfiguredError);
  });

  it('production mode uses the registered store factory', async () => {
    const { store } = await freshPg();
    setProductionDeadLetterStoreFactory(() => store);
    setSessionDataMode('deadLetterStore', 'production');
    const resolved = getDeadLetterStore();
    await resolved.append({ kind: 'quarantine', memberRef: 's:a', reasonCode: 'r', sourceRef: 'r1', payloadRef: 'p' });
    expect(await resolved.list()).toHaveLength(1);
  });
});

describe('dead-letter store — concurrent appends (pg-mem)', () => {
  it('distinct records land on distinct versions without loss', async () => {
    const { store } = await freshPg();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.append({ kind: 'quarantine', memberRef: `s:${i}`, reasonCode: 'r', sourceRef: `r-${i}`, payloadRef: 'p' }),
      ),
    );
    expect(await store.list()).toHaveLength(20);
  });
});
