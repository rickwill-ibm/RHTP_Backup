import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { newDb, type IMemoryDb } from 'pg-mem';
import * as clock from '@/lib/clock';
import {
  applyMigrations,
  createPgEvidenceLedger,
  getEvidenceStore,
  setProductionEvidenceStoreFactory,
  EvidenceStoreNotConfiguredError,
  type PgEvidenceLedger,
  type PgLike,
} from '@/lib/evidence/store';
import {
  createEvidenceRecord,
  appendEntry,
  withStatus,
  type EvidenceRecord,
} from '@/lib/evidence';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';

/** Fresh pg-mem pool with the portable migrations applied (no .pg.sql). */
async function freshLedger(): Promise<{ db: IMemoryDb; pool: PgLike; ledger: PgEvidenceLedger }> {
  const db = newDb();
  const PoolCtor = db.adapters.createPg().Pool;
  const pool = new PoolCtor() as unknown as PgLike;
  await applyMigrations(pool, { realPostgres: false });
  return { db, pool, ledger: createPgEvidenceLedger(pool) };
}

function record(id: string, memberId = 'M1'): EvidenceRecord {
  return createEvidenceRecord({
    id,
    memberId,
    order: { code: '72148', display: 'MRI lumbar' },
    createdAt: '2026-08-22T00:00:00.000Z',
  });
}

describe('pg evidence ledger — round-trip + ordering', () => {
  beforeEach(() => clock.setClock(() => Date.parse('2026-08-22T12:00:00.000Z')));
  afterEach(() => clock.setClock(null));

  it('save then get returns an equal record; entry order preserved', async () => {
    const { ledger } = await freshLedger();
    let r = record('ev-1');
    r = appendEntry(r, { id: 'e1', ts: '2026-08-22T00:01:00.000Z', stage: 'eligibility', type: 'eligibility', requiresPA: true });
    r = appendEntry(r, { id: 'e2', ts: '2026-08-22T00:02:00.000Z', stage: 'prior-auth', type: 'note', text: 'second' });
    await ledger.save(r);
    const got = await ledger.get('ev-1');
    expect(got).toEqual(r);
    expect(got?.entries.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('get returns null for an unknown id', async () => {
    const { ledger } = await freshLedger();
    expect(await ledger.get('nope')).toBeNull();
  });

  it('list returns distinct record ids in order', async () => {
    const { ledger } = await freshLedger();
    await ledger.save(record('b'));
    await ledger.save(record('a'));
    await ledger.save(record('a')); // second version of a
    expect(await ledger.list()).toEqual(['a', 'b']);
  });
});

describe('pg evidence ledger — append-only versioned history', () => {
  it('each save is a new immutable row; get returns latest, readLedger the history', async () => {
    const { ledger } = await freshLedger();
    const v1 = withStatus(record('ev-2'), 'open');
    await ledger.save(v1);
    const v2 = withStatus(appendEntry(v1, { id: 'e1', ts: '2026-08-22T00:01:00.000Z', stage: 'prior-auth', type: 'pas-submission', approvedBy: 'rev-1' }), 'submitted');
    await ledger.save(v2);

    const history = await ledger.readLedger('ev-2');
    expect(history).toHaveLength(2);
    expect(history[0].provenance.version).toBe(1);
    expect(history[1].provenance.version).toBe(2);
    // the first snapshot is unchanged by the second append
    expect(history[0].record.status).toBe('open');
    expect(history[0].record.entries).toHaveLength(0);
    expect(history[1].record.status).toBe('submitted');
    expect(history[1].record.entries).toHaveLength(1);
    // get() returns the latest version
    expect((await ledger.get('ev-2'))?.status).toBe('submitted');
    // sequences are monotonic
    expect(history[1].provenance.seq).toBeGreaterThan(history[0].provenance.seq);
  });

  it('stamps provenance: monotonic seq, attributed actor, correlation id, appended_at', async () => {
    clock.setClock(() => Date.parse('2026-08-22T09:00:00.000Z'));
    const { ledger } = await freshLedger();
    let r = record('ev-3');
    r = appendEntry(r, { id: 'e1', ts: '2026-08-22T00:01:00.000Z', stage: 'prior-auth', type: 'pas-submission', approvedBy: 'reviewer:42', actor: 'reviewer:42' });
    await ledger.save(r);
    const [entry] = await ledger.readLedger('ev-3');
    expect(entry.provenance.actor).toBe('reviewer:42');
    expect(entry.provenance.correlationId).toBe('ev-3');
    expect(entry.provenance.appendedAt).toBe('2026-08-22T09:00:00.000Z');
    expect(entry.provenance.seq).toBeGreaterThan(0);
    clock.setClock(null);
  });
});

describe('pg evidence ledger — concurrency', () => {
  it('concurrent appends receive distinct monotonic sequences', async () => {
    const { ledger } = await freshLedger();
    await Promise.all(Array.from({ length: 25 }, (_, i) => ledger.save(record(`c-${i}`))));
    const history = await Promise.all(
      Array.from({ length: 25 }, (_, i) => ledger.readLedger(`c-${i}`))
    );
    const seqs = history.map((h) => h[0].provenance.seq);
    expect(new Set(seqs).size).toBe(25); // all distinct
    expect(await ledger.maxSeq()).toBe(Math.max(...seqs));
  });

  it('concurrent appends to the same record get distinct versions', async () => {
    const { ledger } = await freshLedger();
    const base = record('same');
    await Promise.all([ledger.save(base), ledger.save(base), ledger.save(base)]);
    const history = await ledger.readLedger('same');
    const versions = history.map((h) => h.provenance.version).sort((a, b) => a - b);
    expect(versions).toEqual([1, 2, 3]);
  });
});

describe('pg evidence ledger — immutability', () => {
  it('exposes no update or delete method (append-only by construction)', async () => {
    const { ledger } = await freshLedger();
    const keys = Object.keys(ledger);
    expect(keys).not.toContain('update');
    expect(keys).not.toContain('delete');
    expect(keys).not.toContain('remove');
    expect(keys.sort()).toEqual(['get', 'list', 'maxSeq', 'readLedger', 'save']);
  });
});

describe('evidence store seam selector', () => {
  afterEach(() => {
    clearSessionDataModes();
    setProductionEvidenceStoreFactory(null);
  });

  it('mock mode returns the in-memory default store', () => {
    setSessionDataMode('evidence', 'mock');
    const store = getEvidenceStore();
    expect(typeof store.save).toBe('function');
    expect(typeof (store as unknown as Record<string, unknown>).readLedger).toBe('undefined');
  });

  it('production mode without a registered factory throws NotConfigured', () => {
    setSessionDataMode('evidence', 'production');
    expect(() => getEvidenceStore()).toThrow(EvidenceStoreNotConfiguredError);
  });

  it('production mode uses the registered ledger factory', async () => {
    const { ledger } = await freshLedger();
    setProductionEvidenceStoreFactory(() => ledger);
    setSessionDataMode('evidence', 'production');
    const store = getEvidenceStore();
    await store.save(record('via-seam'));
    expect(await store.get('via-seam')).not.toBeNull();
  });
});
