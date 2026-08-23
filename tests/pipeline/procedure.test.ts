import { describe, it, expect } from 'vitest';
import {
  batchStep,
  defaultPipelineDeps,
  landStage,
  procedureAdapter,
  runPipeline,
  type LandInput,
  type PipelineDeps,
} from '@/lib/pipeline';
import { OutboxWriter } from '@/lib/outbox';
import { makeDeps } from '../outbox/fakes';
import { makePgMemStore } from '../outbox/pgMem';
import procedure from './fixtures/procedure.json';

const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

function land(input: Omit<LandInput, 'payload'> & { payload: string }) {
  return landStage.run(input, deps);
}

/** No PHI-marked token may appear in a quarantine record. */
function assertQuarantinePhiSafe(q: unknown): void {
  const s = JSON.stringify(q);
  for (const bad of ['PROC-MEM', 'subject', 'reference', 'Patient']) {
    expect(s).not.toContain(bad);
  }
}

describe('procedures FHIR-JSON BATCH adapter (CPT/SNOMED-coded Procedure)', () => {
  it('normalizes procedure records at T1 with performer provenance and quarantines the coding-less one', () => {
    const landed = land({ source: procedureAdapter.source, format: 'fhir-json', payload: procedure.payload });
    const out = batchStep(procedureAdapter)(landed, deps);

    // 3 in (2 coded + 1 malformed) -> 2 loaded, 1 rejected.
    expect(out.reconciliation).toMatchObject({ countIn: 3, loaded: 2, rejected: 1, balanced: true });
    expect(out.quarantined[0].reasonCodes).toContain('missing-procedure-code');
    assertQuarantinePhiSafe(out.quarantined[0]);

    // proc-1: CPT-coded, references an encounter, dated from performedDateTime.
    const rec = out.normalized.find((r) => r.fhirResourceId === 'Procedure/proc-1')!;
    expect(rec).toMatchObject({
      domain: 'procedures',
      resourceType: 'Procedure',
      eventType: 'procedure.performed',
      tier: 'T1', // C9 tier assertion
      provenance: 'provider-performed', // asserter provenance for the causal edge
    });
    expect(rec.memberId).toMatch(/^mem-/); // anchored, never the raw PROC-MEM-01
    expect(rec.idempotencyKey).toBe('procedure:proc-1');
    expect(rec.payload).toMatchObject({
      procedureRef: 'Procedure/proc-1',
      code: { code: '45378' },
      encounterRef: 'Encounter/enc-1',
      provenance: 'provider-performed',
    });
    expect(rec.occurredAt).toBe('2026-07-01T00:00:00Z');
    expect(JSON.stringify(rec.payload)).not.toContain('PROC-MEM'); // no PHI in payload

    // proc-2: SNOMED-coded, no encounter, dated from performedPeriod.start.
    const standalone = out.normalized.find((r) => r.fhirResourceId === 'Procedure/proc-2')!;
    expect(standalone.payload).toMatchObject({ code: { code: '80146002' }, encounterRef: '' });
    expect(standalone.occurredAt).toBe('2026-07-05T00:00:00Z');
  });

  it('every normalized procedures record is tier T1 (C9 tier grammar)', () => {
    const landed = land({ source: procedureAdapter.source, format: 'fhir-json', payload: procedure.payload });
    const out = batchStep(procedureAdapter)(landed, deps);
    expect(out.normalized).toHaveLength(2);
    for (const r of out.normalized) {
      expect(r.tier).toBe('T1');
      expect(r.provenance).toBe('provider-performed');
    }
  });
});

describe('end-to-end procedures pipeline: land -> ... -> project+propagate (outbox)', () => {
  it('runs all five stages and propagates a procedure event per record (pg-mem)', async () => {
    const { store } = await makePgMemStore();
    const odeps = makeDeps(store);
    const writer = new OutboxWriter(odeps);

    const result = await runPipeline(
      procedureAdapter,
      { source: procedureAdapter.source, format: 'fhir-json', payload: procedure.payload },
      deps,
      { writer },
    );

    expect(result.loadReconciliation).toMatchObject({ countIn: 2, loaded: 2, balanced: true });
    expect(result.quarantined).toHaveLength(1); // the coding-less procedure
    expect(result.affectedMembers).toHaveLength(2);
    expect(odeps.publisher.events).toHaveLength(2);
    for (const e of odeps.publisher.events) {
      expect(e.eventType).toBe('procedure.performed');
      expect(e.class).toBe('batch');
      expect(e.source.tier).toBe('T1');
      expect(e.partitionKey).toBe(e.memberId);
    }
  });
});
