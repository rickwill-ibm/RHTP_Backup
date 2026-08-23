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

/** A member's allergy stream: one clinician-asserted allergen. */
function allergyStream(memberId = 'M1'): C2Event[] {
  return [
    c2({
      eventId: `${memberId}-al1`, eventType: 'allergy.recorded', memberId,
      occurredAt: '2026-04-10T00:00:00Z',
      payload: {
        allergyRef: `AllergyIntolerance/${memberId}-a1`,
        code: { system: 'snomed', code: '227493005', display: 'Cashew nuts' },
        clinicalStatus: 'active', verificationStatus: 'confirmed',
        criticality: 'high', category: 'food', recordedDate: '2026-04-10',
        provenance: 'clinician-asserted',
      },
    }),
  ];
}

describe('allergies projector emits the neutral instruction set', () => {
  it('allergy.recorded -> AllergyIntolerance + CAUSAL ALLERGIC_TO with provenance', () => {
    const muts = projectEvent(allergyStream('M1')[0], deps);
    expect(muts.some((m) => m.op === 'UpsertNode' && m.kind === 'AllergyIntolerance')).toBe(true);
    const e = edges(muts).find((m) => m.type === 'ALLERGIC_TO')!;
    expect(e.from).toEqual({ kind: 'Member', key: 'M1' });
    expect(e.to).toEqual({ kind: 'AllergyIntolerance', key: 'AllergyIntolerance/M1-a1' });
    // An allergy is an asserted clinical claim: attributable, never anonymous (DP-1).
    expect(e.semantics).toEqual({
      kind: 'causal', asserter: 'clinician-asserted', basis: '227493005@AllergyIntolerance/M1-a1',
    });
    expect(e.validity.start).toBe('2026-04-10');
  });
});

describe('allergies projection: both backends rebuild the identical graph', () => {
  async function seeded(memberId = 'M1'): Promise<{ pg: GraphStore; neo: GraphStore }> {
    const muts = project(allergyStream(memberId), deps);
    const pg = await makePgGraphStore();
    const neo = makeNeo4jFakeStore();
    await pg.apply(muts);
    await neo.apply(muts);
    return { pg, neo };
  }

  it('projects the expected allergy nodes + a causal edge', async () => {
    const { pg } = await seeded();
    const kinds = (await pg.listNodes()).map((n) => n.kind).sort();
    expect(kinds).toEqual(['AllergyIntolerance', 'Member']);
    const causalEdge = (await pg.listEdges({ type: 'ALLERGIC_TO' }))[0];
    expect(causalEdge.causal).toBe(true);
    expect(causalEdge.asserter).toBe('clinician-asserted');
    expect(causalEdge.basis).toBe('227493005@AllergyIntolerance/M1-a1');
  });

  it('Postgres and Neo4j project byte-identical nodes and edges', async () => {
    const { pg, neo } = await seeded();
    expect(await neo.listNodes()).toEqual(await pg.listNodes());
    expect(await neo.listEdges()).toEqual(await pg.listEdges());
  });

  it('idempotent: replaying the stream twice yields the same graph', async () => {
    const { pg } = await seeded();
    const first = { nodes: await pg.listNodes(), edges: await pg.listEdges() };
    await pg.apply(project(allergyStream(), deps));
    expect({ nodes: await pg.listNodes(), edges: await pg.listEdges() }).toEqual(first);
  });
});

describe('lens read now surfaces allergies', () => {
  it('whole-person surfaces the AllergyIntolerance off the member, both backends', async () => {
    const muts = project(allergyStream('M1'), deps);
    for (const store of [await makePgGraphStore(), makeNeo4jFakeStore()]) {
      await store.apply(muts);
      const r = await LENSES['whole-person'](store, 'M1');
      expect(r.nodes.map((n) => `${n.kind}:${n.key}`)).toContain('AllergyIntolerance:AllergyIntolerance/M1-a1');
      expect(r.edges.map((e) => `${e.type}:${e.to.key}`)).toContain('ALLERGIC_TO:AllergyIntolerance/M1-a1');
    }
  });
});
