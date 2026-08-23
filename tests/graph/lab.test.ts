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

/** A member's observation stream: a lab result and a vital sign. */
function labStream(memberId = 'M1'): C2Event[] {
  return [
    c2({
      eventId: `${memberId}-obs1`, eventType: 'observation.recorded', memberId,
      occurredAt: '2026-06-01T00:00:00Z',
      payload: {
        observationRef: `Observation/${memberId}-o1`,
        loinc: { system: 'loinc', code: '4548-4', display: 'Hemoglobin A1c' },
        category: 'laboratory', status: 'final', effectiveDateTime: '2026-06-01',
        value: { value: 6.7, unit: '%' }, provenance: 'lab-result-authoritative',
      },
    }),
    c2({
      eventId: `${memberId}-obs2`, eventType: 'observation.recorded', memberId,
      occurredAt: '2026-06-02T00:00:00Z',
      payload: {
        observationRef: `Observation/${memberId}-o2`,
        loinc: { system: 'loinc', code: '8480-6', display: 'Systolic blood pressure' },
        category: 'vital-signs', status: 'final', effectiveDateTime: '2026-06-02',
        value: { value: 128, unit: 'mm[Hg]' }, provenance: 'clinician-measured',
      },
    }),
  ];
}

describe('labs/vitals projector emits the neutral instruction set', () => {
  it('observation.recorded -> Member + Observation + dated associative OBSERVED_FOR', () => {
    const muts = projectEvent(labStream('M1')[0], deps);
    expect(muts.some((m) => m.op === 'UpsertNode' && m.kind === 'Observation')).toBe(true);
    const e = edges(muts).find((m) => m.type === 'OBSERVED_FOR')!;
    expect(e.from).toEqual({ kind: 'Member', key: 'M1' });
    expect(e.to).toEqual({ kind: 'Observation', key: 'Observation/M1-o1' });
    expect(e.semantics.kind).toBe('associative');
    expect(e.validity.start).toBe('2026-06-01');
  });
});

describe('labs/vitals projection: both backends rebuild the identical graph', () => {
  async function seeded(memberId = 'M1'): Promise<{ pg: GraphStore; neo: GraphStore }> {
    const muts = project(labStream(memberId), deps);
    const pg = await makePgGraphStore();
    const neo = makeNeo4jFakeStore();
    await pg.apply(muts);
    await neo.apply(muts);
    return { pg, neo };
  }

  it('projects the expected observation nodes + edges', async () => {
    const { pg } = await seeded();
    const kinds = (await pg.listNodes()).map((n) => n.kind).sort();
    expect(kinds).toEqual(['Member', 'Observation', 'Observation']);
    const edgeTypes = (await pg.listEdges()).map((e) => e.type).sort();
    expect(edgeTypes).toEqual(['OBSERVED_FOR', 'OBSERVED_FOR']);
    // Provenance is carried onto the Observation node (source of record).
    const obs = (await pg.listNodes({ kind: 'Observation' }));
    expect(obs.map((n) => n.properties.provenance).sort()).toEqual(['clinician-measured', 'lab-result-authoritative']);
  });

  it('Postgres and Neo4j project byte-identical nodes and edges', async () => {
    const { pg, neo } = await seeded();
    expect(await neo.listNodes()).toEqual(await pg.listNodes());
    expect(await neo.listEdges()).toEqual(await pg.listEdges());
  });

  it('idempotent: replaying the stream twice yields the same graph', async () => {
    const { pg } = await seeded();
    const first = { nodes: await pg.listNodes(), edges: await pg.listEdges() };
    await pg.apply(project(labStream(), deps));
    expect({ nodes: await pg.listNodes(), edges: await pg.listEdges() }).toEqual(first);
  });
});

describe('lens read now surfaces labs/vitals', () => {
  it('whole-person surfaces the Observation off the member, both backends', async () => {
    const muts = project(labStream('M1'), deps);
    for (const store of [await makePgGraphStore(), makeNeo4jFakeStore()]) {
      await store.apply(muts);
      const r = await LENSES['whole-person'](store, 'M1');
      expect(r.nodes.map((n) => `${n.kind}:${n.key}`)).toContain('Observation:Observation/M1-o1');
      expect(r.edges.map((e) => `${e.type}:${e.to.key}`)).toContain('OBSERVED_FOR:Observation/M1-o1');
    }
  });
});
