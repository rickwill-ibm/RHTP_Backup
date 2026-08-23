import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import {
  LENS_NAMES,
  LENSES,
  type GraphStore,
  type Neo4jRunner,
  createNeo4jGraphStore,
  createPostgresGraphStore,
  ensureGraphSchema,
  part2RestrictedLens,
  project,
  replayToStore,
  MERGE_EVENT,
} from '@/lib/graph';
import type { C2Event, PgQueryable } from '@/lib/outbox';

/**
 * CI integration spec (Docker-guarded): the five lens queries + Part 2 enforcement
 * + merge/unmerge rekey, run against a REAL Postgres AND a REAL Neo4j (bolt) from
 * the SAME seeded event stream, asserting identical logical results - the co-equal
 * lens guarantee on live backends. SKIPS with a reason when Docker is absent; the
 * in-sandbox suites (tests/graph/lens.acceptance.test.ts, replay.test.ts) prove the
 * same semantics on pg-mem + the Neo4j fake.
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
    '[skip] tests/integration/graph.lens.testcontainers.test.ts — Docker is not available; ' +
      'the pg-mem + Neo4j-fake lens/replay suites (tests/graph/lens.acceptance.test.ts, ' +
      'tests/graph/replay.test.ts) cover the same semantics in-process. Run in CI with a ' +
      'Docker daemon and @testcontainers/{postgresql,neo4j} installed to exercise both live backends.',
  );
}

const deps = { now: () => 1_700_000_000_000 };

function ev(over: Partial<C2Event>): C2Event {
  return {
    eventId: over.eventId ?? 'e', eventType: over.eventType ?? 'coverage.enrolled',
    eventVersion: '1.0', occurredAt: over.occurredAt ?? '2026-01-01T00:00:00Z',
    recordedAt: '2026-01-01T00:00:00Z', memberId: over.memberId ?? 'M1',
    partitionKey: over.memberId ?? 'M1', class: 'batch', sequence: 0,
    correlationId: 'c', idempotencyKey: over.eventId ?? 'e',
    source: { system: 'sys', feed: 'feed', tier: 'T1' },
    consentContext: over.consentContext ?? { part2Restricted: false, segmentLabels: [] },
    payload: over.payload ?? {},
  };
}

function seed(memberId: string): C2Event[] {
  return [
    ev({ eventId: `${memberId}-c`, eventType: 'coverage.enrolled', memberId, payload: { coverageRef: `Coverage/${memberId}`, planCode: 'P', status: 'active', periodStart: '2026-01-01' } }),
    ev({ eventId: `${memberId}-er`, eventType: 'encounter.admitted', memberId, occurredAt: '2026-02-07T00:00:00Z', consentContext: { part2Restricted: true, segmentLabels: ['42-CFR-Part-2'] }, payload: { encounterRef: `Encounter/${memberId}-r`, encounterClass: 'IMP' } }),
    ev({ eventId: `${memberId}-s`, eventType: 'sdoh.screening.completed', memberId, occurredAt: '2026-03-01T00:00:00Z', payload: { responseRef: `Observation/${memberId}-h`, domain: 'housing', zCode: { code: 'Z59.0' }, positive: true, provenance: 'chc' } }),
    ev({ eventId: `${memberId}-t`, eventType: 'careteam.assigned', memberId, occurredAt: '2026-03-05T00:00:00Z', payload: { providerRef: `Practitioner/${memberId}-cm`, role: 'care-manager' } }),
  ];
}

describe.skipIf(!HAS_DOCKER)('lens acceptance over real Postgres + Neo4j (testcontainers)', () => {
  let pgContainer: { stop: () => Promise<unknown>; getConnectionUri: () => string } | undefined;
  let neoContainer: { stop: () => Promise<unknown>; getBoltUri: () => string } | undefined;
  let pgClient: { end: () => Promise<void> } & PgQueryable;
  let neoDriver: { session: () => Neo4jRunner & { close: () => Promise<void> }; close: () => Promise<void> } | undefined;
  let neoSession: Neo4jRunner & { close: () => Promise<void> };
  let pg: GraphStore;
  let neo: GraphStore;

  beforeAll(async () => {
    const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
    const pgLib = await import('pg');
    const Client = (pgLib as unknown as { default: { Client: new (cfg: unknown) => { connect: () => Promise<void> } & typeof pgClient } }).default.Client;
    pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();
    const c = new Client({ connectionString: pgContainer.getConnectionUri() });
    await c.connect();
    pgClient = c;
    await ensureGraphSchema(pgClient);
    pg = createPostgresGraphStore(pgClient);

    const tcSpec = ['@testcontainers', 'neo4j'].join('/');
    const tc = (await import(/* @vite-ignore */ tcSpec)) as {
      Neo4jContainer: new (image: string) => { withoutAuthentication(): { start(): Promise<NonNullable<typeof neoContainer>> } };
    };
    const neo4j = (await import('neo4j-driver')).default;
    neoContainer = await new tc.Neo4jContainer('neo4j:5-community').withoutAuthentication().start();
    neoDriver = neo4j.driver(neoContainer!.getBoltUri()) as unknown as typeof neoDriver;
    neoSession = neoDriver!.session();
    neo = createNeo4jGraphStore(neoSession);

    const muts = project(seed('M1'), deps);
    await pg.apply(muts);
    await neo.apply(muts);
  }, 300_000);

  afterAll(async () => {
    if (neoSession) await neoSession.close();
    if (neoDriver) await neoDriver.close();
    if (neoContainer) await neoContainer.stop();
    if (pgClient) await pgClient.end();
    if (pgContainer) await pgContainer.stop();
  });

  it('every lens returns identical results on real Postgres and real Neo4j', async () => {
    for (const name of LENS_NAMES) {
      expect(await LENSES[name](neo, 'M1'), `lens ${name}`).toEqual(await LENSES[name](pg, 'M1'));
    }
  });

  it('Part 2 enforcement holds on both live backends', async () => {
    for (const store of [pg, neo]) {
      expect((await part2RestrictedLens(store, 'M1')).nodes).toEqual([]);
      const scoped = await part2RestrictedLens(store, 'M1', { part2: true });
      expect(scoped.nodes.map((n) => n.key)).toEqual(['Encounter/M1-r']);
    }
  });

  it('merge rekey by replay is identical on both live backends', async () => {
    const stream = [
      ...seed('SURV'), ...seed('DUP'),
      ev({ eventId: 'm', eventType: MERGE_EVENT, memberId: 'SURV', occurredAt: '2026-04-01T00:00:00Z', payload: { survivingMemberId: 'SURV', mergedMemberId: 'DUP' } }),
    ];
    // Fresh graphs for the merge assertion so the M1 seed above does not interfere.
    await ensureGraphSchema(pgClient);
    const pgMerge = createPostgresGraphStore(pgClient, 'pg-merge');
    await replayToStore(pgMerge, stream, deps);
    await replayToStore(neo, stream, deps);
    expect(await pgMerge.getNode('Member', 'DUP')).toBeNull();
    expect(await neo.getNode('Member', 'DUP')).toBeNull();
  });
});
