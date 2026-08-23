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
 * A member's procedure stream: one CPT procedure performed during an encounter
 * (so a PERFORMED_DURING link is expected) and one standalone SNOMED procedure
 * (no encounter ref -> no PERFORMED_DURING edge).
 */
function procedureStream(memberId = 'M1'): C2Event[] {
  return [
    c2({
      eventId: `${memberId}-pr1`, eventType: 'procedure.performed', memberId,
      occurredAt: '2026-07-01T00:00:00Z',
      payload: {
        procedureRef: `Procedure/${memberId}-p1`,
        code: { system: 'cpt', code: '45378', display: 'Colonoscopy' },
        status: 'completed', performedDateTime: '2026-07-01',
        encounterRef: `Encounter/${memberId}-e1`, provenance: 'provider-performed',
      },
    }),
    c2({
      eventId: `${memberId}-pr2`, eventType: 'procedure.performed', memberId,
      occurredAt: '2026-07-05T00:00:00Z',
      payload: {
        procedureRef: `Procedure/${memberId}-p2`,
        code: { system: 'snomed', code: '80146002', display: 'Appendectomy' },
        status: 'completed', performedDateTime: '2026-07-05',
        encounterRef: '', provenance: 'provider-performed',
      },
    }),
  ];
}

describe('procedures projector emits the neutral instruction set', () => {
  it('procedure.performed -> Procedure + CAUSAL PERFORMED_ON with provenance + PERFORMED_DURING', () => {
    const muts = projectEvent(procedureStream('M1')[0], deps);
    expect(muts.some((m) => m.op === 'UpsertNode' && m.kind === 'Procedure')).toBe(true);

    const performedOn = edges(muts).find((m) => m.type === 'PERFORMED_ON')!;
    expect(performedOn.from).toEqual({ kind: 'Member', key: 'M1' });
    expect(performedOn.to).toEqual({ kind: 'Procedure', key: 'Procedure/M1-p1' });
    // A procedure is an asserted clinical act: attributable, never anonymous (DP-1).
    expect(performedOn.semantics).toEqual({
      kind: 'causal', asserter: 'provider-performed', basis: '45378@Procedure/M1-p1',
    });
    expect(performedOn.validity.start).toBe('2026-07-01');

    // The procedure references an encounter, so it links to the existing Encounter.
    const during = edges(muts).find((m) => m.type === 'PERFORMED_DURING')!;
    expect(during.from).toEqual({ kind: 'Procedure', key: 'Procedure/M1-p1' });
    expect(during.to).toEqual({ kind: 'Encounter', key: 'Encounter/M1-e1' });
    expect(during.semantics.kind).toBe('associative');
    expect(during.validity.start).toBe('2026-07-01');
  });

  it('a standalone procedure (no encounter ref) emits no PERFORMED_DURING edge', () => {
    const muts = projectEvent(procedureStream('M1')[1], deps);
    expect(edges(muts).some((m) => m.type === 'PERFORMED_ON')).toBe(true);
    expect(edges(muts).some((m) => m.type === 'PERFORMED_DURING')).toBe(false);
  });
});

describe('procedures projection: both backends rebuild the identical graph', () => {
  async function seeded(memberId = 'M1'): Promise<{ pg: GraphStore; neo: GraphStore }> {
    const muts = project(procedureStream(memberId), deps);
    const pg = await makePgGraphStore();
    const neo = makeNeo4jFakeStore();
    await pg.apply(muts);
    await neo.apply(muts);
    return { pg, neo };
  }

  it('projects the expected procedure nodes + a causal PERFORMED_ON and a PERFORMED_DURING edge', async () => {
    const { pg } = await seeded();
    const kinds = (await pg.listNodes()).map((n) => n.kind).sort();
    // The PERFORMED_DURING edge references the existing Encounter node (proc-1),
    // so its endpoint stub is present alongside the two Procedure nodes.
    expect(kinds).toEqual(['Encounter', 'Member', 'Procedure', 'Procedure']);
    const causalEdge = (await pg.listEdges({ type: 'PERFORMED_ON' }))[0];
    expect(causalEdge.causal).toBe(true);
    expect(causalEdge.asserter).toBe('provider-performed');
    expect(causalEdge.basis).toBe('45378@Procedure/M1-p1');
    // Exactly one procedure referenced an encounter.
    const during = await pg.listEdges({ type: 'PERFORMED_DURING' });
    expect(during).toHaveLength(1);
    expect(during[0].to).toEqual({ kind: 'Encounter', key: 'Encounter/M1-e1' });
  });

  it('Postgres and Neo4j project byte-identical nodes and edges', async () => {
    const { pg, neo } = await seeded();
    expect(await neo.listNodes()).toEqual(await pg.listNodes());
    expect(await neo.listEdges()).toEqual(await pg.listEdges());
  });

  it('idempotent: replaying the stream twice yields the same graph', async () => {
    const { pg } = await seeded();
    const first = { nodes: await pg.listNodes(), edges: await pg.listEdges() };
    await pg.apply(project(procedureStream(), deps));
    expect({ nodes: await pg.listNodes(), edges: await pg.listEdges() }).toEqual(first);
  });
});

describe('lens read now surfaces procedures', () => {
  it('whole-person surfaces the Procedure off the member, both backends', async () => {
    const muts = project(procedureStream('M1'), deps);
    for (const store of [await makePgGraphStore(), makeNeo4jFakeStore()]) {
      await store.apply(muts);
      const r = await LENSES['whole-person'](store, 'M1');
      expect(r.nodes.map((n) => `${n.kind}:${n.key}`)).toContain('Procedure:Procedure/M1-p1');
      expect(r.edges.map((e) => `${e.type}:${e.to.key}`)).toContain('PERFORMED_ON:Procedure/M1-p1');
    }
  });
});
