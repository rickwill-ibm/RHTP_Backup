import { describe, it, expect } from 'vitest';
import type { GraphStore, Mutation } from '@/lib/graph';
import { makeNeo4jFakeStore, makePgGraphStore } from './helpers';

/**
 * The GraphStore CONTRACT TEST — the co-equal guarantee in code (ADR-001 v12.3).
 * The SAME mutation stream is applied to BOTH certified backends (Postgres via
 * pg-mem, Neo4j via the in-memory fake) and the SAME reads must return identical
 * logical results. A backend that passes this is a certified, swappable backend.
 */
const backends: Array<[string, () => Promise<GraphStore>]> = [
  ['postgres (pg-mem)', async () => makePgGraphStore()],
  ['neo4j (fake)', async () => makeNeo4jFakeStore()],
];

const SCENARIO: Mutation[] = [
  { op: 'UpsertNode', kind: 'Member', key: 'M1', properties: { id: 'M1' } },
  { op: 'UpsertNode', kind: 'Coverage', key: 'Coverage/c1', properties: { planCode: 'PLAN-A', status: 'active' } },
  {
    op: 'UpsertEdge', type: 'HAS_COVERAGE',
    from: { kind: 'Member', key: 'M1' }, to: { kind: 'Coverage', key: 'Coverage/c1' },
    properties: { planCode: 'PLAN-A' }, validity: { start: '2026-01-01', end: null },
    semantics: { kind: 'associative' },
  },
  // A restricted (Part 2) node with segmentation labels.
  { op: 'UpsertNode', kind: 'Encounter', key: 'Encounter/e1', properties: { encounterClass: 'IMP' }, restricted: true },
  { op: 'SetLabel', kind: 'Encounter', key: 'Encounter/e1', label: 'Restricted' },
  { op: 'SetLabel', kind: 'Encounter', key: 'Encounter/e1', label: '42-CFR-Part-2' },
  {
    op: 'UpsertEdge', type: 'HAD_ENCOUNTER',
    from: { kind: 'Member', key: 'M1' }, to: { kind: 'Encounter', key: 'Encounter/e1' },
    properties: {}, validity: { start: '2026-02-01', end: null }, semantics: { kind: 'associative' },
  },
  // A causal edge carrying provenance.
  { op: 'UpsertNode', kind: 'SocialNeed', key: 'M1:housing', properties: { domain: 'housing' } },
  {
    op: 'UpsertEdge', type: 'HAS_UNMET_NEED',
    from: { kind: 'Member', key: 'M1' }, to: { kind: 'SocialNeed', key: 'M1:housing' },
    properties: { domain: 'housing' }, validity: { start: '2026-03-01', end: null },
    semantics: { kind: 'causal', asserter: 'community-reported', basis: 'Z59.0@Observation/o1' },
  },
];

async function readAll(store: GraphStore) {
  return {
    member: await store.getNode('Member', 'M1'),
    encounter: await store.getNode('Encounter', 'Encounter/e1'),
    nodes: await store.listNodes(),
    restricted: await store.listNodes({ restricted: true }),
    coverageEdges: await store.listEdges({ type: 'HAS_COVERAGE' }),
    causalEdges: await store.listEdges({ type: 'HAS_UNMET_NEED' }),
    memberEdges: await store.listEdges({ fromKey: 'M1' }),
  };
}

describe.each(backends)('GraphStore contract [%s]', (_name, make) => {
  it('applies mutations and reads back the expected graph', async () => {
    const store = await make();
    await store.apply(SCENARIO);
    const r = await readAll(store);

    expect(r.member).toEqual({ kind: 'Member', key: 'M1', labels: ['Member'], properties: { id: 'M1' }, restricted: false });
    // Restricted node: flag set + segmentation label carried, kind-first label order.
    expect(r.encounter?.restricted).toBe(true);
    expect(r.encounter?.labels).toEqual(['Encounter', '42-CFR-Part-2', 'Restricted']);

    expect(r.restricted.map((n) => n.key)).toEqual(['Encounter/e1']);

    // Associative edge: not causal, dated, no provenance.
    expect(r.coverageEdges).toHaveLength(1);
    expect(r.coverageEdges[0].causal).toBe(false);
    expect(r.coverageEdges[0].validity).toEqual({ start: '2026-01-01', end: null });
    expect(r.coverageEdges[0].asserter).toBeUndefined();

    // Causal edge: carries asserter + basis provenance.
    expect(r.causalEdges).toHaveLength(1);
    expect(r.causalEdges[0].causal).toBe(true);
    expect(r.causalEdges[0].asserter).toBe('community-reported');
    expect(r.causalEdges[0].basis).toBe('Z59.0@Observation/o1');

    expect(r.memberEdges.map((e) => e.type).sort()).toEqual(['HAD_ENCOUNTER', 'HAS_COVERAGE', 'HAS_UNMET_NEED']);
  });

  it('apply is idempotent: replaying the stream yields the identical graph', async () => {
    const store = await make();
    await store.apply(SCENARIO);
    const once = await readAll(store);
    await store.apply(SCENARIO); // replay
    await store.apply(SCENARIO); // and again
    const thrice = await readAll(store);
    expect(thrice).toEqual(once);
  });

  it('SetValidity closes an edge interval', async () => {
    const store = await make();
    await store.apply(SCENARIO);
    await store.apply([
      {
        op: 'SetValidity', type: 'HAD_ENCOUNTER',
        from: { kind: 'Member', key: 'M1' }, to: { kind: 'Encounter', key: 'Encounter/e1' },
        validity: { start: '2026-02-01', end: '2026-02-05' },
      },
    ]);
    const edges = await store.listEdges({ type: 'HAD_ENCOUNTER' });
    expect(edges[0].validity).toEqual({ start: '2026-02-01', end: '2026-02-05' });
  });
});

/**
 * Cross-backend equivalence: the two backends produce byte-identical read-back for
 * the same mutation stream. This is the co-equal assertion made explicit.
 */
describe('GraphStore backends are logically identical', () => {
  it('postgres and neo4j-fake return equal records for the same mutations', async () => {
    const pg = await makePgGraphStore();
    const neo = makeNeo4jFakeStore();
    await pg.apply(SCENARIO);
    await neo.apply(SCENARIO);
    expect(await readAll(neo)).toEqual(await readAll(pg));
  });
});
