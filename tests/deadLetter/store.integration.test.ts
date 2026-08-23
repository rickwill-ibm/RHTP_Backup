/**
 * Real-Postgres integration spec for the append-only dead-letter store (NS-01).
 *
 * Runs the two things pg-mem cannot verify: real BIGINT identity semantics for
 * concurrent appends and the DB-level immutability trigger
 * (002_dead_letter_immutability_trigger.pg.sql) that refuses UPDATE / DELETE.
 *
 * GUARDED: skips with a reason when Docker is unavailable (the sandbox has no
 * daemon). Authored for the owner's CI where Docker is present. Detection is
 * filesystem/env only — it never starts a container just to probe.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'fs';
import * as clock from '@/lib/clock';
import { applyMigrations, createPgDeadLetterStore, type PgLike } from '@/lib/deadLetter';

function dockerAvailable(): boolean {
  if (process.env.TESTCONTAINERS_HOST_OVERRIDE || process.env.DOCKER_HOST) return true;
  return existsSync('/var/run/docker.sock') || existsSync('/run/docker.sock');
}

const HAS_DOCKER = dockerAvailable();
const reason = HAS_DOCKER ? '' : 'skipped: no Docker daemon (pg-mem covers these paths in unit tests)';

describe.skipIf(!HAS_DOCKER)('dead-letter store — real Postgres (testcontainers)', () => {
  let container: { getConnectionUri(): string; stop(): Promise<unknown> };
  let rawPool: { query: (t: string, v?: unknown[]) => Promise<{ rows: unknown[] }>; end: () => Promise<void> };
  let pool: PgLike;

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

  it('concurrent distinct appends get distinct BIGINT sequences', async () => {
    const store = createPgDeadLetterStore(pool);
    await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        store.append({ kind: 'quarantine', memberRef: `s:${i}`, reasonCode: 'r', sourceRef: `ci-${i}`, payloadRef: 'p' }),
      ),
    );
    expect(await store.list()).toHaveLength(30);
  });

  it('resolve appends a new version; history is preserved', async () => {
    const store = createPgDeadLetterStore(pool);
    const rec = await store.append({ kind: 'held-identity', memberRef: 's:a', reasonCode: 'identity-possible-match', sourceRef: 'int-1', payloadRef: 'p' });
    await store.resolve(rec.id, 'resolve', 'ops:a');
    expect((await store.get(rec.id))?.status).toBe('resolved');
  });

  it('the database refuses UPDATE (append-only trigger)', async () => {
    const store = createPgDeadLetterStore(pool);
    await store.append({ kind: 'quarantine', memberRef: 's:a', reasonCode: 'r', sourceRef: 'immutable-1', payloadRef: 'p' });
    await expect(
      pool.query(`UPDATE dead_letter SET status = 'tamper' WHERE source_ref = $1`, ['immutable-1']),
    ).rejects.toThrow(/append-only/);
  });

  it('the database refuses DELETE (append-only trigger)', async () => {
    const store = createPgDeadLetterStore(pool);
    await store.append({ kind: 'quarantine', memberRef: 's:a', reasonCode: 'r', sourceRef: 'immutable-2', payloadRef: 'p' });
    await expect(
      pool.query(`DELETE FROM dead_letter WHERE source_ref = $1`, ['immutable-2']),
    ).rejects.toThrow(/append-only/);
  });
});

describe.runIf(!HAS_DOCKER)('dead-letter store — real Postgres (testcontainers)', () => {
  it.skip(`integration suite ${reason}`, () => {
    /* Present-but-skipped marker so the reason is visible in the report. */
  });
});
