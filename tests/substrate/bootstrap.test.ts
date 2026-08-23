/**
 * Substrate bootstrap (I9 Wave A) against pg-mem.
 *
 * Proves the composition root wires every pg-backed store over one connection
 * (schema applied by the runner), that the wired stores actually work, and that
 * an unconfigured substrate FAILS CLOSED (SubstrateNotConfiguredError) rather than
 * silently serving an in-memory Map in place of durable persistence (E9).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { newDb } from 'pg-mem';
import * as clock from '@/lib/clock';
import {
  bootstrapSubstrate,
  substrateConnectionString,
  SubstrateNotConfiguredError,
  type PgLike,
} from '@/lib/substrate';

function freshPg(): PgLike {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  return new Pool() as unknown as PgLike;
}

describe('substrate bootstrap (pg-mem)', () => {
  beforeEach(() => clock.setClock(() => Date.parse('2026-08-23T00:00:00.000Z')));
  afterEach(() => {
    clock.setClock(null);
    delete process.env.DATABASE_URL;
  });

  it('wires every pg-backed store and runs migrations over one connection', async () => {
    const pg = freshPg();
    const substrate = await bootstrapSubstrate({ pg, realPostgres: false });

    expect(substrate.pg).toBe(pg);
    expect(substrate.migrations).not.toBeNull();
    expect(substrate.migrations!.applied.length).toBeGreaterThan(0);

    const { stores } = substrate;
    for (const key of ['evidence', 'deadLetter', 'idempotency', 'outbox', 'graph', 'crossReference'] as const) {
      expect(stores[key]).toBeTruthy();
    }
  });

  it('the wired stores operate against the migrated schema', async () => {
    const { stores } = await bootstrapSubstrate({ pg: freshPg(), realPostgres: false });

    // idempotency: first claim wins, replay is a no-op.
    expect((await stores.idempotency.markProcessed('c1', 'e1')).firstProcessed).toBe(true);
    expect((await stores.idempotency.markProcessed('c1', 'e1')).firstProcessed).toBe(false);

    // evidence ledger empty until appended (table exists, query does not throw).
    expect(await stores.evidence.list()).toEqual([]);
    expect(await stores.evidence.get('missing')).toBeNull();

    // outbox: per-member sequence starts at 0 against the created table.
    expect(await stores.outbox.nextSequence('M1')).toBe(0);

    // crossReference: link then resolve to the linked member.
    await stores.crossReference.link('src:INS-1', 'M1');
    const lookup = await stores.crossReference.lookup('src:INS-1');
    expect(lookup).toEqual({ status: 'linked', memberId: 'M1' });

    // deadLetter: append lands an open record retrievable by id.
    const rec = await stores.deadLetter.append({
      kind: 'held-identity',
      memberRef: 'src:eligibility',
      reasonCode: 'identity-possible-match',
      sourceRef: 'INS-2',
      payloadRef: 'batch:b1#hold-x',
    });
    expect((await stores.deadLetter.get(rec.id))?.status).toBe('open');

    // graph: the projection tables exist and list empty.
    expect(await stores.graph.listNodes()).toEqual([]);
  });

  it('fails closed when nothing is configured (no pg, no DATABASE_URL)', async () => {
    delete process.env.DATABASE_URL;
    await expect(bootstrapSubstrate({})).rejects.toBeInstanceOf(SubstrateNotConfiguredError);
    await expect(bootstrapSubstrate()).rejects.toBeInstanceOf(SubstrateNotConfiguredError);
  });

  it('resolves the connection string from config then env, else null', () => {
    delete process.env.DATABASE_URL;
    expect(substrateConnectionString({})).toBeNull();
    expect(substrateConnectionString({ databaseUrl: 'postgres://cfg' })).toBe('postgres://cfg');
    process.env.DATABASE_URL = 'postgres://env';
    expect(substrateConnectionString({})).toBe('postgres://env');
    // Explicit config wins over env.
    expect(substrateConnectionString({ databaseUrl: 'postgres://cfg' })).toBe('postgres://cfg');
  });

  it('can skip migrations when asked (wiring only)', async () => {
    const pg = freshPg();
    const substrate = await bootstrapSubstrate({ pg, realPostgres: false, runMigrations: false });
    expect(substrate.migrations).toBeNull();
    expect(substrate.stores.idempotency).toBeTruthy();
  });
});
