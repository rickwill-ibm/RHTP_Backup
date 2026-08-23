import { describe, it, expect } from 'vitest';
import {
  batchStep,
  defaultPipelineDeps,
  landStage,
  referralAdapter,
  runPipeline,
  type LandInput,
  type PipelineDeps,
} from '@/lib/pipeline';
import { OutboxWriter } from '@/lib/outbox';
import { makeDeps } from '../outbox/fakes';
import { makePgMemStore } from '../outbox/pgMem';
import referral from './fixtures/referral.json';

const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

function land(input: Omit<LandInput, 'payload'> & { payload: string }) {
  return landStage.run(input, deps);
}

/** No PHI-marked token may appear in a quarantine record. */
function assertQuarantinePhiSafe(q: unknown): void {
  const s = JSON.stringify(q);
  for (const bad of ['REF-MEM', 'subject', 'reference', 'Patient']) {
    expect(s).not.toContain(bad);
  }
}

describe('referrals FHIR-JSON BATCH adapter (SNOMED/CPT-coded ServiceRequest)', () => {
  it('normalizes referral records at T1 with a raw performer ref and quarantines the coding-less one', () => {
    const landed = land({ source: referralAdapter.source, format: 'fhir-json', payload: referral.payload });
    const out = batchStep(referralAdapter)(landed, deps);

    // 3 in (2 coded + 1 malformed) -> 2 loaded, 1 rejected.
    expect(out.reconciliation).toMatchObject({ countIn: 3, loaded: 2, rejected: 1, balanced: true });
    expect(out.quarantined[0].reasonCodes).toContain('missing-service-code');
    assertQuarantinePhiSafe(out.quarantined[0]);

    // sr-1: SNOMED-coded, references an Organization performer (raw ref), dated from authoredOn.
    const rec = out.normalized.find((r) => r.fhirResourceId === 'ServiceRequest/sr-1')!;
    expect(rec).toMatchObject({
      domain: 'referrals',
      resourceType: 'ServiceRequest',
      eventType: 'referral.requested',
      tier: 'T1', // C9 tier assertion
      provenance: 'referring-provider',
    });
    expect(rec.memberId).toMatch(/^mem-/); // anchored, never the raw REF-MEM-01
    expect(rec.idempotencyKey).toBe('referral:sr-1');
    expect(rec.payload).toMatchObject({
      referralRef: 'ServiceRequest/sr-1',
      serviceCode: { code: '103696004' },
      performerRef: 'Organization/org-1', // raw ref, provider identity deferred to I8A
      provenance: 'referring-provider',
    });
    expect(rec.occurredAt).toBe('2026-06-01T00:00:00Z');
    expect(JSON.stringify(rec.payload)).not.toContain('REF-MEM'); // no PHI in payload

    // sr-2: CPT-coded, no performer named -> empty raw ref.
    const noPerformer = out.normalized.find((r) => r.fhirResourceId === 'ServiceRequest/sr-2')!;
    expect(noPerformer.payload).toMatchObject({ serviceCode: { code: '99242' }, performerRef: '' });
    expect(noPerformer.occurredAt).toBe('2026-06-05T00:00:00Z');
  });

  it('every normalized referrals record is tier T1 (C9 tier grammar)', () => {
    const landed = land({ source: referralAdapter.source, format: 'fhir-json', payload: referral.payload });
    const out = batchStep(referralAdapter)(landed, deps);
    expect(out.normalized).toHaveLength(2);
    for (const r of out.normalized) {
      expect(r.tier).toBe('T1');
      expect(r.provenance).toBe('referring-provider');
    }
  });
});

describe('end-to-end referrals pipeline: land -> ... -> project+propagate (outbox)', () => {
  it('runs all five stages and propagates a referral event per record (pg-mem)', async () => {
    const { store } = await makePgMemStore();
    const odeps = makeDeps(store);
    const writer = new OutboxWriter(odeps);

    const result = await runPipeline(
      referralAdapter,
      { source: referralAdapter.source, format: 'fhir-json', payload: referral.payload },
      deps,
      { writer },
    );

    expect(result.loadReconciliation).toMatchObject({ countIn: 2, loaded: 2, balanced: true });
    expect(result.quarantined).toHaveLength(1); // the coding-less referral
    expect(result.affectedMembers).toHaveLength(2);
    expect(odeps.publisher.events).toHaveLength(2);
    for (const e of odeps.publisher.events) {
      expect(e.eventType).toBe('referral.requested');
      expect(e.class).toBe('batch');
      expect(e.source.tier).toBe('T1');
      expect(e.partitionKey).toBe(e.memberId);
    }
  });
});
