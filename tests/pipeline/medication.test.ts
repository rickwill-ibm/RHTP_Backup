import { describe, it, expect } from 'vitest';
import {
  batchStep,
  defaultPipelineDeps,
  landStage,
  medicationAdapter,
  runPipeline,
  type LandInput,
  type PipelineDeps,
} from '@/lib/pipeline';
import { OutboxWriter } from '@/lib/outbox';
import { makeDeps } from '../outbox/fakes';
import { makePgMemStore } from '../outbox/pgMem';
import med from './fixtures/medication.json';

const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

function land(input: Omit<LandInput, 'payload'> & { payload: string }) {
  return landStage.run(input, deps);
}

/** No PHI-marked token may appear in a quarantine record. */
function assertQuarantinePhiSafe(q: unknown): void {
  const s = JSON.stringify(q);
  for (const bad of ['RX-MEM', 'subject', 'reference', 'Patient']) {
    expect(s).not.toContain(bad);
  }
}

describe('medications FHIR-JSON BATCH adapter (prescribed + dispensed)', () => {
  it('normalizes prescribed + dispensed records at T1 and quarantines the coding-less request', () => {
    const landed = land({ source: medicationAdapter.source, format: 'fhir-json', payload: med.payload });
    const out = batchStep(medicationAdapter)(landed, deps);

    // 5 in (2 requests + 2 dispenses + 1 malformed request) -> 4 loaded, 1 rejected.
    expect(out.reconciliation).toMatchObject({ countIn: 5, loaded: 4, rejected: 1, balanced: true });
    expect(out.quarantined[0].reasonCodes).toContain('missing-medication-code');
    assertQuarantinePhiSafe(out.quarantined[0]);

    const prescribed = out.normalized.find((r) => r.eventType === 'medication.prescribed')!;
    expect(prescribed).toMatchObject({
      domain: 'medications',
      resourceType: 'Medication',
      eventType: 'medication.prescribed',
      tier: 'T1', // C9 tier assertion
      provenance: 'prescriber-authoritative',
    });
    expect(prescribed.memberId).toMatch(/^mem-/); // anchored, never the raw RX-MEM-01
    expect(prescribed.fhirResourceId).toBe('Medication/mr-1');
    expect(prescribed.idempotencyKey).toBe('rx:med:mr-1');
    expect(prescribed.payload).toMatchObject({
      medicationRef: 'Medication/mr-1',
      rxNorm: { code: '310798' },
      authoredOn: '2026-05-01',
    });
    expect(prescribed.occurredAt).toBe('2026-05-01T00:00:00Z');
    expect(JSON.stringify(prescribed.payload)).not.toContain('RX-MEM'); // no PHI in payload

    const dispensed = out.normalized.find((r) => r.eventType === 'medication.dispensed')!;
    expect(dispensed).toMatchObject({
      domain: 'medications',
      resourceType: 'MedicationDispense',
      eventType: 'medication.dispensed',
      tier: 'T1',
      provenance: 'pharmacy-dispense',
    });
    expect(dispensed.fhirResourceId).toBe('MedicationDispense/md-1');
    // The fill points back at the prescription it was dispensed under.
    expect(dispensed.payload).toMatchObject({
      dispenseRef: 'MedicationDispense/md-1',
      prescriptionRef: 'Medication/mr-1',
      rxNorm: { code: '310798' },
      provenance: 'pharmacy-dispense',
    });
  });

  it('every normalized medications record is tier T1 (C9 tier grammar)', () => {
    const landed = land({ source: medicationAdapter.source, format: 'fhir-json', payload: med.payload });
    const out = batchStep(medicationAdapter)(landed, deps);
    expect(out.normalized).toHaveLength(4);
    for (const r of out.normalized) {
      expect(r.tier).toBe('T1');
      expect(r.provenance).toBeTruthy();
    }
  });
});

describe('end-to-end medications pipeline: land -> ... -> project+propagate (outbox)', () => {
  it('runs all five stages and propagates a medications event per record (pg-mem)', async () => {
    const { store } = await makePgMemStore();
    const odeps = makeDeps(store);
    const writer = new OutboxWriter(odeps);

    const result = await runPipeline(
      medicationAdapter,
      { source: medicationAdapter.source, format: 'fhir-json', payload: med.payload },
      deps,
      { writer },
    );

    expect(result.loadReconciliation).toMatchObject({ countIn: 4, loaded: 4, balanced: true });
    expect(result.quarantined).toHaveLength(1); // the coding-less request
    // Two members (RX-MEM-01, RX-MEM-02), each with a prescribe + a dispense.
    expect(result.affectedMembers).toHaveLength(2);
    expect(odeps.publisher.events).toHaveLength(4);
    for (const e of odeps.publisher.events) {
      expect(e.eventType).toMatch(/^medication\.(prescribed|dispensed)$/);
      expect(e.class).toBe('batch');
      expect(e.source.tier).toBe('T1');
      expect(e.partitionKey).toBe(e.memberId);
    }
  });
});
