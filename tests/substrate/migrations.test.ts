/**
 * Unified migration runner (I9 Wave A) against pg-mem.
 *
 * Proves the three register guarantees: the runner discovers every store's schema
 * and applies it; a re-run is a pure no-op (idempotent); and editing an already
 * applied migration fails loud (checksum-guarded). Real-Postgres-only `.pg.sql`
 * triggers are skipped under pg-mem via { realPostgres: false }.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { newDb } from 'pg-mem';
import * as clock from '@/lib/clock';
import {
  runMigrations,
  discoverMigrations,
  readMigrationLedger,
  checksumOf,
  ChecksumMismatchError,
  inlineSource,
  type PgLike,
  type MigrationSource,
} from '@/lib/substrate';

function freshPg(): PgLike {
  const mem = newDb();
  const { Pool } = mem.adapters.createPg();
  return new Pool() as unknown as PgLike;
}

/** Every table the default sources create — used to prove the schema landed. */
const EXPECTED_TABLES = [
  'evidence_ledger',
  'dead_letter',
  'outbox_intent',
  'idempotency_marker',
  'graph_node',
  'graph_edge',
  'identity_xref',
];

describe('substrate migration runner (pg-mem)', () => {
  beforeEach(() => clock.setClock(() => Date.parse('2026-08-23T00:00:00.000Z')));
  afterEach(() => clock.setClock(null));

  it('applies every store migration and records the ledger', async () => {
    const pg = freshPg();
    const res = await runMigrations(pg, { realPostgres: false });

    expect(res.applied.length).toBeGreaterThan(0);
    expect(res.skipped).toEqual([]);
    expect(res.total).toBe(res.applied.length);

    // Ledger records each applied migration, namespaced by store.
    const ledger = await readMigrationLedger(pg);
    const stores = new Set(ledger.map((r) => r.store));
    for (const s of ['evidence', 'deadLetter', 'outbox', 'idempotency', 'graph', 'crossReference']) {
      expect(stores.has(s)).toBe(true);
    }

    // Every expected table exists (a SELECT would throw if the DDL had not run).
    for (const table of EXPECTED_TABLES) {
      const r = await pg.query(`SELECT COUNT(*) AS n FROM ${table}`);
      expect(r.rows.length).toBe(1);
    }
  });

  it('is idempotent: a second run applies nothing and skips all', async () => {
    const pg = freshPg();
    const first = await runMigrations(pg, { realPostgres: false });
    const second = await runMigrations(pg, { realPostgres: false });

    expect(second.applied).toEqual([]);
    expect(second.skipped.length).toBe(first.applied.length);
    expect(second.total).toBe(first.total);

    // A third run over the same connection is still a clean no-op.
    const third = await runMigrations(pg, { realPostgres: false });
    expect(third.applied).toEqual([]);
    expect(third.skipped.length).toBe(first.applied.length);
  });

  it('skips real-Postgres-only migrations under pg-mem but discovers them for real pg', async () => {
    const all = await discoverMigrations({ realPostgres: true });
    const memOnly = await discoverMigrations({ realPostgres: false });

    const pgOnly = all.filter((m) => m.realPostgresOnly);
    expect(pgOnly.length).toBeGreaterThan(0); // the immutability triggers exist
    // None of the real-Postgres-only migrations appear in the pg-mem set.
    for (const m of memOnly) expect(m.realPostgresOnly).toBe(false);
    expect(memOnly.length).toBe(all.length - pgOnly.length);
  });

  it('fails loud on a checksum mismatch for an already-applied migration', async () => {
    const pg = freshPg();
    const v1: MigrationSource[] = [
      inlineSource('demo', 'm1', 'CREATE TABLE IF NOT EXISTS demo_t (a TEXT);'),
    ];
    const applied = await runMigrations(pg, { realPostgres: false, sources: v1 });
    expect(applied.applied).toEqual([{ store: 'demo', name: 'm1' }]);

    // Same (store, name) but EDITED sql — the recorded checksum no longer matches.
    const v2: MigrationSource[] = [
      inlineSource('demo', 'm1', 'CREATE TABLE IF NOT EXISTS demo_t (a TEXT, b TEXT);'),
    ];
    await expect(runMigrations(pg, { realPostgres: false, sources: v2 })).rejects.toBeInstanceOf(
      ChecksumMismatchError,
    );
  });

  it('checksum is a stable content hash', () => {
    const sql = 'CREATE TABLE IF NOT EXISTS t (a TEXT);';
    expect(checksumOf(sql)).toBe(checksumOf(sql));
    expect(checksumOf(sql)).not.toBe(checksumOf(sql + ' '));
  });
});
