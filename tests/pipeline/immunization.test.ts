import { describe, it, expect } from 'vitest';
import {
  batchStep,
  defaultPipelineDeps,
  immunizationAdapter,
  landStage,
  runPipeline,
  type LandInput,
  type PipelineDeps,
} from '@/lib/pipeline';
import { OutboxWriter } from '@/lib/outbox';
import { makeDeps } from '../outbox/fakes';
import { makePgMemStore } from '../outbox/pgMem';
import immunization from './fixtures/immunization.json';

const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

function land(input: Omit<LandInput, 'payload'> & { payload: string }) {
  return landStage.run(input, deps);
}

/** No PHI-marked token may appear in a quarantine record. */
function assertQuarantinePhiSafe(q: unknown): void {
  const s = JSON.stringify(q);
  for (const bad of ['IMM-MEM', 'patient', 'reference', 'Patient']) {
    expect(s).not.toContain(bad);
  }
}

describe('immunizations FHIR-JSON BATCH adapter (CVX-coded Immunization)', () => {
  it('normalizes immunization records at T1 with registry provenance and quarantines the coding-less one', () => {
    const landed = land({ source: immunizationAdapter.source, format: 'fhir-json', payload: immunization.payload });
    const out = batchStep(immunizationAdapter)(landed, deps);

    // 3 in (2 coded + 1 malformed) -> 2 loaded, 1 rejected.
    expect(out.reconciliation).toMatchObject({ countIn: 3, loaded: 2, rejected: 1, balanced: true });
    expect(out.quarantined[0].reasonCodes).toContain('missing-vaccine-code');
    assertQuarantinePhiSafe(out.quarantined[0]);

    // imm-1: CVX-coded COVID-19, dated from occurrenceDateTime.
    const rec = out.normalized.find((r) => r.fhirResourceId === 'Immunization/imm-1')!;
    expect(rec).toMatchObject({
      domain: 'immunizations',
      resourceType: 'Immunization',
      eventType: 'immunization.administered',
      tier: 'T1', // C9 tier assertion
      provenance: 'immunization-registry',
    });
    expect(rec.memberId).toMatch(/^mem-/); // anchored, never the raw IMM-MEM-01
    expect(rec.idempotencyKey).toBe('immunization:imm-1');
    expect(rec.payload).toMatchObject({
      immunizationRef: 'Immunization/imm-1',
      cvx: { code: '208' },
      lotNumber: 'LOT-AA1',
      provenance: 'immunization-registry',
    });
    expect(rec.occurredAt).toBe('2026-03-01T00:00:00Z');
    expect(JSON.stringify(rec.payload)).not.toContain('IMM-MEM'); // no PHI in payload

    // imm-2: CVX-coded influenza.
    const flu = out.normalized.find((r) => r.fhirResourceId === 'Immunization/imm-2')!;
    expect(flu.payload).toMatchObject({ cvx: { code: '141' } });
    expect(flu.occurredAt).toBe('2026-03-05T00:00:00Z');
  });

  it('every normalized immunizations record is tier T1 (C9 tier grammar)', () => {
    const landed = land({ source: immunizationAdapter.source, format: 'fhir-json', payload: immunization.payload });
    const out = batchStep(immunizationAdapter)(landed, deps);
    expect(out.normalized).toHaveLength(2);
    for (const r of out.normalized) {
      expect(r.tier).toBe('T1');
      expect(r.provenance).toBe('immunization-registry');
    }
  });
});

describe('end-to-end immunizations pipeline: land -> ... -> project+propagate (outbox)', () => {
  it('runs all five stages and propagates an immunization event per record (pg-mem)', async () => {
    const { store } = await makePgMemStore();
    const odeps = makeDeps(store);
    const writer = new OutboxWriter(odeps);

    const result = await runPipeline(
      immunizationAdapter,
      { source: immunizationAdapter.source, format: 'fhir-json', payload: immunization.payload },
      deps,
      { writer },
    );

    expect(result.loadReconciliation).toMatchObject({ countIn: 2, loaded: 2, balanced: true });
    expect(result.quarantined).toHaveLength(1); // the coding-less immunization
    expect(result.affectedMembers).toHaveLength(2);
    expect(odeps.publisher.events).toHaveLength(2);
    for (const e of odeps.publisher.events) {
      expect(e.eventType).toBe('immunization.administered');
      expect(e.class).toBe('batch');
      expect(e.source.tier).toBe('T1');
      expect(e.partitionKey).toBe(e.memberId);
    }
  });
});
