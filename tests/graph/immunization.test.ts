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

/** A member's immunization stream: a COVID-19 and an influenza administration. */
function immunizationStream(memberId = 'M1'): C2Event[] {
  return [
    c2({
      eventId: `${memberId}-im1`, eventType: 'immunization.administered', memberId,
      occurredAt: '2026-03-01T00:00:00Z',
      payload: {
        immunizationRef: `Immunization/${memberId}-v1`,
        cvx: { system: 'cvx', code: '208', display: 'COVID-19, mRNA' },
        status: 'completed', occurrenceDateTime: '2026-03-01',
        lotNumber: 'LOT-AA1', provenance: 'immunization-registry',
      },
    }),
    c2({
      eventId: `${memberId}-im2`, eventType: 'immunization.administered', memberId,
      occurredAt: '2026-03-05T00:00:00Z',
      payload: {
        immunizationRef: `Immunization/${memberId}-v2`,
        cvx: { system: 'cvx', code: '141', display: 'Influenza, seasonal' },
        status: 'completed', occurrenceDateTime: '2026-03-05',
        lotNumber: 'LOT-BB2', provenance: 'immunization-registry',
      },
    }),
  ];
}

describe('immunizations projector emits the neutral instruction set', () => {
  it('immunization.administered -> Immunization + associative IMMUNIZED_WITH', () => {
    const muts = projectEvent(immunizationStream('M1')[0], deps);
    expect(muts.some((m) => m.op === 'UpsertNode' && m.kind === 'Immunization')).toBe(true);

    const immunizedWith = edges(muts).find((m) => m.type === 'IMMUNIZED_WITH')!;
    expect(immunizedWith.from).toEqual({ kind: 'Member', key: 'M1' });
    expect(immunizedWith.to).toEqual({ kind: 'Immunization', key: 'Immunization/M1-v1' });
    // A recorded administration event is a factual link, not an asserted causal claim.
    expect(immunizedWith.semantics.kind).toBe('associative');
    expect(immunizedWith.validity.start).toBe('2026-03-01');
    expect(immunizedWith.properties).toMatchObject({ cvx: '208', provenance: 'immunization-registry' });
  });
});

describe('immunizations projection: both backends rebuild the identical graph', () => {
  async function seeded(memberId = 'M1'): Promise<{ pg: GraphStore; neo: GraphStore }> {
    const muts = project(immunizationStream(memberId), deps);
    const pg = await makePgGraphStore();
    const neo = makeNeo4jFakeStore();
    await pg.apply(muts);
    await neo.apply(muts);
    return { pg, neo };
  }

  it('projects the expected immunization nodes + two IMMUNIZED_WITH edges', async () => {
    const { pg } = await seeded();
    const kinds = (await pg.listNodes()).map((n) => n.kind).sort();
    expect(kinds).toEqual(['Immunization', 'Immunization', 'Member']);
    const withEdges = await pg.listEdges({ type: 'IMMUNIZED_WITH' });
    expect(withEdges).toHaveLength(2);
    expect(withEdges[0].causal).toBe(false);
  });

  it('Postgres and Neo4j project byte-identical nodes and edges', async () => {
    const { pg, neo } = await seeded();
    expect(await neo.listNodes()).toEqual(await pg.listNodes());
    expect(await neo.listEdges()).toEqual(await pg.listEdges());
  });

  it('idempotent: replaying the stream twice yields the same graph', async () => {
    const { pg } = await seeded();
    const first = { nodes: await pg.listNodes(), edges: await pg.listEdges() };
    await pg.apply(project(immunizationStream(), deps));
    expect({ nodes: await pg.listNodes(), edges: await pg.listEdges() }).toEqual(first);
  });
});

describe('lens read now surfaces immunizations', () => {
  it('whole-person surfaces the Immunization off the member, both backends', async () => {
    const muts = project(immunizationStream('M1'), deps);
    for (const store of [await makePgGraphStore(), makeNeo4jFakeStore()]) {
      await store.apply(muts);
      const r = await LENSES['whole-person'](store, 'M1');
      expect(r.nodes.map((n) => `${n.kind}:${n.key}`)).toContain('Immunization:Immunization/M1-v1');
      expect(r.edges.map((e) => `${e.type}:${e.to.key}`)).toContain('IMMUNIZED_WITH:Immunization/M1-v1');
    }
  });
});
