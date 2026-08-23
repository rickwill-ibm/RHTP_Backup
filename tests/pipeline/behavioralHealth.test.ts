import { describe, it, expect } from 'vitest';
import {
  behavioralHealthAdapter,
  batchStep,
  classifyProgram,
  defaultPipelineDeps,
  evaluatePart2Basis,
  landStage,
  runPipeline,
  type LandInput,
  type NormalizedRecord,
  type PipelineDeps,
} from '@/lib/pipeline';
import { OutboxWriter } from '@/lib/outbox';
import { makeDeps } from '../outbox/fakes';
import { makePgMemStore } from '../outbox/pgMem';
import bh from './fixtures/behavioralHealth.json';

const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

function land(input: Omit<LandInput, 'payload'> & { payload: string }) {
  return landStage.run(input, deps);
}
function normalized(): NormalizedRecord[] {
  const landed = land({ source: behavioralHealthAdapter.source, format: 'fhir-json', payload: bh.payload });
  return batchStep(behavioralHealthAdapter)(landed, deps).normalized;
}
function byRef(ref: string): NormalizedRecord {
  return normalized().find((r) => r.fhirResourceId === ref)!;
}

/** No PHI-marked token may appear in a record or quarantine record. */
function assertPhiSafe(v: unknown): void {
  const s = JSON.stringify(v);
  for (const bad of ['BH-MEM', 'Patient', 'subject', 'reference']) expect(s).not.toContain(bad);
}

describe('behavioral-health FHIR-JSON BATCH adapter (Condition)', () => {
  it('normalizes BH conditions at T1 and quarantines the coding-less one', () => {
    const landed = land({ source: behavioralHealthAdapter.source, format: 'fhir-json', payload: bh.payload });
    const out = batchStep(behavioralHealthAdapter)(landed, deps);

    // 5 in (4 coded + 1 malformed) -> 4 loaded, 1 rejected.
    expect(out.reconciliation).toMatchObject({ countIn: 5, loaded: 4, rejected: 1, balanced: true });
    expect(out.quarantined[0].reasonCodes).toContain('missing-condition-code');
    assertPhiSafe(out.quarantined[0]);

    const rec = byRef('Condition/cond-depression');
    expect(rec).toMatchObject({
      domain: 'behavioral-health',
      resourceType: 'Condition',
      eventType: 'behavioral-health.condition-recorded',
      tier: 'T1',
      provenance: 'diagnosis-authoritative',
    });
    expect(rec.memberId).toMatch(/^mem-/); // anchored, never the raw BH-MEM id
    expect(rec.idempotencyKey).toBe('bh:cond:cond-depression');
    expect(rec.occurredAt).toBe('2026-04-03T00:00:00Z');
    assertPhiSafe(rec);
  });

  it('every normalized behavioral-health record is tier T1 (C9 tier grammar)', () => {
    for (const r of normalized()) expect(r.tier).toBe('T1');
  });

  it('segmentation hints are stripped from the payload after transform (PHI-minimal)', () => {
    for (const r of normalized()) expect(r.payload).not.toHaveProperty('segmentationHints');
  });
});

// ── F2: the Part 2 segmentation BASIS is the two-factor rule, not a code guess ──
describe('F2 Part 2 segmentation basis (behavioral-health SUD subset)', () => {
  it('SUD content from a federally-assisted SUD program IS labeled 42 CFR Part 2', () => {
    const rec = byRef('Condition/cond-otp-opioid');
    expect(rec.consent.part2Restricted).toBe(true);
    expect(rec.consent.segmentLabels).toContain('42-CFR-Part-2');
  });

  it('SUD content from a general hospital is NOT Part 2 (over-restriction guard)', () => {
    // Same SUD diagnosis family (F10.20) but the source is not a federally-assisted
    // SUD program: the record must NOT be over-restricted on the code alone.
    const rec = byRef('Condition/cond-hosp-alcohol');
    expect(rec.consent.part2Restricted).toBe(false);
    expect(rec.consent.segmentLabels).not.toContain('42-CFR-Part-2');
  });

  it('a NON-SUD behavioral-health record does NOT get the Part 2 label', () => {
    for (const ref of ['Condition/cond-depression', 'Condition/cond-anxiety']) {
      const rec = byRef(ref);
      expect(rec.consent.part2Restricted).toBe(false);
      expect(rec.consent.segmentLabels).not.toContain('42-CFR-Part-2');
    }
  });

  it('the basis rule requires BOTH facts (program context AND SUD content)', () => {
    // SUD content + federally-assisted SUD program -> Part 2.
    expect(evaluatePart2Basis({ facilityType: 'opioid-treatment-program', federallyAssisted: true, code: 'F11.20' }).part2).toBe(true);
    // SUD content + SUD program but NOT federally assisted -> not Part 2.
    expect(evaluatePart2Basis({ facilityType: 'opioid-treatment-program', federallyAssisted: false, code: 'F11.20' }).part2).toBe(false);
    // SUD content but a non-SUD program -> not Part 2.
    expect(evaluatePart2Basis({ facilityType: 'general-acute', federallyAssisted: true, code: 'F10.20' }).part2).toBe(false);
    // SUD program but non-SUD content -> not Part 2 (behavioral health only).
    const bhOnly = evaluatePart2Basis({ facilityType: 'opioid-treatment-program', federallyAssisted: true, code: 'F32.1' });
    expect(bhOnly.part2).toBe(false);
    expect(bhOnly.behavioralHealth).toBe(true);
  });
});

// ── E9 fail-safe: a missing / ambiguous program signal restricts, never discloses ──
describe('F2 Part 2 fail-safe on ambiguous program context (E9)', () => {
  it('SUD content with a MISSING program context fails RESTRICTED (not disclosable)', () => {
    // No facility type, no federally-assisted flag: provenance is unknown. We cannot
    // prove the source is outside Part 2, so SUD content must be protected.
    const r = evaluatePart2Basis({ facilityType: '', code: 'F11.20' });
    expect(r.part2).toBe(true);
  });

  it('SUD content from an UNRECOGNIZED facility type fails RESTRICTED', () => {
    const r = evaluatePart2Basis({ facilityType: 'mystery-clinic', federallyAssisted: true, code: 'F10.20' });
    expect(r.part2).toBe(true);
  });

  it('SUD content from a SUD program with UNKNOWN federal-assistance status fails RESTRICTED', () => {
    // A SUD program type but the federally-assisted flag was not provided (undefined):
    // ambiguous, so restrict rather than disclose on the absent signal.
    const r = evaluatePart2Basis({ facilityType: 'opioid-treatment-program', code: 'F11.20' });
    expect(r.part2).toBe(true);
  });

  it('SUD content from an AFFIRMATIVELY-recognized general-medical setting is NOT restricted', () => {
    // The over-restriction guard is preserved: a known non-Part-2 setting discloses.
    expect(evaluatePart2Basis({ facilityType: 'general-acute', federallyAssisted: true, code: 'F10.20' }).part2).toBe(false);
    expect(evaluatePart2Basis({ facilityType: 'primary-care', federallyAssisted: false, code: 'F11.20' }).part2).toBe(false);
  });

  it('classifyProgram distinguishes recognized-non-part2 from ambiguous', () => {
    expect(classifyProgram('opioid-treatment-program', true)).toBe('federally-assisted-sud-program');
    expect(classifyProgram('opioid-treatment-program', false)).toBe('recognized-non-part2');
    expect(classifyProgram('opioid-treatment-program')).toBe('ambiguous'); // FA unknown
    expect(classifyProgram('general-acute', true)).toBe('recognized-non-part2');
    expect(classifyProgram('')).toBe('ambiguous');
    expect(classifyProgram('mystery-clinic', true)).toBe('ambiguous');
  });

  it('end to end: a SUD Condition with no programContext block projects RESTRICTED', () => {
    const bundle = JSON.stringify({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'Condition',
            id: 'cond-ambiguous-sud',
            subject: { reference: 'Patient/BH-MEM-99' },
            clinicalStatus: { coding: [{ code: 'active' }] },
            code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'F11.20', display: 'Opioid dependence' }] },
            recordedDate: '2026-05-01',
            // NOTE: no programContext block at all -> provenance unknown.
          },
        },
      ],
    });
    const rec = behavioralHealthAdapter.normalize(behavioralHealthAdapter.parse(bundle)[0], deps);
    // Adapter attaches the part2-sud hint; the transform derives the durable label.
    expect((rec.payload as Record<string, unknown>).segmentationHints).toContain('part2-sud');
  });
});

describe('end-to-end behavioral-health pipeline: land -> ... -> project+propagate', () => {
  it('propagates one event per record and carries the Part 2 label on the envelope', async () => {
    const { store } = await makePgMemStore();
    const odeps = makeDeps(store);
    const writer = new OutboxWriter(odeps);

    const result = await runPipeline(
      behavioralHealthAdapter,
      { source: behavioralHealthAdapter.source, format: 'fhir-json', payload: bh.payload },
      deps,
      { writer },
    );

    expect(result.loadReconciliation).toMatchObject({ countIn: 4, loaded: 4, balanced: true });
    expect(result.quarantined).toHaveLength(1);
    expect(odeps.publisher.events).toHaveLength(4);
    for (const e of odeps.publisher.events) {
      expect(e.eventType).toBe('behavioral-health.condition-recorded');
      expect(e.class).toBe('batch');
      expect(e.source.tier).toBe('T1');
    }
    // Exactly the OTP SUD record rides as Part 2-restricted on the envelope.
    const restricted = odeps.publisher.events.filter((e) => e.consentContext.part2Restricted);
    expect(restricted).toHaveLength(1);
    expect(restricted[0].consentContext.segmentLabels).toContain('42-CFR-Part-2');
  });
});
