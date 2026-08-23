import { describe, it, expect } from 'vitest';
import {
  adtEncounterAdapter,
  batchStep,
  cboSdohAdapter,
  defaultPipelineDeps,
  eligibility834Adapter,
  landStage,
  streamConsumer,
  type LandInput,
  type PipelineDeps,
} from '@/lib/pipeline';
import { readFileSync } from 'fs';
import adt from './fixtures/adtEncounter.json';
import x834 from './fixtures/eligibility834.json';

const csv = readFileSync(new URL('./fixtures/cboSdoh.csv', import.meta.url), 'utf8');
const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

function land(input: Omit<LandInput, 'payload'> & { payload: string }) {
  return landStage.run(input, deps);
}

/** No PHI-marked key or synthetic name may appear in a quarantine record. */
function assertQuarantinePhiSafe(q: unknown): void {
  const s = JSON.stringify(q);
  for (const bad of ['MEMBERONE', 'MEMBERTWO', 'MEMBERTHREE', 'SYNTH', 'name', 'given', 'family']) {
    expect(s).not.toContain(bad);
  }
}

describe('834 eligibility BATCH adapter', () => {
  it('normalizes Coverage records at T1 and quarantines the incomplete loop', () => {
    const landed = land({ source: eligibility834Adapter.source, format: 'x12-834', payload: x834.payload });
    const out = batchStep(eligibility834Adapter)(landed, deps);

    expect(out.normalized).toHaveLength(2);
    expect(out.quarantined).toHaveLength(1);
    expect(out.reconciliation).toMatchObject({ countIn: 3, loaded: 2, rejected: 1, balanced: true });

    const first = out.normalized[0];
    expect(first).toMatchObject({
      domain: 'coverage',
      resourceType: 'Coverage',
      eventType: 'coverage.enrolled',
      tier: 'T1',
      provenance: 'payer-authoritative',
    });
    expect(first.memberId).toMatch(/^mem-/); // anchored, never the raw SUB001
    expect(first.idempotencyKey).toBe('834:cov:SUB001:HLT:2026-01-01');
    expect(first.payload).toMatchObject({ planCode: 'HLT', periodStart: '2026-01-01', status: 'active' });
    expect(JSON.stringify(first.payload)).not.toContain('MEMBERONE'); // no PHI in the payload

    expect(out.quarantined[0].reasonCodes).toContain('missing-coverage');
    assertQuarantinePhiSafe(out.quarantined[0]);
  });
});

describe('ADT encounter STREAM adapter', () => {
  it('normalizes an admit to encounter.admitted at T1', () => {
    const landed = land({ source: adtEncounterAdapter.source, format: 'hl7v2-adt', payload: adt.admit });
    const outcome = streamConsumer(adtEncounterAdapter)(landed, deps);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.record).toMatchObject({
      domain: 'encounter',
      eventType: 'encounter.admitted',
      tier: 'T1',
      provenance: 'qe-adt-feed',
    });
    expect(outcome.record.payload).toMatchObject({ encounterClass: 'IMP', trigger: 'A01' });
    expect(outcome.record.occurredAt).toBe('2026-04-01T22:47:00Z');
  });

  it('maps a discharge trigger to encounter.discharged', () => {
    const landed = land({ source: adtEncounterAdapter.source, format: 'hl7v2-adt', payload: adt.discharge });
    const outcome = streamConsumer(adtEncounterAdapter)(landed, deps);
    expect(outcome.ok && outcome.record.eventType).toBe('encounter.discharged');
  });

  it('quarantines a message missing the patient id', () => {
    const landed = land({ source: adtEncounterAdapter.source, format: 'hl7v2-adt', payload: adt.bad });
    const outcome = streamConsumer(adtEncounterAdapter)(landed, deps);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.quarantine.reasonCodes).toContain('missing-patient-id');
    assertQuarantinePhiSafe(outcome.quarantine);
  });
});

describe('CBO flat-file SDOH adapter', () => {
  it('normalizes SDOH Observations at T1 with community-reported provenance', () => {
    const landed = land({ source: cboSdohAdapter.source, format: 'flat-file-csv', payload: csv });
    const out = batchStep(cboSdohAdapter)(landed, deps);

    expect(out.reconciliation).toMatchObject({ countIn: 4, loaded: 3, rejected: 1, balanced: true });
    const first = out.normalized[0];
    expect(first).toMatchObject({
      domain: 'sdoh',
      resourceType: 'Observation',
      eventType: 'sdoh.screening.completed',
      tier: 'T1',
      provenance: 'community-reported',
    });
    expect(first.payload).toMatchObject({ domain: 'transportation-insecurity', provenance: 'community-reported' });
    expect(out.quarantined[0].reasonCodes).toContain('missing-zcode');
  });
});
