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

/** A member's document stream: a CCD summary and a discharge summary (tier T2). */
function documentStream(memberId = 'M1'): C2Event[] {
  return [
    c2({
      eventId: `${memberId}-doc1`, eventType: 'document.referenced', memberId,
      occurredAt: '2026-05-10T00:00:00Z',
      payload: {
        documentReferenceRef: `DocumentReference/${memberId}-d1`,
        docType: { system: 'loinc', code: '34133-9', display: 'Summary of episode note' },
        status: 'current', date: '2026-05-10',
        content: { url: 'https://docs.example/ccd/d1.xml', contentType: 'application/xml', title: 'CCD' },
        computable: false, provenance: 'document-repository',
      },
    }),
    c2({
      eventId: `${memberId}-doc2`, eventType: 'document.referenced', memberId,
      occurredAt: '2026-05-14T00:00:00Z',
      payload: {
        documentReferenceRef: `DocumentReference/${memberId}-d2`,
        docType: { system: 'loinc', code: '18842-5', display: 'Discharge summary' },
        status: 'current', date: '2026-05-14',
        content: { url: 'https://docs.example/discharge/d2.pdf', contentType: 'application/pdf', title: 'Discharge' },
        computable: false, provenance: 'document-repository',
      },
    }),
  ];
}

describe('documents projector emits the neutral instruction set (tier T2)', () => {
  it('document.referenced -> DocumentReference (pointer + computable:false) + associative DOCUMENTED_BY', () => {
    const muts = projectEvent(documentStream('M1')[0], deps);
    const node = muts.find((m): m is UpsertNode => m.op === 'UpsertNode' && m.kind === 'DocumentReference')!;
    expect(node).toBeDefined();
    // The node carries the doc TYPE + a content POINTER + the honesty marker; it
    // NEVER carries parsed clinical data (no computable T1 content off a PDF/CCD).
    expect(node.properties).toMatchObject({
      docType: '34133-9', contentUrl: 'https://docs.example/ccd/d1.xml',
      contentType: 'application/xml', computable: false,
    });
    expect(node.properties).not.toHaveProperty('observations');
    expect(node.properties).not.toHaveProperty('conditions');

    const documentedBy = edges(muts).find((m) => m.type === 'DOCUMENTED_BY')!;
    expect(documentedBy.from).toEqual({ kind: 'Member', key: 'M1' });
    expect(documentedBy.to).toEqual({ kind: 'DocumentReference', key: 'DocumentReference/M1-d1' });
    // A document attachment is a factual link, not an asserted causal claim.
    expect(documentedBy.semantics.kind).toBe('associative');
    expect(documentedBy.validity.start).toBe('2026-05-10');
    expect(documentedBy.properties).toMatchObject({ docType: '34133-9' });
  });
});

describe('documents projection: both backends rebuild the identical graph', () => {
  async function seeded(memberId = 'M1'): Promise<{ pg: GraphStore; neo: GraphStore }> {
    const muts = project(documentStream(memberId), deps);
    const pg = await makePgGraphStore();
    const neo = makeNeo4jFakeStore();
    await pg.apply(muts);
    await neo.apply(muts);
    return { pg, neo };
  }

  it('projects the expected DocumentReference nodes + two DOCUMENTED_BY edges', async () => {
    const { pg } = await seeded();
    const kinds = (await pg.listNodes()).map((n) => n.kind).sort();
    expect(kinds).toEqual(['DocumentReference', 'DocumentReference', 'Member']);
    const docEdges = await pg.listEdges({ type: 'DOCUMENTED_BY' });
    expect(docEdges).toHaveLength(2);
    expect(docEdges[0].causal).toBe(false);
  });

  it('every DocumentReference node declares computable:false (honest T2, no parsed content)', async () => {
    const { pg } = await seeded();
    const docNodes = (await pg.listNodes()).filter((n) => n.kind === 'DocumentReference');
    expect(docNodes).toHaveLength(2);
    for (const n of docNodes) expect(n.properties.computable).toBe(false);
  });

  it('Postgres and Neo4j project byte-identical nodes and edges', async () => {
    const { pg, neo } = await seeded();
    expect(await neo.listNodes()).toEqual(await pg.listNodes());
    expect(await neo.listEdges()).toEqual(await pg.listEdges());
  });
});

describe('lens read now surfaces documents', () => {
  it('whole-person surfaces the DocumentReference off the member, both backends', async () => {
    const muts = project(documentStream('M1'), deps);
    for (const store of [await makePgGraphStore(), makeNeo4jFakeStore()]) {
      await store.apply(muts);
      const r = await LENSES['whole-person'](store, 'M1');
      expect(r.nodes.map((n) => `${n.kind}:${n.key}`)).toContain('DocumentReference:DocumentReference/M1-d1');
      expect(r.edges.map((e) => `${e.type}:${e.to.key}`)).toContain('DOCUMENTED_BY:DocumentReference/M1-d1');
    }
  });
});
