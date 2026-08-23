import { describe, it, expect } from 'vitest';
import {
  batchStep,
  caregiverAdapter,
  defaultPipelineDeps,
  landStage,
  runPipeline,
  type LandInput,
  type PipelineDeps,
} from '@/lib/pipeline';
import { OutboxWriter } from '@/lib/outbox';
import { makeDeps } from '../outbox/fakes';
import { makePgMemStore } from '../outbox/pgMem';
import caregiver from './fixtures/caregiver.json';

const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

function land(input: Omit<LandInput, 'payload'> & { payload: string }) {
  return landStage.run(input, deps);
}

/** No PHI-marked token may appear in a quarantine record. */
function assertQuarantinePhiSafe(q: unknown): void {
  const s = JSON.stringify(q);
  for (const bad of ['CG-MEM', 'patient', 'reference', 'Patient']) {
    expect(s).not.toContain(bad);
  }
}

describe('caregiver-household FHIR-JSON BATCH adapter (RelatedPerson)', () => {
  it('normalizes caregiver records at T1 with the coded relationship role and quarantines the relationship-less one', () => {
    const landed = land({ source: caregiverAdapter.source, format: 'fhir-json', payload: caregiver.payload });
    const out = batchStep(caregiverAdapter)(landed, deps);

    // 3 in (2 coded + 1 malformed) -> 2 loaded, 1 rejected.
    expect(out.reconciliation).toMatchObject({ countIn: 3, loaded: 2, rejected: 1, balanced: true });
    expect(out.quarantined[0].reasonCodes).toContain('missing-relationship');
    assertQuarantinePhiSafe(out.quarantined[0]);

    // rp-1: spouse / primary caregiver, dated from the period start.
    const spouse = out.normalized.find((r) => r.fhirResourceId === 'RelatedPerson/rp-1')!;
    expect(spouse).toMatchObject({
      domain: 'caregiver-household',
      resourceType: 'RelatedPerson',
      eventType: 'caregiver.related',
      tier: 'T1', // C9 tier assertion
      provenance: 'household-registry',
    });
    expect(spouse.memberId).toMatch(/^mem-/); // anchored, never the raw CG-MEM-01
    expect(spouse.idempotencyKey).toBe('caregiver:rp-1');
    expect(spouse.payload).toMatchObject({
      relatedPersonRef: 'RelatedPerson/rp-1',
      relationship: { code: 'SPS' },
      active: true,
      periodStart: '2025-11-01',
    });
    expect(spouse.occurredAt).toBe('2025-11-01T00:00:00Z');
    expect(JSON.stringify(spouse.payload)).not.toContain('CG-MEM'); // no PHI in payload

    // rp-2: legal guardian.
    const guardian = out.normalized.find((r) => r.fhirResourceId === 'RelatedPerson/rp-2')!;
    expect(guardian.payload).toMatchObject({ relationship: { code: 'GUARD' } });
  });

  it('every normalized caregiver-household record is tier T1 (C9 tier grammar)', () => {
    const landed = land({ source: caregiverAdapter.source, format: 'fhir-json', payload: caregiver.payload });
    const out = batchStep(caregiverAdapter)(landed, deps);
    expect(out.normalized).toHaveLength(2);
    for (const r of out.normalized) expect(r.tier).toBe('T1');
  });
});

describe('end-to-end caregiver-household pipeline: land -> ... -> project+propagate (outbox)', () => {
  it('runs all five stages and propagates a caregiver event per record (pg-mem)', async () => {
    const { store } = await makePgMemStore();
    const odeps = makeDeps(store);
    const writer = new OutboxWriter(odeps);

    const result = await runPipeline(
      caregiverAdapter,
      { source: caregiverAdapter.source, format: 'fhir-json', payload: caregiver.payload },
      deps,
      { writer },
    );

    expect(result.loadReconciliation).toMatchObject({ countIn: 2, loaded: 2, balanced: true });
    expect(result.quarantined).toHaveLength(1); // the relationship-less record
    expect(result.affectedMembers).toHaveLength(2);
    expect(odeps.publisher.events).toHaveLength(2);
    for (const e of odeps.publisher.events) {
      expect(e.eventType).toBe('caregiver.related');
      expect(e.class).toBe('batch');
      expect(e.source.tier).toBe('T1');
      expect(e.partitionKey).toBe(e.memberId);
    }
  });
});
