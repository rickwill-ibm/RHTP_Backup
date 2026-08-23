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

/** A member's household stream: a spouse caregiver and a legal guardian. */
function caregiverStream(memberId = 'M1'): C2Event[] {
  return [
    c2({
      eventId: `${memberId}-cg1`, eventType: 'caregiver.related', memberId,
      occurredAt: '2025-11-01T00:00:00Z',
      payload: {
        relatedPersonRef: `RelatedPerson/${memberId}-rp1`,
        relationship: { system: 'v3-RoleCode', code: 'SPS', display: 'spouse' },
        active: true, periodStart: '2025-11-01', provenance: 'household-registry',
      },
    }),
    c2({
      eventId: `${memberId}-cg2`, eventType: 'caregiver.related', memberId,
      occurredAt: '2026-01-15T00:00:00Z',
      payload: {
        relatedPersonRef: `RelatedPerson/${memberId}-rp2`,
        relationship: { system: 'v3-RoleCode', code: 'GUARD', display: 'guardian' },
        active: true, periodStart: '2026-01-15', provenance: 'household-registry',
      },
    }),
  ];
}

describe('caregiver-household projector emits the neutral instruction set', () => {
  it('caregiver.related -> RelatedPerson + associative RELATED_TO carrying the relationship role', () => {
    const muts = projectEvent(caregiverStream('M1')[0], deps);
    expect(muts.some((m) => m.op === 'UpsertNode' && m.kind === 'RelatedPerson')).toBe(true);

    const relatedTo = edges(muts).find((m) => m.type === 'RELATED_TO')!;
    expect(relatedTo.from).toEqual({ kind: 'Member', key: 'M1' });
    expect(relatedTo.to).toEqual({ kind: 'RelatedPerson', key: 'RelatedPerson/M1-rp1' });
    // A recorded relationship is a factual link, not an asserted causal claim.
    expect(relatedTo.semantics.kind).toBe('associative');
    expect(relatedTo.validity.start).toBe('2025-11-01');
    // The relationship ROLE rides the edge as a PHI-safe coded property.
    expect(relatedTo.properties).toMatchObject({ role: 'SPS', provenance: 'household-registry' });
  });
});

describe('caregiver-household projection: both backends rebuild the identical graph', () => {
  async function seeded(memberId = 'M1'): Promise<{ pg: GraphStore; neo: GraphStore }> {
    const muts = project(caregiverStream(memberId), deps);
    const pg = await makePgGraphStore();
    const neo = makeNeo4jFakeStore();
    await pg.apply(muts);
    await neo.apply(muts);
    return { pg, neo };
  }

  it('projects the expected RelatedPerson nodes + two RELATED_TO edges with roles', async () => {
    const { pg } = await seeded();
    const kinds = (await pg.listNodes()).map((n) => n.kind).sort();
    expect(kinds).toEqual(['Member', 'RelatedPerson', 'RelatedPerson']);
    const relatedEdges = await pg.listEdges({ type: 'RELATED_TO' });
    expect(relatedEdges).toHaveLength(2);
    expect(relatedEdges.map((e) => e.properties?.role).sort()).toEqual(['GUARD', 'SPS']);
    expect(relatedEdges[0].causal).toBe(false);
  });

  it('Postgres and Neo4j project byte-identical nodes and edges', async () => {
    const { pg, neo } = await seeded();
    expect(await neo.listNodes()).toEqual(await pg.listNodes());
    expect(await neo.listEdges()).toEqual(await pg.listEdges());
  });

  it('idempotent: replaying the stream twice yields the same graph', async () => {
    const { pg } = await seeded();
    const first = { nodes: await pg.listNodes(), edges: await pg.listEdges() };
    await pg.apply(project(caregiverStream(), deps));
    expect({ nodes: await pg.listNodes(), edges: await pg.listEdges() }).toEqual(first);
  });
});

describe('lens read now surfaces caregiver-household', () => {
  it('whole-person surfaces the RelatedPerson off the member, both backends', async () => {
    const muts = project(caregiverStream('M1'), deps);
    for (const store of [await makePgGraphStore(), makeNeo4jFakeStore()]) {
      await store.apply(muts);
      const r = await LENSES['whole-person'](store, 'M1');
      expect(r.nodes.map((n) => `${n.kind}:${n.key}`)).toContain('RelatedPerson:RelatedPerson/M1-rp1');
      expect(r.edges.map((e) => `${e.type}:${e.to.key}`)).toContain('RELATED_TO:RelatedPerson/M1-rp1');
    }
  });
});
