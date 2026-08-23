/**
 * Real-Postgres integration spec for the append-only evidence ledger (O-1).
 *
 * Runs the SAME behavior suite as the pg-mem unit test, plus the two things
 * pg-mem cannot verify: real BIGINT identity semantics and the DB-level
 * immutability trigger (002_..._immutability_trigger.pg.sql) that refuses
 * UPDATE / DELETE.
 *
 * GUARDED: skips with a reason when Docker is unavailable (the sandbox has no
 * daemon). It is authored for the owner's CI, where Docker is present. Detection
 * is filesystem/env only — it never starts a container just to probe.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'fs';
import * as clock from '@/lib/clock';
import { applyMigrations, createPgEvidenceLedger, type PgLike } from '@/lib/evidence/store';
import { createEvidenceRecord, appendEntry, type EvidenceRecord } from '@/lib/evidence';

function dockerAvailable(): boolean {
  if (process.env.TESTCONTAINERS_HOST_OVERRIDE || process.env.DOCKER_HOST) return true;
  return existsSync('/var/run/docker.sock') || existsSync('/run/docker.sock');
}

const HAS_DOCKER = dockerAvailable();
const reason = HAS_DOCKER ? '' : 'skipped: no Docker daemon (pg-mem covers these paths in unit tests)';

function record(id: string): EvidenceRecord {
  return createEvidenceRecord({ id, memberId: 'M1', order: { code: '72148' }, createdAt: '2026-08-22T00:00:00.000Z' });
}

// describe.skipIf keeps the file green (and honest) when Docker is absent.
describe.skipIf(!HAS_DOCKER)('pg evidence ledger — real Postgres (testcontainers)', () => {
  let container: { getConnectionUri(): string; stop(): Promise<unknown> };
  let pool: PgLike & { end?: () => Promise<void> };
  let rawPool: { query: (t: string, v?: unknown[]) => Promise<{ rows: unknown[] }>; end: () => Promise<void> };

  beforeAll(async () => {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    const { Pool } = await import('pg');
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    rawPool = new Pool({ connectionString: container.getConnectionUri() }) as unknown as typeof rawPool;
    pool = rawPool as unknown as PgLike;
    await applyMigrations(pool, { realPostgres: true }); // includes the .pg.sql trigger
  }, 120_000);

  afterAll(async () => {
    clock.setClock(null);
    if (rawPool?.end) await rawPool.end();
    if (container?.stop) await container.stop();
  });

  it('round-trips and preserves version history on real Postgres', async () => {
    clock.setClock(() => Date.parse('2026-08-22T12:00:00.000Z'));
    const ledger = createPgEvidenceLedger(pool);
    const v1 = record('int-1');
    await ledger.save(v1);
    const v2 = appendEntry(v1, { id: 'e1', ts: '2026-08-22T00:01:00.000Z', stage: 'prior-auth', type: 'note', text: 'x' });
    await ledger.save(v2);
    const history = await ledger.readLedger('int-1');
    expect(history.map((h) => h.provenance.version)).toEqual([1, 2]);
    expect(history[0].record.entries).toHaveLength(0);
    expect((await ledger.get('int-1'))?.entries).toHaveLength(1);
  });

  it('concurrent appends get distinct BIGINT sequences', async () => {
    const ledger = createPgEvidenceLedger(pool);
    await Promise.all(Array.from({ length: 30 }, (_, i) => ledger.save(record(`ci-${i}`))));
    const seqs = (
      await Promise.all(Array.from({ length: 30 }, (_, i) => ledger.readLedger(`ci-${i}`)))
    ).map((h) => h[0].provenance.seq);
    expect(new Set(seqs).size).toBe(30);
  });

  it('the database refuses UPDATE (append-only trigger)', async () => {
    const ledger = createPgEvidenceLedger(pool);
    await ledger.save(record('immutable-1'));
    await expect(pool.query(`UPDATE evidence_ledger SET actor = 'tamper' WHERE record_id = $1`, ['immutable-1'])).rejects.toThrow(/append-only/);
  });

  it('the database refuses DELETE (append-only trigger)', async () => {
    const ledger = createPgEvidenceLedger(pool);
    await ledger.save(record('immutable-2'));
    await expect(pool.query(`DELETE FROM evidence_ledger WHERE record_id = $1`, ['immutable-2'])).rejects.toThrow(/append-only/);
  });
});

describe.runIf(!HAS_DOCKER)('pg evidence ledger — real Postgres (testcontainers)', () => {
  it.skip(`integration suite ${reason}`, () => {
    /* Present-but-skipped marker so the reason is visible in the report. */
  });
});
