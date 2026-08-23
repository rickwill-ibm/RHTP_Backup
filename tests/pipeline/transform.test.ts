import { describe, it, expect } from 'vitest';
import {
  adtEncounterAdapter,
  applySegmentation,
  assertBalanced,
  cboSdohAdapter,
  defaultPipelineDeps,
  eligibility834Adapter,
  labelsFromHints,
  landStage,
  packageBothLanes,
  ReconciliationError,
  reconcile,
  streamConsumer,
  type NormalizedRecord,
  type PipelineDeps,
  type SourceFormat,
} from '@/lib/pipeline';
import adt from './fixtures/adtEncounter.json';

const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

// One 834 INS loop (a single record) so batch and stream see identical input.
const SINGLE_834 =
  'INS*Y*18*021*28*A*E**FT~REF*0F*SUB999~NM1*IL*1*SYNTH*SOLO~HD*021**HLT*PLANZ~DTP*348*D8*20260101~';

function landed(payload: string, adapter: { source: { system: string; feed: string }; format: SourceFormat }) {
  return landStage.run({ source: adapter.source, format: adapter.format, payload }, deps);
}

describe('lane-agnostic transform: the anti-divergence gate', () => {
  it('834 batch step and stream consumer produce IDENTICAL output for identical input', () => {
    const { batch, stream } = packageBothLanes(eligibility834Adapter);
    const l = landed(SINGLE_834, eligibility834Adapter);

    const batchOut = batch(l, deps);
    const streamOut = stream(l, deps);
    expect(batchOut.normalized).toHaveLength(1);
    expect(streamOut.ok).toBe(true);
    if (!streamOut.ok) return;
    // The load-bearing assertion: one transform implementation, two lanes, no drift.
    expect(batchOut.normalized[0]).toEqual(streamOut.record);
  });

  it('ADT batch step and stream consumer produce IDENTICAL output for identical input', () => {
    const { batch, stream } = packageBothLanes(adtEncounterAdapter);
    const l = landed(adt.admit, adtEncounterAdapter);
    const batchOut = batch(l, deps);
    const streamOut = stream(l, deps);
    expect(streamOut.ok).toBe(true);
    if (!streamOut.ok) return;
    expect(batchOut.normalized[0]).toEqual(streamOut.record);
  });
});

describe('segmentation-at-transform (§4A stage 3)', () => {
  it('applies a 42 CFR Part 2 label to a chemical-dependency ADT at transform time', () => {
    const l = landed(adt.sud, adtEncounterAdapter);
    const outcome = streamConsumer(adtEncounterAdapter)(l, deps);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.record.consent.part2Restricted).toBe(true);
    expect(outcome.record.consent.segmentLabels).toContain('42-CFR-Part-2');
    // The hint is consumed into the label, not left on the payload.
    expect(outcome.record.payload).not.toHaveProperty('segmentationHints');
  });

  it('labels a behavioral-health CBO program without Part 2 restriction', () => {
    const label = labelsFromHints(['behavioral-health']);
    expect(label.part2Restricted).toBe(false);
    expect(label.segmentLabels).toEqual(['behavioral-health']);
  });

  it('applySegmentation preserves labels already set and strips hints', () => {
    const base: NormalizedRecord = {
      domain: 'sdoh',
      memberId: 'mem-x',
      resourceType: 'Observation',
      fhirResourceId: 'Observation/o1',
      eventType: 'sdoh.screening.completed',
      tier: 'T1',
      idempotencyKey: 'k',
      provenance: 'community-reported',
      consent: { part2Restricted: false, segmentLabels: [] },
      source: { system: 's', feed: 'f' },
      occurredAt: '2026-01-01T00:00:00Z',
      payload: { responseRef: 'Observation/o1', segmentationHints: ['part2-sud'] },
    };
    const out = applySegmentation(base);
    expect(out.consent.part2Restricted).toBe(true);
    expect(out.payload).not.toHaveProperty('segmentationHints');
  });
});

describe('reconciliation gate', () => {
  it('passes when counts in = loaded + rejected', () => {
    expect(() => assertBalanced(reconcile('b1', 5, 4, 1))).not.toThrow();
  });
  it('throws ReconciliationError when a batch does not balance', () => {
    expect(() => assertBalanced(reconcile('b1', 5, 4, 0))).toThrow(ReconciliationError);
  });
});
