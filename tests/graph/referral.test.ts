import { describe, it, expect } from 'vitest';
import type { C2Event } from '@/lib/outbox';
import {
  LENSES,
  type GraphStore,
  project,
  projectEvent,
  type Mutation,
  type UpsertEdge,
} from '@/lib/graph';
import { c2, fixedNow, makeNeo4jFakeStore, makePgGraphStore } from './helpers';

const deps = { now: fixedNow };

function edges(muts: Mutation[]): UpsertEdge[] {
  return muts.filter((m): m is UpsertEdge => m.op === 'UpsertEdge');
}

/**
 * A member's referral stream: one SNOMED referral that names an Organization
 * performer (so a REFERRED_TO link to the raw performer ref is expected) and one
 * CPT referral with no performer (no REFERRED_TO edge).
 */
function referralStream(memberId = 'M1'): C2Event[] {
  return [
    c2({
      eventId: `${memberId}-rf1`, eventType: 'referral.requested', memberId,
      occurredAt: '2026-06-01T00:00:00Z',
      payload: {
        referralRef: `ServiceRequest/${memberId}-s1`,
        serviceCode: { system: 'snomed', code: '103696004', display: 'Referral to specialist' },
        status: 'active', intent: 'order', authoredOn: '2026-06-01',
        performerRef: 'Organization/org-1', provenance: 'referring-provider',
      },
    }),
    c2({
      eventId: `${memberId}-rf2`, eventType: 'referral.requested', memberId,
      occurredAt: '2026-06-05T00:00:00Z',
      payload: {
        referralRef: `ServiceRequest/${memberId}-s2`,
        serviceCode: { system: 'cpt', code: '99242', display: 'Consultation' },
        status: 'active', intent: 'order', authoredOn: '2026-06-05',
        performerRef: '', provenance: 'referring-provider',
      },
    }),
  ];
}

describe('referrals projector emits the neutral instruction set', () => {
  it('referral.requested -> ServiceRequest + associative REFERRED_VIA + REFERRED_TO raw performer', () => {
    const muts = projectEvent(referralStream('M1')[0], deps);
    expect(muts.some((m) => m.op === 'UpsertNode' && m.kind === 'ServiceRequest')).toBe(true);

    const referredVia = edges(muts).find((m) => m.type === 'REFERRED_VIA')!;
    expect(referredVia.from).toEqual({ kind: 'Member', key: 'M1' });
    expect(referredVia.to).toEqual({ kind: 'ServiceRequest', key: 'ServiceRequest/M1-s1' });
    // A referral is a factual order link, not an asserted causal claim.
    expect(referredVia.semantics.kind).toBe('associative');
    expect(referredVia.validity.start).toBe('2026-06-01');

    // The referral names an Organization performer, kept as a RAW ref (I8A deferral).
    const performerNode = muts.find((m) => m.op === 'UpsertNode' && m.kind === 'Organization');
    expect(performerNode).toMatchObject({
      kind: 'Organization', key: 'Organization/org-1',
      properties: { rawRef: 'Organization/org-1', providerResolution: 'deferred-I8A' },
    });
    const referredTo = edges(muts).find((m) => m.type === 'REFERRED_TO')!;
    expect(referredTo.from).toEqual({ kind: 'ServiceRequest', key: 'ServiceRequest/M1-s1' });
    expect(referredTo.to).toEqual({ kind: 'Organization', key: 'Organization/org-1' });
    expect(referredTo.semantics.kind).toBe('associative');
  });

  it('a referral with no performer (empty raw ref) emits no REFERRED_TO edge', () => {
    const muts = projectEvent(referralStream('M1')[1], deps);
    expect(edges(muts).some((m) => m.type === 'REFERRED_VIA')).toBe(true);
    expect(edges(muts).some((m) => m.type === 'REFERRED_TO')).toBe(false);
  });
});

describe('referrals projection: both backends rebuild the identical graph', () => {
  async function seeded(memberId = 'M1'): Promise<{ pg: GraphStore; neo: GraphStore }> {
    const muts = project(referralStream(memberId), deps);
    const pg = await makePgGraphStore();
    const neo = makeNeo4jFakeStore();
    await pg.apply(muts);
    await neo.apply(muts);
    return { pg, neo };
  }

  it('projects the expected referral nodes + a REFERRED_VIA and a REFERRED_TO edge', async () => {
    const { pg } = await seeded();
    const kinds = (await pg.listNodes()).map((n) => n.kind).sort();
    // Member + 2 ServiceRequest nodes + the Organization raw-ref performer stub.
    expect(kinds).toEqual(['Member', 'Organization', 'ServiceRequest', 'ServiceRequest']);
    const via = await pg.listEdges({ type: 'REFERRED_VIA' });
    expect(via).toHaveLength(2);
    expect(via[0].causal).toBe(false);
    // Exactly one referral named a performer.
    const to = await pg.listEdges({ type: 'REFERRED_TO' });
    expect(to).toHaveLength(1);
    expect(to[0].to).toEqual({ kind: 'Organization', key: 'Organization/org-1' });
  });

  it('Postgres and Neo4j project byte-identical nodes and edges', async () => {
    const { pg, neo } = await seeded();
    expect(await neo.listNodes()).toEqual(await pg.listNodes());
    expect(await neo.listEdges()).toEqual(await pg.listEdges());
  });

  it('idempotent: replaying the stream twice yields the same graph', async () => {
    const { pg } = await seeded();
    const first = { nodes: await pg.listNodes(), edges: await pg.listEdges() };
    await pg.apply(project(referralStream(), deps));
    expect({ nodes: await pg.listNodes(), edges: await pg.listEdges() }).toEqual(first);
  });
});

describe('lens read now surfaces referrals', () => {
  it('whole-person surfaces the ServiceRequest off the member, both backends', async () => {
    const muts = project(referralStream('M1'), deps);
    for (const store of [await makePgGraphStore(), makeNeo4jFakeStore()]) {
      await store.apply(muts);
      const r = await LENSES['whole-person'](store, 'M1');
      expect(r.nodes.map((n) => `${n.kind}:${n.key}`)).toContain('ServiceRequest:ServiceRequest/M1-s1');
      expect(r.edges.map((e) => `${e.type}:${e.to.key}`)).toContain('REFERRED_VIA:ServiceRequest/M1-s1');
    }
  });
});
