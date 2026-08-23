import { describe, it, expect } from 'vitest';
// Import from the EXACT pinned module paths (L3) — the import itself pins the paths.
// Wave C (assessments + caregiver-household + documents) namespace pins live here,
// split out of tests/pipeline/domainNamespaceIntegrity.test.ts to keep each pinning
// file under the AI-CODING-CONVENTIONS test size cap while the three waves grow it
// in parallel. Same guarantee as the parent file (F-C1 lesson): every surface —
// adapter, spec, both registries — must agree on the domain id, node kinds, and
// edge types, and every eventType the adapter emits is claimed by exactly its spec.
import { assessmentAdapter } from '@/lib/pipeline/adapters/assessment';
import {
  assessmentSpec,
  ASSESSMENT_DOMAIN,
  QUESTIONNAIRE_RESPONSE_KIND,
  ASSESSED_BY,
} from '@/lib/graph/mapping/assessment';
import { caregiverAdapter } from '@/lib/pipeline/adapters/caregiver';
import {
  caregiverSpec,
  CAREGIVER_DOMAIN,
  RELATED_PERSON_KIND,
  RELATED_TO,
} from '@/lib/graph/mapping/caregiver';
import { documentAdapter } from '@/lib/pipeline/adapters/document';
import {
  documentSpec,
  DOCUMENT_DOMAIN,
  DOCUMENT_REFERENCE_KIND,
  DOCUMENTED_BY,
} from '@/lib/graph/mapping/document';
import { MAPPING_SPECS, specFor, projectEvent, type UpsertEdge, type UpsertNode } from '@/lib/graph';
import { batchStep, defaultPipelineDeps, landStage, type PipelineDeps } from '@/lib/pipeline';
import type { C2Event } from '@/lib/outbox';
import assessment from './fixtures/assessment.json';
import caregiver from './fixtures/caregiver.json';
import documentFixture from './fixtures/document.json';

const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

// ─── assessments (wave C) ─────────────────────────────────────────────────────
const ASSESSMENT_PINNED = {
  domain: 'assessments',
  nodeKind: 'QuestionnaireResponse',
  edgeType: 'ASSESSED_BY',
  eventTypes: ['assessment.completed'] as const,
  tier: 'T1',
} as const;

describe('domain namespace integrity — assessments', () => {
  it('the pinned constants equal the pinned literals', () => {
    expect(ASSESSMENT_DOMAIN).toBe(ASSESSMENT_PINNED.domain);
    expect(QUESTIONNAIRE_RESPONSE_KIND).toBe(ASSESSMENT_PINNED.nodeKind);
    expect(ASSESSED_BY).toBe(ASSESSMENT_PINNED.edgeType);
  });

  it('adapter and mapping agree on the domain id', () => {
    expect(assessmentAdapter.domain).toBe(ASSESSMENT_PINNED.domain);
    expect(assessmentSpec.domain).toBe(ASSESSMENT_PINNED.domain);
    expect(assessmentSpec.domain).toBe(ASSESSMENT_DOMAIN);
  });

  it('both registries carry the assessments surfaces', () => {
    expect(MAPPING_SPECS).toContain(assessmentSpec);
    for (const et of ASSESSMENT_PINNED.eventTypes) expect(specFor(et)).toBe(assessmentSpec);
    expect(assessmentAdapter.format).toBe('fhir-json');
    expect(assessmentAdapter.arrivalMode).toBe('batch');
  });

  it('every eventType the adapter emits is claimed by exactly the assessments spec, all at tier T1', () => {
    const landed = landStage.run(
      { source: assessmentAdapter.source, format: 'fhir-json', payload: assessment.payload },
      deps,
    );
    const records = batchStep(assessmentAdapter)(landed, deps).normalized;
    expect(records.length).toBeGreaterThan(0);
    const emitted = new Set<string>();
    for (const r of records) {
      expect(r.domain).toBe(ASSESSMENT_PINNED.domain);
      expect(r.tier).toBe(ASSESSMENT_PINNED.tier); // C9 tier assertion
      expect(specFor(r.eventType)).toBe(assessmentSpec);
      emitted.add(r.eventType);
    }
    expect([...emitted].sort()).toEqual([...ASSESSMENT_PINNED.eventTypes].sort());
  });

  it('the mapping projects exactly the pinned node kind + associative edge type', () => {
    const completed = ev('assessment.completed', {
      questionnaireResponseRef: 'QuestionnaireResponse/qr-1', questionnaireRef: 'Questionnaire/phq-9',
      authored: '2026-04-02', patientReported: true, provenance: 'patient-reported',
    });
    const nodeKinds = projectEvent(completed, deps)
      .filter((m): m is UpsertNode => m.op === 'UpsertNode').map((m) => m.kind);
    const edgeTypes = projectEvent(completed, deps)
      .filter((m): m is UpsertEdge => m.op === 'UpsertEdge').map((m) => m.type);
    expect(nodeKinds).toContain(QUESTIONNAIRE_RESPONSE_KIND);
    expect(edgeTypes).toEqual([ASSESSED_BY]);
  });
});

// ─── caregiver-household (wave C) ─────────────────────────────────────────────
const CAREGIVER_PINNED = {
  domain: 'caregiver-household',
  nodeKind: 'RelatedPerson',
  edgeType: 'RELATED_TO',
  eventTypes: ['caregiver.related'] as const,
  tier: 'T1',
} as const;

describe('domain namespace integrity — caregiver-household', () => {
  it('the pinned constants equal the pinned literals', () => {
    expect(CAREGIVER_DOMAIN).toBe(CAREGIVER_PINNED.domain);
    expect(RELATED_PERSON_KIND).toBe(CAREGIVER_PINNED.nodeKind);
    expect(RELATED_TO).toBe(CAREGIVER_PINNED.edgeType);
  });

  it('adapter and mapping agree on the domain id', () => {
    expect(caregiverAdapter.domain).toBe(CAREGIVER_PINNED.domain);
    expect(caregiverSpec.domain).toBe(CAREGIVER_PINNED.domain);
    expect(caregiverSpec.domain).toBe(CAREGIVER_DOMAIN);
  });

  it('both registries carry the caregiver-household surfaces', () => {
    expect(MAPPING_SPECS).toContain(caregiverSpec);
    for (const et of CAREGIVER_PINNED.eventTypes) expect(specFor(et)).toBe(caregiverSpec);
    expect(caregiverAdapter.format).toBe('fhir-json');
    expect(caregiverAdapter.arrivalMode).toBe('batch');
  });

  it('every eventType the adapter emits is claimed by exactly the caregiver-household spec, all at tier T1', () => {
    const landed = landStage.run(
      { source: caregiverAdapter.source, format: 'fhir-json', payload: caregiver.payload },
      deps,
    );
    const records = batchStep(caregiverAdapter)(landed, deps).normalized;
    expect(records.length).toBeGreaterThan(0);
    const emitted = new Set<string>();
    for (const r of records) {
      expect(r.domain).toBe(CAREGIVER_PINNED.domain);
      expect(r.tier).toBe(CAREGIVER_PINNED.tier); // C9 tier assertion
      expect(specFor(r.eventType)).toBe(caregiverSpec);
      emitted.add(r.eventType);
    }
    expect([...emitted].sort()).toEqual([...CAREGIVER_PINNED.eventTypes].sort());
  });

  it('the mapping projects the pinned node kind + associative RELATED_TO carrying the role', () => {
    const related = ev('caregiver.related', {
      relatedPersonRef: 'RelatedPerson/rp-1', relationship: { code: 'SPS' },
      periodStart: '2025-11-01', active: true, provenance: 'household-registry',
    });
    const nodeKinds = projectEvent(related, deps)
      .filter((m): m is UpsertNode => m.op === 'UpsertNode').map((m) => m.kind);
    const relatedEdge = projectEvent(related, deps)
      .filter((m): m is UpsertEdge => m.op === 'UpsertEdge').find((m) => m.type === RELATED_TO)!;
    expect(nodeKinds).toContain(RELATED_PERSON_KIND);
    expect(relatedEdge.semantics.kind).toBe('associative');
    expect(relatedEdge.properties).toMatchObject({ role: 'SPS' });
  });
});

// ─── documents (wave C) — TIER T2, honestly NOT computable ────────────────────
const DOCUMENT_PINNED = {
  domain: 'documents',
  nodeKind: 'DocumentReference',
  edgeType: 'DOCUMENTED_BY',
  eventTypes: ['document.referenced'] as const,
  tier: 'T2',
} as const;

describe('domain namespace integrity — documents (T2)', () => {
  it('the pinned constants equal the pinned literals', () => {
    expect(DOCUMENT_DOMAIN).toBe(DOCUMENT_PINNED.domain);
    expect(DOCUMENT_REFERENCE_KIND).toBe(DOCUMENT_PINNED.nodeKind);
    expect(DOCUMENTED_BY).toBe(DOCUMENT_PINNED.edgeType);
  });

  it('adapter and mapping agree on the domain id', () => {
    expect(documentAdapter.domain).toBe(DOCUMENT_PINNED.domain);
    expect(documentSpec.domain).toBe(DOCUMENT_PINNED.domain);
    expect(documentSpec.domain).toBe(DOCUMENT_DOMAIN);
  });

  it('both registries carry the documents surfaces', () => {
    expect(MAPPING_SPECS).toContain(documentSpec);
    for (const et of DOCUMENT_PINNED.eventTypes) expect(specFor(et)).toBe(documentSpec);
    expect(documentAdapter.format).toBe('fhir-json');
    expect(documentAdapter.arrivalMode).toBe('batch');
  });

  it('documents is tier T2 (NOT T1) and every record honestly declares computable:false', () => {
    const landed = landStage.run(
      { source: documentAdapter.source, format: 'fhir-json', payload: documentFixture.payload },
      deps,
    );
    const records = batchStep(documentAdapter)(landed, deps).normalized;
    expect(records.length).toBeGreaterThan(0);
    const emitted = new Set<string>();
    for (const r of records) {
      expect(r.domain).toBe(DOCUMENT_PINNED.domain);
      // The headline pin: documents is T2, never T1. A CCD/PDF is document-level,
      // human-readable, and NOT computable — the record carries a pointer, not data.
      expect(r.tier).toBe('T2');
      expect(r.tier).not.toBe('T1');
      expect(r.payload.computable).toBe(false);
      expect(specFor(r.eventType)).toBe(documentSpec);
      emitted.add(r.eventType);
    }
    expect([...emitted].sort()).toEqual([...DOCUMENT_PINNED.eventTypes].sort());
  });

  it('the mapping projects the pinned node kind + associative DOCUMENTED_BY, node carries no parsed clinical data', () => {
    const referenced = ev('document.referenced', {
      documentReferenceRef: 'DocumentReference/doc-1', docType: { code: '34133-9' },
      date: '2026-05-10', status: 'current',
      content: { url: 'https://docs.example/ccd/doc-1.xml', contentType: 'application/xml' },
      computable: false, provenance: 'document-repository',
    });
    const node = projectEvent(referenced, deps)
      .filter((m): m is UpsertNode => m.op === 'UpsertNode').find((m) => m.kind === DOCUMENT_REFERENCE_KIND)!;
    const edgeTypes = projectEvent(referenced, deps)
      .filter((m): m is UpsertEdge => m.op === 'UpsertEdge').map((m) => m.type);
    expect(node.properties).toMatchObject({ computable: false });
    expect(node.properties).not.toHaveProperty('observations');
    expect(edgeTypes).toEqual([DOCUMENTED_BY]);
  });
});

/** Minimal C2 event for the projector-surface pinning assertions. */
function ev(eventType: string, payload: Record<string, unknown>): C2Event {
  return {
    eventId: 'evt', eventType, eventVersion: '1.0',
    occurredAt: '2026-05-01T00:00:00Z', recordedAt: '2026-05-01T00:00:00Z',
    memberId: 'M1', partitionKey: 'M1', class: 'batch', sequence: 0,
    correlationId: 'c', idempotencyKey: 'k',
    source: { system: 'assessment-hub', feed: 'assessments-fhir', tier: 'T1' },
    consentContext: { part2Restricted: false, segmentLabels: [] },
    payload,
  };
}
