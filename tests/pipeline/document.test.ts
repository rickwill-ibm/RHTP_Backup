import { describe, it, expect } from 'vitest';
import {
  batchStep,
  defaultPipelineDeps,
  documentAdapter,
  landStage,
  runPipeline,
  type LandInput,
  type PipelineDeps,
} from '@/lib/pipeline';
import { OutboxWriter } from '@/lib/outbox';
import { makeDeps } from '../outbox/fakes';
import { makePgMemStore } from '../outbox/pgMem';
import document from './fixtures/document.json';

const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

function land(input: Omit<LandInput, 'payload'> & { payload: string }) {
  return landStage.run(input, deps);
}

/** No PHI-marked token may appear in a quarantine record. */
function assertQuarantinePhiSafe(q: unknown): void {
  const s = JSON.stringify(q);
  for (const bad of ['DOC-MEM', 'subject', 'reference', 'Patient']) {
    expect(s).not.toContain(bad);
  }
}

describe('documents FHIR-JSON BATCH adapter (DocumentReference, TIER T2)', () => {
  it('normalizes document records at T2 as a type + content POINTER, honestly claiming NO computable clinical data, quarantining the pointer-less one', () => {
    const landed = land({ source: documentAdapter.source, format: 'fhir-json', payload: document.payload });
    const out = batchStep(documentAdapter)(landed, deps);

    // 3 in (2 valid + 1 malformed) -> 2 loaded, 1 rejected.
    expect(out.reconciliation).toMatchObject({ countIn: 3, loaded: 2, rejected: 1, balanced: true });
    expect(out.quarantined[0].reasonCodes).toContain('missing-content-pointer');
    assertQuarantinePhiSafe(out.quarantined[0]);

    // doc-1: a CCD summary. Carries the LOINC doc type + a content pointer only.
    const ccd = out.normalized.find((r) => r.fhirResourceId === 'DocumentReference/doc-1')!;
    expect(ccd).toMatchObject({
      domain: 'documents',
      resourceType: 'DocumentReference',
      eventType: 'document.referenced',
      tier: 'T2', // C9 tier assertion: DOCUMENT-LEVEL, honestly NOT T1
      provenance: 'document-repository',
    });
    expect(ccd.memberId).toMatch(/^mem-/); // anchored, never the raw DOC-MEM-01
    expect(ccd.idempotencyKey).toBe('document:doc-1');
    expect(ccd.payload).toMatchObject({
      documentReferenceRef: 'DocumentReference/doc-1',
      docType: { code: '34133-9' },
      computable: false, // the honesty marker: no parsed clinical data
      content: { url: 'https://docs.example/ccd/doc-1.xml', contentType: 'application/xml' },
    });
    expect(JSON.stringify(ccd.payload)).not.toContain('DOC-MEM'); // no PHI in payload
  });

  it('documents is tier T2 and every record honestly declares computable:false (no T1 pretense)', () => {
    const landed = land({ source: documentAdapter.source, format: 'fhir-json', payload: document.payload });
    const out = batchStep(documentAdapter)(landed, deps);
    expect(out.normalized).toHaveLength(2);
    for (const r of out.normalized) {
      // The tier is T2, NOT T1: a CCD/PDF is attached + human-readable, not computable.
      expect(r.tier).toBe('T2');
      expect(r.payload.computable).toBe(false);
      // And the payload is a POINTER, never parsed clinical data: no coded problems,
      // meds, results, or observation values are fabricated from the attachment.
      const keys = Object.keys(r.payload).sort();
      expect(keys).toEqual(['computable', 'content', 'date', 'docType', 'documentReferenceRef', 'provenance', 'status']);
      expect(r.payload).not.toHaveProperty('observations');
      expect(r.payload).not.toHaveProperty('conditions');
    }
  });
});

describe('end-to-end documents pipeline: land -> ... -> project+propagate (outbox)', () => {
  it('runs all five stages and propagates a T2 document event per record (pg-mem)', async () => {
    const { store } = await makePgMemStore();
    const odeps = makeDeps(store);
    const writer = new OutboxWriter(odeps);

    const result = await runPipeline(
      documentAdapter,
      { source: documentAdapter.source, format: 'fhir-json', payload: document.payload },
      deps,
      { writer },
    );

    expect(result.loadReconciliation).toMatchObject({ countIn: 2, loaded: 2, balanced: true });
    expect(result.quarantined).toHaveLength(1); // the pointer-less document
    expect(result.affectedMembers).toHaveLength(2);
    expect(odeps.publisher.events).toHaveLength(2);
    for (const e of odeps.publisher.events) {
      expect(e.eventType).toBe('document.referenced');
      expect(e.class).toBe('batch');
      expect(e.source.tier).toBe('T2'); // documents ride at T2 end to end
      expect(e.partitionKey).toBe(e.memberId);
    }
  });
});
