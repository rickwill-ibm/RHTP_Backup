import { describe, it, expect } from 'vitest';
import {
  assessmentAdapter,
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
import assessment from './fixtures/assessment.json';

const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

function land(input: Omit<LandInput, 'payload'> & { payload: string }) {
  return landStage.run(input, deps);
}

/** No PHI-marked token may appear in a quarantine record. */
function assertQuarantinePhiSafe(q: unknown): void {
  const s = JSON.stringify(q);
  for (const bad of ['AS-MEM', 'subject', 'reference', 'Patient']) {
    expect(s).not.toContain(bad);
  }
}

describe('assessments FHIR-JSON BATCH adapter (QuestionnaireResponse)', () => {
  it('normalizes assessment records at T1 with honest patient-reported vs clinician-recorded provenance, quarantining the questionnaire-less one', () => {
    const landed = land({ source: assessmentAdapter.source, format: 'fhir-json', payload: assessment.payload });
    const out = batchStep(assessmentAdapter)(landed, deps);

    // 3 in (2 valid + 1 malformed) -> 2 loaded, 1 rejected.
    expect(out.reconciliation).toMatchObject({ countIn: 3, loaded: 2, rejected: 1, balanced: true });
    expect(out.quarantined[0].reasonCodes).toContain('missing-questionnaire');
    assertQuarantinePhiSafe(out.quarantined[0]);

    // qr-1: the member answered a PHQ-9 themselves -> patient-reported provenance.
    const selfReport = out.normalized.find((r) => r.fhirResourceId === 'QuestionnaireResponse/qr-1')!;
    expect(selfReport).toMatchObject({
      domain: 'assessments',
      resourceType: 'QuestionnaireResponse',
      eventType: 'assessment.completed',
      tier: 'T1', // C9 tier assertion
      provenance: 'patient-reported',
    });
    expect(selfReport.memberId).toMatch(/^mem-/); // anchored, never the raw AS-MEM-01
    expect(selfReport.idempotencyKey).toBe('assessment:qr-1');
    expect(selfReport.payload).toMatchObject({
      questionnaireRef: 'Questionnaire/phq-9',
      patientReported: true,
      provenance: 'patient-reported',
      items: [{ linkId: 'total', code: '55758-7', valueInteger: 12 }],
    });
    expect(selfReport.occurredAt).toBe('2026-04-02');
    expect(JSON.stringify(selfReport.payload)).not.toContain('AS-MEM'); // no PHI in payload

    // qr-2: a clinician recorded a fall-risk screen -> clinician-recorded provenance.
    const clinician = out.normalized.find((r) => r.fhirResourceId === 'QuestionnaireResponse/qr-2')!;
    expect(clinician).toMatchObject({ provenance: 'clinician-recorded' });
    expect(clinician.payload).toMatchObject({ patientReported: false, provenance: 'clinician-recorded' });
  });

  it('every normalized assessments record is tier T1 (C9 tier grammar)', () => {
    const landed = land({ source: assessmentAdapter.source, format: 'fhir-json', payload: assessment.payload });
    const out = batchStep(assessmentAdapter)(landed, deps);
    expect(out.normalized).toHaveLength(2);
    for (const r of out.normalized) expect(r.tier).toBe('T1');
  });
});

describe('end-to-end assessments pipeline: land -> ... -> project+propagate (outbox)', () => {
  it('runs all five stages and propagates an assessment event per record (pg-mem)', async () => {
    const { store } = await makePgMemStore();
    const odeps = makeDeps(store);
    const writer = new OutboxWriter(odeps);

    const result = await runPipeline(
      assessmentAdapter,
      { source: assessmentAdapter.source, format: 'fhir-json', payload: assessment.payload },
      deps,
      { writer },
    );

    expect(result.loadReconciliation).toMatchObject({ countIn: 2, loaded: 2, balanced: true });
    expect(result.quarantined).toHaveLength(1); // the questionnaire-less response
    expect(result.affectedMembers).toHaveLength(2);
    expect(odeps.publisher.events).toHaveLength(2);
    for (const e of odeps.publisher.events) {
      expect(e.eventType).toBe('assessment.completed');
      expect(e.class).toBe('batch');
      expect(e.source.tier).toBe('T1');
      expect(e.partitionKey).toBe(e.memberId);
    }
  });
});
