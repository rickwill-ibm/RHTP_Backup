import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import {
  OutboxSweeper,
  OutboxWriter,
  createPgOutboxStore,
  ensureOutboxSchema,
  intentRowFrom,
  type OutboxStore,
  type PgQueryable,
} from '@/lib/outbox';
import { intent, makeDeps } from '../outbox/fakes';

/**
 * CI integration spec: the SAME outbox flow the pg-mem unit tests prove, run
 * against a REAL Postgres via @testcontainers/postgresql. It SKIPS with a clear
 * reason when Docker is absent (this sandbox), so it is authored-for-CI and never
 * red locally. When the owner's CI runs it with Docker present, it exercises real
 * Postgres semantics (unique constraint, ON CONFLICT, MAX() sequencing).
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
    '[skip] tests/integration/outbox.testcontainers.test.ts — Docker is not available; ' +
      'the pg-mem suite (tests/outbox/*) covers the same semantics in-process. ' +
      'Run in CI with a Docker daemon to exercise real Postgres.',
  );
}

describe.skipIf(!HAS_DOCKER)('outbox over real Postgres (testcontainers)', () => {
  let container: { stop: () => Promise<unknown>; getConnectionUri: () => string } | undefined;
  let client: { end: () => Promise<void> } & PgQueryable;
  let store: OutboxStore;

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
    await ensureOutboxSchema(client);
    store = createPgOutboxStore(client);
  }, 120_000);

  afterAll(async () => {
    if (client) await client.end();
    if (container) await container.stop();
  });

  it('commits intents, applies FHIR, and publishes events in per-member sequence order', async () => {
    const deps = makeDeps(store);
    const writer = new OutboxWriter(deps);
    for (const n of [1, 2, 3]) {
      await writer.enqueue(
        intent({ memberId: 'mem-real', idempotencyKey: `rk-${n}`, fhirResourceId: `Coverage/real-${n}` }),
      );
    }
    const result = await writer.pump('mem-real');
    expect(result.published).toHaveLength(3);
    expect(deps.publisher.events.map((e) => e.sequence)).toEqual([0, 1, 2]);
  });

  it('dedupes a re-submitted idempotency key via the UNIQUE constraint', async () => {
    const deps = makeDeps(store);
    const writer = new OutboxWriter(deps);
    const a = await writer.enqueue(intent({ memberId: 'mem-dup', idempotencyKey: 'same', fhirResourceId: 'Coverage/dup' }));
    const b = await writer.enqueue(intent({ memberId: 'mem-dup', idempotencyKey: 'same', fhirResourceId: 'Coverage/dup' }));
    expect(a.deduped).toBe(false);
    expect(b.deduped).toBe(true);
  });

  it('UNIQUE(member_id, sequence) rejects a duplicate per-member sequence (real PG)', async () => {
    // Two rows both trying to occupy (mem-uniq, 0): the DB constraint must reject
    // the second. This is the backstop the pg-mem probe cannot fully prove.
    const r1 = intentRowFrom(intent({ memberId: 'mem-uniq', idempotencyKey: 'u1', fhirResourceId: 'Coverage/u1' }), 'u1', 1000);
    const r2 = intentRowFrom(intent({ memberId: 'mem-uniq', idempotencyKey: 'u2', fhirResourceId: 'Coverage/u2' }), 'u2', 1000);
    await store.enqueue(r1);
    await store.enqueue(r2);
    expect(await store.claimForConfirm('u1', 'mem-uniq', 2000)).toBe(0);
    // Force a collision: park r2 at sequence 0 directly — the UNIQUE index fails.
    await expect(store.update('u2', { status: 'confirmed', sequence: 0 })).rejects.toThrow();
  });

  it('writer racing the sweep publishes each intent EXACTLY once (real PG)', async () => {
    // Both the live writer and the reconciliation sweep target the same stale
    // pending intent. The claimForConfirm CAS must let exactly one publish it.
    const deps = makeDeps(store);
    const writer = new OutboxWriter(deps);
    await writer.enqueue(intent({ memberId: 'mem-race', idempotencyKey: 'race-1', fhirResourceId: 'Coverage/race-1' }));
    const sweeper = new OutboxSweeper(deps);
    // Run both concurrently against real Postgres (no shared in-process lock helps
    // across the two objects here — the DB CAS is what enforces exactly-once).
    await Promise.all([writer.pump('mem-race'), sweeper.sweep(0)]);
    const published = deps.publisher.events.filter((e) => e.memberId === 'mem-race');
    expect(published).toHaveLength(1);
    expect(published[0].sequence).toBe(0);
  });
});
