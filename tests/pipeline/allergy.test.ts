import { describe, it, expect } from 'vitest';
import {
  allergyAdapter,
  batchStep,
  defaultPipelineDeps,
  landStage,
  runPipeline,
  type LandInput,
  type PipelineDeps,
} from '@/lib/pipeline';
import { OutboxWriter } from '@/lib/outbox';
import { makeDeps } from '../outbox/fakes';
import { makePgMemStore } from '../outbox/pgMem';
import allergy from './fixtures/allergy.json';

const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

function land(input: Omit<LandInput, 'payload'> & { payload: string }) {
  return landStage.run(input, deps);
}

/** No PHI-marked token may appear in a quarantine record. */
function assertQuarantinePhiSafe(q: unknown): void {
  const s = JSON.stringify(q);
  for (const bad of ['ALG-MEM', 'patient', 'reference', 'Patient']) {
    expect(s).not.toContain(bad);
  }
}

describe('allergies FHIR-JSON BATCH adapter (AllergyIntolerance)', () => {
  it('normalizes allergy records at T1 with asserter provenance and quarantines the coding-less one', () => {
    const landed = land({ source: allergyAdapter.source, format: 'fhir-json', payload: allergy.payload });
    const out = batchStep(allergyAdapter)(landed, deps);

    // 3 in (2 coded + 1 malformed) -> 2 loaded, 1 rejected.
    expect(out.reconciliation).toMatchObject({ countIn: 3, loaded: 2, rejected: 1, balanced: true });
    expect(out.quarantined[0].reasonCodes).toContain('missing-allergen-code');
    assertQuarantinePhiSafe(out.quarantined[0]);

    const rec = out.normalized.find((r) => r.fhirResourceId === 'AllergyIntolerance/al-1')!;
    expect(rec).toMatchObject({
      domain: 'allergies',
      resourceType: 'AllergyIntolerance',
      eventType: 'allergy.recorded',
      tier: 'T1', // C9 tier assertion
      provenance: 'clinician-asserted', // asserter provenance for the causal edge
    });
    expect(rec.memberId).toMatch(/^mem-/); // anchored, never the raw ALG-MEM-01
    expect(rec.idempotencyKey).toBe('allergy:al-1');
    expect(rec.payload).toMatchObject({
      allergyRef: 'AllergyIntolerance/al-1',
      code: { code: '227493005' },
      criticality: 'high',
      provenance: 'clinician-asserted',
    });
    expect(rec.occurredAt).toBe('2026-04-10T00:00:00Z');
    expect(JSON.stringify(rec.payload)).not.toContain('ALG-MEM'); // no PHI in payload
  });

  it('every normalized allergies record is tier T1 (C9 tier grammar)', () => {
    const landed = land({ source: allergyAdapter.source, format: 'fhir-json', payload: allergy.payload });
    const out = batchStep(allergyAdapter)(landed, deps);
    expect(out.normalized).toHaveLength(2);
    for (const r of out.normalized) {
      expect(r.tier).toBe('T1');
      expect(r.provenance).toBe('clinician-asserted');
    }
  });
});

describe('end-to-end allergies pipeline: land -> ... -> project+propagate (outbox)', () => {
  it('runs all five stages and propagates an allergy event per record (pg-mem)', async () => {
    const { store } = await makePgMemStore();
    const odeps = makeDeps(store);
    const writer = new OutboxWriter(odeps);

    const result = await runPipeline(
      allergyAdapter,
      { source: allergyAdapter.source, format: 'fhir-json', payload: allergy.payload },
      deps,
      { writer },
    );

    expect(result.loadReconciliation).toMatchObject({ countIn: 2, loaded: 2, balanced: true });
    expect(result.quarantined).toHaveLength(1); // the coding-less allergy
    expect(result.affectedMembers).toHaveLength(2);
    expect(odeps.publisher.events).toHaveLength(2);
    for (const e of odeps.publisher.events) {
      expect(e.eventType).toBe('allergy.recorded');
      expect(e.class).toBe('batch');
      expect(e.source.tier).toBe('T1');
      expect(e.partitionKey).toBe(e.memberId);
    }
  });
});
