import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'fs';
import {
  createNeo4jGraphStore,
  type GraphStore,
  type Mutation,
  type Neo4jRunner,
} from '@/lib/graph';

/**
 * CI integration spec: the Neo4j adapter's Cypher run against a REAL Neo4j over
 * bolt (via @testcontainers/neo4j + neo4j-driver). It SKIPS with a clear reason
 * when Docker is absent (this sandbox), so it is authored-for-CI and never red
 * locally — the in-memory fake (tests/graph/graphStore.contract.test.ts) proves
 * the same semantics in-process, and cypher.test.ts proves the rendering. When the
 * owner's CI runs this with Docker present, it exercises real bolt semantics:
 * MERGE idempotency, back-ticked segmentation labels, and provenance on edges.
 *
 * NOTE: this uses neo4j-driver (installed) and @testcontainers/neo4j (optional).
 * The imports are dynamic and inside the guarded block, so a missing testcontainer
 * package never breaks collection.
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
    '[skip] tests/integration/graph.neo4j.testcontainers.test.ts — Docker is not available; ' +
      'the in-memory Neo4j fake (tests/graph/*) and cypher.test.ts cover the same ' +
      'semantics and rendering in-process. Run in CI with a Docker daemon and ' +
      '@testcontainers/neo4j installed to exercise real bolt.',
  );
}

const MUTS: Mutation[] = [
  { op: 'UpsertNode', kind: 'Member', key: 'M1', properties: { id: 'M1' } },
  { op: 'UpsertNode', kind: 'Encounter', key: 'Encounter/e1', properties: { encounterClass: 'IMP' }, restricted: true },
  { op: 'SetLabel', kind: 'Encounter', key: 'Encounter/e1', label: '42-CFR-Part-2' },
  {
    op: 'UpsertEdge', type: 'HAS_UNMET_NEED',
    from: { kind: 'Member', key: 'M1' }, to: { kind: 'SocialNeed', key: 'M1:housing' },
    properties: { domain: 'housing' }, validity: { start: '2026-03-01', end: null },
    semantics: { kind: 'causal', asserter: 'community-reported', basis: 'Z59.0@o1' },
  },
];

describe.skipIf(!HAS_DOCKER)('graph over real Neo4j (testcontainers/bolt)', () => {
  let container: { stop: () => Promise<unknown>; getBoltUri: () => string } | undefined;
  let driver: { session: () => Neo4jRunner & { close: () => Promise<void> }; close: () => Promise<void> } | undefined;
  let store: GraphStore;
  let session: Neo4jRunner & { close: () => Promise<void> };

  beforeAll(async () => {
    // Computed specifier: @testcontainers/neo4j is an OPTIONAL CI-only dependency,
    // so it is not resolved at type-check time (it may be absent locally).
    const tcSpec = ['@testcontainers', 'neo4j'].join('/');
    const tc = (await import(/* @vite-ignore */ tcSpec)) as {
      Neo4jContainer: new (image: string) => {
        withoutAuthentication(): { start(): Promise<NonNullable<typeof container>> };
      };
    };
    const neo4j = (await import('neo4j-driver')).default;
    container = await new tc.Neo4jContainer('neo4j:5-community').withoutAuthentication().start();
    driver = neo4j.driver(container!.getBoltUri()) as unknown as typeof driver;
    session = driver!.session();
    store = createNeo4jGraphStore(session);
  }, 180_000);

  afterAll(async () => {
    if (session) await session.close();
    if (driver) await driver.close();
    if (container) await container.stop();
  });

  it('applies mutations and reads back nodes/edges (real bolt)', async () => {
    await store.apply(MUTS);
    const enc = await store.getNode('Encounter', 'Encounter/e1');
    expect(enc?.restricted).toBe(true);
    expect(enc?.labels).toContain('42-CFR-Part-2');
    const causal = await store.listEdges({ type: 'HAS_UNMET_NEED' });
    expect(causal[0].causal).toBe(true);
    expect(causal[0].asserter).toBe('community-reported');
  });

  it('MERGE makes apply idempotent on replay (real bolt)', async () => {
    await store.apply(MUTS);
    await store.apply(MUTS);
    const members = await store.listNodes({ kind: 'Member' });
    expect(members).toHaveLength(1);
  });
});
