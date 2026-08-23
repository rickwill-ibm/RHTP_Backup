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

/**
 * A member's golden-thread financial chain: a paid chain (Claim -> ClaimResponse
 * complete -> EOB) and a denied ClaimResponse carrying CARC/RARC adjustment codes.
 */
function claimStream(memberId = 'M1'): C2Event[] {
  return [
    c2({
      eventId: `${memberId}-cl1`, eventType: 'claim.submitted', memberId, occurredAt: '2026-04-01T00:00:00Z',
      payload: { claimRef: `Claim/${memberId}-c1`, claimType: 'professional', use: 'claim', status: 'active', total: 250, created: '2026-04-01', billablePeriodStart: '2026-03-20', provenance: 'provider-submitted' },
    }),
    c2({
      eventId: `${memberId}-cr1`, eventType: 'claim.adjudicated', memberId, occurredAt: '2026-04-05T00:00:00Z',
      payload: { responseRef: `ClaimResponse/${memberId}-r1`, claimRef: `Claim/${memberId}-c1`, outcome: 'complete', disposition: 'paid', paymentAmount: 200, carcCodes: [], rarcCodes: [], created: '2026-04-05', provenance: 'payer-adjudication' },
    }),
    c2({
      eventId: `${memberId}-eob1`, eventType: 'claim.explained', memberId, occurredAt: '2026-04-06T00:00:00Z',
      payload: { eobRef: `ExplanationOfBenefit/${memberId}-e1`, responseRef: `ClaimResponse/${memberId}-r1`, claimRef: `Claim/${memberId}-c1`, outcome: 'complete', paymentAmount: 200, created: '2026-04-06', provenance: 'payer-eob' },
    }),
    c2({
      eventId: `${memberId}-cr2`, eventType: 'claim.adjudicated', memberId, occurredAt: '2026-04-14T00:00:00Z',
      payload: { responseRef: `ClaimResponse/${memberId}-r2`, claimRef: `Claim/${memberId}-c2`, outcome: 'error', disposition: 'denied', paymentAmount: 0, carcCodes: ['197'], rarcCodes: ['N130'], created: '2026-04-14', provenance: 'payer-adjudication' },
    }),
  ];
}

describe('claims-financial projector emits the neutral instruction set', () => {
  it('claim.submitted -> Claim + associative HAS_CLAIM off the member', () => {
    const muts = projectEvent(claimStream('M1')[0], deps);
    expect(nodes(muts).some((m) => m.kind === 'Claim')).toBe(true);
    const hasClaim = edges(muts).find((m) => m.type === 'HAS_CLAIM')!;
    expect(hasClaim.from).toEqual({ kind: 'Member', key: 'M1' });
    expect(hasClaim.to).toEqual({ kind: 'Claim', key: 'Claim/M1-c1' });
    expect(hasClaim.semantics.kind).toBe('associative');
    expect(hasClaim.validity.start).toBe('2026-03-20');
  });

  it('claim.adjudicated -> ClaimResponse + CAUSAL ADJUDICATED_BY attributed to the payer', () => {
    const muts = projectEvent(claimStream('M1')[1], deps);
    const adjudicated = edges(muts).find((m) => m.type === 'ADJUDICATED_BY')!;
    expect(adjudicated.from).toEqual({ kind: 'Claim', key: 'Claim/M1-c1' });
    expect(adjudicated.to).toEqual({ kind: 'ClaimResponse', key: 'ClaimResponse/M1-r1' });
    expect(adjudicated.semantics).toEqual({ kind: 'causal', asserter: 'payer-adjudication', basis: 'complete@Claim/M1-c1' });
  });

  it('a DENIAL ClaimResponse node carries the captured CARC + RARC codes', () => {
    const muts = projectEvent(claimStream('M1')[3], deps);
    const responseNode = nodes(muts).find((m) => m.kind === 'ClaimResponse')!;
    expect(responseNode.properties.outcome).toBe('error');
    expect(responseNode.properties.carcCodes).toEqual(['197']);
    expect(responseNode.properties.rarcCodes).toEqual(['N130']);
  });

  it('claim.explained -> EOB + associative EXPLAINED_BY off the ClaimResponse', () => {
    const muts = projectEvent(claimStream('M1')[2], deps);
    const explained = edges(muts).find((m) => m.type === 'EXPLAINED_BY')!;
    expect(explained.from).toEqual({ kind: 'ClaimResponse', key: 'ClaimResponse/M1-r1' });
    expect(explained.to).toEqual({ kind: 'ExplanationOfBenefit', key: 'ExplanationOfBenefit/M1-e1' });
    expect(explained.semantics.kind).toBe('associative');
  });
});

describe('claims-financial projection: both backends rebuild the identical chain', () => {
  async function seeded(memberId = 'M1'): Promise<{ pg: GraphStore; neo: GraphStore }> {
    const muts = project(claimStream(memberId), deps);
    const pg = await makePgGraphStore();
    const neo = makeNeo4jFakeStore();
    await pg.apply(muts);
    await neo.apply(muts);
    return { pg, neo };
  }

  it('projects the Claim -> ClaimResponse -> EOB chain edges', async () => {
    const { pg } = await seeded();
    expect(await pg.listEdges({ type: 'HAS_CLAIM' })).toHaveLength(1);
    const adj = await pg.listEdges({ type: 'ADJUDICATED_BY' });
    expect(adj).toHaveLength(2); // paid + denied
    expect(adj.every((e) => e.causal)).toBe(true);
    const explained = await pg.listEdges({ type: 'EXPLAINED_BY' });
    expect(explained).toHaveLength(1);
    expect(explained[0].from).toEqual({ kind: 'ClaimResponse', key: 'ClaimResponse/M1-r1' });
    expect(explained[0].to).toEqual({ kind: 'ExplanationOfBenefit', key: 'ExplanationOfBenefit/M1-e1' });
  });

  it('Postgres and Neo4j project byte-identical nodes and edges', async () => {
    const { pg, neo } = await seeded();
    expect(await neo.listNodes()).toEqual(await pg.listNodes());
    expect(await neo.listEdges()).toEqual(await pg.listEdges());
  });

  it('idempotent: replaying the chain twice yields the same graph', async () => {
    const { pg } = await seeded();
    const first = { nodes: await pg.listNodes(), edges: await pg.listEdges() };
    await pg.apply(project(claimStream(), deps));
    expect({ nodes: await pg.listNodes(), edges: await pg.listEdges() }).toEqual(first);
  });
});

describe('lens read now surfaces claims-financial', () => {
  it('whole-person surfaces the Claim off the member, both backends', async () => {
    const muts = project(claimStream('M1'), deps);
    for (const store of [await makePgGraphStore(), makeNeo4jFakeStore()]) {
      await store.apply(muts);
      const r = await LENSES['whole-person'](store, 'M1');
      expect(r.nodes.map((n) => `${n.kind}:${n.key}`)).toContain('Claim:Claim/M1-c1');
      expect(r.edges.map((e) => `${e.type}:${e.to.key}`)).toContain('HAS_CLAIM:Claim/M1-c1');
    }
  });
});
