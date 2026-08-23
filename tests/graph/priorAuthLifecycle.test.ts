import { describe, it, expect } from 'vitest';
import type { C2Event } from '@/lib/outbox';
import {
  LENSES,
  type GraphStore,
  project,
  projectEvent,
  type Mutation,
  type UpsertEdge,
  type UpsertNode,
} from '@/lib/graph';
import { c2, fixedNow, makeNeo4jFakeStore, makePgGraphStore } from './helpers';

const deps = { now: fixedNow };

function edges(muts: Mutation[]): UpsertEdge[] {
  return muts.filter((m): m is UpsertEdge => m.op === 'UpsertEdge');
}
function nodes(muts: Mutation[]): UpsertNode[] {
  return muts.filter((m): m is UpsertNode => m.op === 'UpsertNode');
}

/** A captured PA lifecycle: submitted -> pending -> approved, linked to a ServiceRequest + Claim. */
function paStream(memberId = 'M1'): C2Event[] {
  return [
    c2({
      eventId: `${memberId}-pa1`, eventType: 'pa-lifecycle.captured', memberId, occurredAt: '2026-05-01T00:00:00Z',
      payload: {
        paRef: `PriorAuthRequest/${memberId}-pa1`,
        serviceRequestRef: 'ServiceRequest/sr-100',
        claimRef: 'Claim/c-1',
        currentStatus: 'approved',
        submittedAt: '2026-05-01',
        decisionAt: '2026-05-05',
        statusHistory: [
          { status: 'submitted', at: '2026-05-01', seq: 0 },
          { status: 'pending', at: '2026-05-02', seq: 1 },
          { status: 'approved', at: '2026-05-05', seq: 2 },
        ],
        provenance: 'pa-lifecycle-capture',
      },
    }),
  ];
}

describe('pa-lifecycle projector emits the neutral instruction set', () => {
  it('captured -> PriorAuthRequest + HAS_PA_REQUEST + links to ServiceRequest and Claim', () => {
    const muts = projectEvent(paStream('M1')[0], deps);
    expect(nodes(muts).some((m) => m.kind === 'PriorAuthRequest')).toBe(true);

    const hasPa = edges(muts).find((m) => m.type === 'HAS_PA_REQUEST')!;
    expect(hasPa.from).toEqual({ kind: 'Member', key: 'M1' });
    expect(hasPa.to).toEqual({ kind: 'PriorAuthRequest', key: 'PriorAuthRequest/M1-pa1' });
    expect(hasPa.semantics.kind).toBe('associative');
    expect(hasPa.validity).toEqual({ start: '2026-05-01', end: '2026-05-05' });

    const forService = edges(muts).find((m) => m.type === 'PA_FOR_SERVICE')!;
    expect(forService.to).toEqual({ kind: 'ServiceRequest', key: 'ServiceRequest/sr-100' });
    const forClaim = edges(muts).find((m) => m.type === 'PA_FOR_CLAIM')!;
    expect(forClaim.to).toEqual({ kind: 'Claim', key: 'Claim/c-1' });
  });

  it('models dated status transitions as validity intervals (one HAS_PA_STATUS edge per phase)', () => {
    const muts = projectEvent(paStream('M1')[0], deps);
    const phases = edges(muts).filter((m) => m.type === 'HAS_PA_STATUS');
    expect(phases).toHaveLength(3);
    // Each phase interval opens at its timestamp and closes at the next phase's; the latest is open.
    expect(phases.map((p) => p.validity)).toEqual([
      { start: '2026-05-01', end: '2026-05-02' },
      { start: '2026-05-02', end: '2026-05-05' },
      { start: '2026-05-05', end: null },
    ]);
    expect(phases.map((p) => p.properties?.status)).toEqual(['submitted', 'pending', 'approved']);
  });

  it('does NOT set authoritative state: every captured node is non-authoritative + references (not drives) the machine state', () => {
    const muts = projectEvent(paStream('M1')[0], deps);
    const paNode = nodes(muts).find((m) => m.kind === 'PriorAuthRequest')!;
    expect(paNode.properties.authoritative).toBe(false);
    expect(paNode.properties.stateSource).toBe('pa-lifecycle-capture');
    expect(paNode.properties.machineState).toBe('Approved'); // referenced label, not an authoritative decision
    for (const statusNode of nodes(muts).filter((m) => m.kind === 'PaStatusEvent')) {
      expect(statusNode.properties.authoritative).toBe(false);
    }
  });
});

describe('pa-lifecycle projection: both backends rebuild the identical lifecycle', () => {
  async function seeded(memberId = 'M1'): Promise<{ pg: GraphStore; neo: GraphStore }> {
    const muts = project(paStream(memberId), deps);
    const pg = await makePgGraphStore();
    const neo = makeNeo4jFakeStore();
    await pg.apply(muts);
    await neo.apply(muts);
    return { pg, neo };
  }

  it('projects the PriorAuthRequest, its dated status phases, and the linkage edges', async () => {
    const { pg } = await seeded();
    expect(await pg.listEdges({ type: 'HAS_PA_REQUEST' })).toHaveLength(1);
    expect(await pg.listEdges({ type: 'HAS_PA_STATUS' })).toHaveLength(3);
    expect(await pg.listEdges({ type: 'PA_FOR_SERVICE' })).toHaveLength(1);
    expect(await pg.listEdges({ type: 'PA_FOR_CLAIM' })).toHaveLength(1);
    const statusNodes = (await pg.listNodes({ kind: 'PaStatusEvent' }));
    expect(statusNodes).toHaveLength(3);
  });

  it('Postgres and Neo4j project byte-identical nodes and edges', async () => {
    const { pg, neo } = await seeded();
    expect(await neo.listNodes()).toEqual(await pg.listNodes());
    expect(await neo.listEdges()).toEqual(await pg.listEdges());
  });

  it('idempotent: replaying the lifecycle twice yields the same graph', async () => {
    const { pg } = await seeded();
    const first = { nodes: await pg.listNodes(), edges: await pg.listEdges() };
    await pg.apply(project(paStream(), deps));
    expect({ nodes: await pg.listNodes(), edges: await pg.listEdges() }).toEqual(first);
  });
});

describe('lens read now surfaces pa-lifecycle', () => {
  it('whole-person surfaces the PriorAuthRequest off the member, both backends', async () => {
    const muts = project(paStream('M1'), deps);
    for (const store of [await makePgGraphStore(), makeNeo4jFakeStore()]) {
      await store.apply(muts);
      const r = await LENSES['whole-person'](store, 'M1');
      expect(r.nodes.map((n) => `${n.kind}:${n.key}`)).toContain('PriorAuthRequest:PriorAuthRequest/M1-pa1');
      expect(r.edges.map((e) => `${e.type}:${e.to.key}`)).toContain('HAS_PA_REQUEST:PriorAuthRequest/M1-pa1');
    }
  });
});
