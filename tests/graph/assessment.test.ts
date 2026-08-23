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

/** A member's assessment stream: a self-reported PHQ-9 and a clinician fall screen. */
function assessmentStream(memberId = 'M1'): C2Event[] {
  return [
    c2({
      eventId: `${memberId}-as1`, eventType: 'assessment.completed', memberId,
      occurredAt: '2026-04-02T00:00:00Z',
      payload: {
        questionnaireResponseRef: `QuestionnaireResponse/${memberId}-qr1`,
        questionnaireRef: 'Questionnaire/phq-9', status: 'completed', authored: '2026-04-02',
        items: [{ linkId: 'total', code: '55758-7', valueInteger: 12 }],
        patientReported: true, provenance: 'patient-reported',
      },
    }),
    c2({
      eventId: `${memberId}-as2`, eventType: 'assessment.completed', memberId,
      occurredAt: '2026-04-06T00:00:00Z',
      payload: {
        questionnaireResponseRef: `QuestionnaireResponse/${memberId}-qr2`,
        questionnaireRef: 'Questionnaire/morse-fall', status: 'completed', authored: '2026-04-06',
        items: [{ linkId: 'score', code: '225338004', valueInteger: 45 }],
        patientReported: false, provenance: 'clinician-recorded',
      },
    }),
  ];
}

describe('assessments projector emits the neutral instruction set', () => {
  it('assessment.completed -> QuestionnaireResponse + associative ASSESSED_BY carrying provenance', () => {
    const muts = projectEvent(assessmentStream('M1')[0], deps);
    expect(muts.some((m) => m.op === 'UpsertNode' && m.kind === 'QuestionnaireResponse')).toBe(true);

    const assessedBy = edges(muts).find((m) => m.type === 'ASSESSED_BY')!;
    expect(assessedBy.from).toEqual({ kind: 'Member', key: 'M1' });
    expect(assessedBy.to).toEqual({ kind: 'QuestionnaireResponse', key: 'QuestionnaireResponse/M1-qr1' });
    // A completed questionnaire is a factual record, not an asserted causal claim.
    expect(assessedBy.semantics.kind).toBe('associative');
    expect(assessedBy.validity.start).toBe('2026-04-02');
    // The patient-reported provenance rides the edge as a PHI-safe property.
    expect(assessedBy.properties).toMatchObject({ patientReported: true, provenance: 'patient-reported' });
  });
});

describe('assessments projection: both backends rebuild the identical graph', () => {
  async function seeded(memberId = 'M1'): Promise<{ pg: GraphStore; neo: GraphStore }> {
    const muts = project(assessmentStream(memberId), deps);
    const pg = await makePgGraphStore();
    const neo = makeNeo4jFakeStore();
    await pg.apply(muts);
    await neo.apply(muts);
    return { pg, neo };
  }

  it('projects the expected QuestionnaireResponse nodes + two ASSESSED_BY edges', async () => {
    const { pg } = await seeded();
    const kinds = (await pg.listNodes()).map((n) => n.kind).sort();
    expect(kinds).toEqual(['Member', 'QuestionnaireResponse', 'QuestionnaireResponse']);
    const assessedEdges = await pg.listEdges({ type: 'ASSESSED_BY' });
    expect(assessedEdges).toHaveLength(2);
    expect(assessedEdges[0].causal).toBe(false);
  });

  it('Postgres and Neo4j project byte-identical nodes and edges', async () => {
    const { pg, neo } = await seeded();
    expect(await neo.listNodes()).toEqual(await pg.listNodes());
    expect(await neo.listEdges()).toEqual(await pg.listEdges());
  });

  it('idempotent: replaying the stream twice yields the same graph', async () => {
    const { pg } = await seeded();
    const first = { nodes: await pg.listNodes(), edges: await pg.listEdges() };
    await pg.apply(project(assessmentStream(), deps));
    expect({ nodes: await pg.listNodes(), edges: await pg.listEdges() }).toEqual(first);
  });
});

describe('lens read now surfaces assessments', () => {
  it('whole-person surfaces the QuestionnaireResponse off the member, both backends', async () => {
    const muts = project(assessmentStream('M1'), deps);
    for (const store of [await makePgGraphStore(), makeNeo4jFakeStore()]) {
      await store.apply(muts);
      const r = await LENSES['whole-person'](store, 'M1');
      expect(r.nodes.map((n) => `${n.kind}:${n.key}`)).toContain('QuestionnaireResponse:QuestionnaireResponse/M1-qr1');
      expect(r.edges.map((e) => `${e.type}:${e.to.key}`)).toContain('ASSESSED_BY:QuestionnaireResponse/M1-qr1');
    }
  });
});
