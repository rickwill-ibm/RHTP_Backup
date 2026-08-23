import { describe, it, expect } from 'vitest';
import {
  batchStep,
  defaultPipelineDeps,
  labAdapter,
  landStage,
  runPipeline,
  type LandInput,
  type PipelineDeps,
} from '@/lib/pipeline';
import { OutboxWriter } from '@/lib/outbox';
import { makeDeps } from '../outbox/fakes';
import { makePgMemStore } from '../outbox/pgMem';
import lab from './fixtures/lab.json';

const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

function land(input: Omit<LandInput, 'payload'> & { payload: string }) {
  return landStage.run(input, deps);
}

/** No PHI-marked token may appear in a quarantine record. */
function assertQuarantinePhiSafe(q: unknown): void {
  const s = JSON.stringify(q);
  for (const bad of ['LAB-MEM', 'subject', 'reference', 'Patient']) {
    expect(s).not.toContain(bad);
  }
}

describe('labs/vitals FHIR-JSON BATCH adapter (LOINC-coded Observation)', () => {
  it('normalizes lab + vital records at T1 and quarantines the coding-less observation', () => {
    const landed = land({ source: labAdapter.source, format: 'fhir-json', payload: lab.payload });
    const out = batchStep(labAdapter)(landed, deps);

    // 4 in (2 lab + 1 vital + 1 malformed) -> 3 loaded, 1 rejected.
    expect(out.reconciliation).toMatchObject({ countIn: 4, loaded: 3, rejected: 1, balanced: true });
    expect(out.quarantined[0].reasonCodes).toContain('missing-observation-code');
    assertQuarantinePhiSafe(out.quarantined[0]);

    const labResult = out.normalized.find((r) => r.fhirResourceId === 'Observation/obs-1')!;
    expect(labResult).toMatchObject({
      domain: 'labs-vitals',
      resourceType: 'Observation',
      eventType: 'observation.recorded',
      tier: 'T1', // C9 tier assertion
      provenance: 'lab-result-authoritative',
    });
    expect(labResult.memberId).toMatch(/^mem-/); // anchored, never the raw LAB-MEM-01
    expect(labResult.idempotencyKey).toBe('lab:obs:obs-1');
    expect(labResult.payload).toMatchObject({
      observationRef: 'Observation/obs-1',
      loinc: { code: '4548-4' },
      category: 'laboratory',
    });
    expect(labResult.occurredAt).toBe('2026-06-01T00:00:00Z');
    expect(JSON.stringify(labResult.payload)).not.toContain('LAB-MEM'); // no PHI in payload

    // The vital-sign observation carries the clinician-measured provenance.
    const vital = out.normalized.find((r) => r.fhirResourceId === 'Observation/obs-2')!;
    expect(vital).toMatchObject({
      resourceType: 'Observation',
      eventType: 'observation.recorded',
      tier: 'T1',
      provenance: 'clinician-measured',
    });
    expect(vital.payload).toMatchObject({ category: 'vital-signs', loinc: { code: '8480-6' } });
  });

  it('every normalized labs-vitals record is tier T1 (C9 tier grammar)', () => {
    const landed = land({ source: labAdapter.source, format: 'fhir-json', payload: lab.payload });
    const out = batchStep(labAdapter)(landed, deps);
    expect(out.normalized).toHaveLength(3);
    for (const r of out.normalized) {
      expect(r.tier).toBe('T1');
      expect(r.provenance).toBeTruthy();
    }
  });
});

describe('end-to-end labs/vitals pipeline: land -> ... -> project+propagate (outbox)', () => {
  it('runs all five stages and propagates an observation event per record (pg-mem)', async () => {
    const { store } = await makePgMemStore();
    const odeps = makeDeps(store);
    const writer = new OutboxWriter(odeps);

    const result = await runPipeline(
      labAdapter,
      { source: labAdapter.source, format: 'fhir-json', payload: lab.payload },
      deps,
      { writer },
    );

    expect(result.loadReconciliation).toMatchObject({ countIn: 3, loaded: 3, balanced: true });
    expect(result.quarantined).toHaveLength(1); // the coding-less observation
    // Two members (LAB-MEM-01 with 2 obs, LAB-MEM-02 with 1).
    expect(result.affectedMembers).toHaveLength(2);
    expect(odeps.publisher.events).toHaveLength(3);
    for (const e of odeps.publisher.events) {
      expect(e.eventType).toBe('observation.recorded');
      expect(e.class).toBe('batch');
      expect(e.source.tier).toBe('T1');
      expect(e.partitionKey).toBe(e.memberId);
    }
  });
});
