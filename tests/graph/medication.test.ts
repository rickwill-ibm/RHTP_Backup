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

/** A member's medications stream: prescribe mr-1, then dispense md-1 under mr-1. */
function medStream(memberId = 'M1'): C2Event[] {
  return [
    c2({
      eventId: `${memberId}-rx`, eventType: 'medication.prescribed', memberId,
      occurredAt: '2026-05-01T00:00:00Z',
      payload: {
        medicationRef: `Medication/${memberId}-mr1`,
        rxNorm: { system: 'rxnorm', code: '310798', display: 'HCTZ 25 MG' },
        status: 'active', authoredOn: '2026-05-01',
      },
    }),
    c2({
      eventId: `${memberId}-disp`, eventType: 'medication.dispensed', memberId,
      occurredAt: '2026-05-02T00:00:00Z',
      payload: {
        dispenseRef: `MedicationDispense/${memberId}-md1`,
        prescriptionRef: `Medication/${memberId}-mr1`,
        rxNorm: { system: 'rxnorm', code: '310798', display: 'HCTZ 25 MG' },
        status: 'completed', whenHandedOver: '2026-05-02', provenance: 'pharmacy-dispense',
      },
    }),
  ];
}

describe('medication projector emits the neutral instruction set', () => {
  it('medication.prescribed -> Member + Medication + dated associative PRESCRIBED_FOR', () => {
    const muts = projectEvent(medStream('M1')[0], deps);
    expect(muts.some((m) => m.op === 'UpsertNode' && m.kind === 'Medication')).toBe(true);
    const e = edges(muts).find((m) => m.type === 'PRESCRIBED_FOR')!;
    expect(e.from).toEqual({ kind: 'Member', key: 'M1' });
    expect(e.to).toEqual({ kind: 'Medication', key: 'Medication/M1-mr1' });
    expect(e.semantics.kind).toBe('associative');
    expect(e.validity.start).toBe('2026-05-01');
  });

  it('medication.dispensed -> MedicationDispense + CAUSAL DISPENSED_UNDER with provenance', () => {
    const muts = projectEvent(medStream('M1')[1], deps);
    expect(muts.some((m) => m.op === 'UpsertNode' && m.kind === 'MedicationDispense')).toBe(true);
    const e = edges(muts).find((m) => m.type === 'DISPENSED_UNDER')!;
    // The fill is dispensed UNDER the prescription (dispense -> medication).
    expect(e.from).toEqual({ kind: 'MedicationDispense', key: 'MedicationDispense/M1-md1' });
    expect(e.to).toEqual({ kind: 'Medication', key: 'Medication/M1-mr1' });
    // Causal claims are attributable: asserter + basis, never anonymous (DP-1).
    expect(e.semantics).toEqual({
      kind: 'causal', asserter: 'pharmacy-dispense', basis: '310798@Medication/M1-mr1',
    });
  });
});

describe('medications projection: both backends rebuild the identical graph', () => {
  async function seeded(memberId = 'M1'): Promise<{ pg: GraphStore; neo: GraphStore }> {
    const muts = project(medStream(memberId), deps);
    const pg = await makePgGraphStore();
    const neo = makeNeo4jFakeStore();
    await pg.apply(muts);
    await neo.apply(muts);
    return { pg, neo };
  }

  it('projects the expected medication nodes + edges', async () => {
    const { pg } = await seeded();
    const kinds = (await pg.listNodes()).map((n) => n.kind).sort();
    expect(kinds).toEqual(['Medication', 'MedicationDispense', 'Member']);
    const edgeTypes = (await pg.listEdges()).map((e) => e.type).sort();
    expect(edgeTypes).toEqual(['DISPENSED_UNDER', 'PRESCRIBED_FOR']);
    const causalEdge = (await pg.listEdges({ type: 'DISPENSED_UNDER' }))[0];
    expect(causalEdge.causal).toBe(true);
    expect(causalEdge.asserter).toBe('pharmacy-dispense');
  });

  it('Postgres and Neo4j project byte-identical nodes and edges', async () => {
    const { pg, neo } = await seeded();
    expect(await neo.listNodes()).toEqual(await pg.listNodes());
    expect(await neo.listEdges()).toEqual(await pg.listEdges());
  });

  it('idempotent: replaying the stream twice yields the same graph', async () => {
    const { pg } = await seeded();
    const first = { nodes: await pg.listNodes(), edges: await pg.listEdges() };
    await pg.apply(project(medStream(), deps));
    expect({ nodes: await pg.listNodes(), edges: await pg.listEdges() }).toEqual(first);
  });
});

describe('lens read now surfaces medications', () => {
  it('whole-person surfaces the Medication off the member, both backends', async () => {
    const muts = project(medStream('M1'), deps);
    for (const store of [await makePgGraphStore(), makeNeo4jFakeStore()]) {
      await store.apply(muts);
      const r = await LENSES['whole-person'](store, 'M1');
      expect(r.nodes.map((n) => `${n.kind}:${n.key}`)).toContain('Medication:Medication/M1-mr1');
      expect(r.edges.map((e) => `${e.type}:${e.to.key}`)).toContain('PRESCRIBED_FOR:Medication/M1-mr1');
    }
  });
});
