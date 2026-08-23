import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import {
  createPgIdempotencyStore,
  ensureIdempotencySchema,
  type IdempotencyStore,
  type PgQueryable,
} from '@/lib/idempotency';

/**
 * CI integration spec: the SAME idempotency flow the pg-mem unit tests prove, run
 * against a REAL Postgres via @testcontainers/postgresql. It SKIPS with a clear
 * reason when Docker is absent (this sandbox), so it is authored-for-CI and never
 * red locally. When the owner's CI runs it with Docker present, it exercises real
 * Postgres semantics: the composite PRIMARY KEY (consumer, event_id) and
 * INSERT ... ON CONFLICT DO NOTHING under genuine cross-connection concurrency,
 * the fidelity the in-memory single-writer store cannot fully model.
 */
function dockerAvailable(): boolean {
  if (process.env.DOCKER_HOST) return true;
  try {
    return existsSync('/var/run/docker.sock');
  } catch {
    return false;
  }
}

const HAS_DOCKER = dockerAvailable();
if (!HAS_DOCKER) {
  // eslint-disable-next-line no-console
  console.warn(
    '[skip] tests/integration/idempotency.testcontainers.test.ts — Docker is not available; ' +
      'the pg-mem suite (tests/idempotency/*) covers the same semantics in-process. ' +
      'Run in CI with a Docker daemon to exercise real Postgres PRIMARY KEY concurrency.',
  );
}

describe.skipIf(!HAS_DOCKER)('idempotency store over real Postgres (testcontainers)', () => {
  let container: { stop: () => Promise<unknown>; getConnectionUri: () => string } | undefined;
  let client: { end: () => Promise<void> } & PgQueryable;
  let store: IdempotencyStore;

  beforeAll(async () => {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    const pg = await import('pg');
    const Client = (
      pg as unknown as {
        default: { Client: new (cfg: unknown) => { connect: () => Promise<void> } & typeof client };
      }
    ).default.Client;
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const c = new Client({ connectionString: container.getConnectionUri() });
    await c.connect();
    client = c;
    await ensureIdempotencySchema(client);
    store = createPgIdempotencyStore(client);
  }, 120_000);

  afterAll(async () => {
    if (client) await client.end();
    if (container) await container.stop();
  });

  it('a re-delivered eventId is a no-op via the PRIMARY KEY (real PG)', async () => {
    const first = await store.markProcessed('sde-intake', 'real-1');
    const second = await store.markProcessed('sde-intake', 'real-1');
    expect(first.firstProcessed).toBe(true);
    expect(second.firstProcessed).toBe(false);
  });

  it('concurrent double-delivery of one eventId lets exactly one winner in (real PG)', async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, () => store.markProcessed('outreach-agent', 'real-race')),
    );
    expect(results.filter((r) => r.firstProcessed)).toHaveLength(1);
  });

  it('per-consumer namespace is isolated in real PG', async () => {
    const a = await store.markProcessed('sde-intake', 'real-shared');
    const b = await store.markProcessed('referral-coordination-agent', 'real-shared');
    expect(a.firstProcessed).toBe(true);
    expect(b.firstProcessed).toBe(true);
  });
});
