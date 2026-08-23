import { describe, it, expect } from 'vitest';
import {
  diagnosticReportsAdapter,
  batchStep,
  defaultPipelineDeps,
  landStage,
  runPipeline,
  type LandInput,
  type NormalizedRecord,
  type PipelineDeps,
} from '@/lib/pipeline';
import {
  diagnosticReportsSpec,
  DIAGNOSTIC_REPORTS_DOMAIN,
  DIAGNOSTIC_REPORT_KIND,
  OBSERVATION_KIND,
  HAS_DIAGNOSTIC_REPORT,
  REPORTS_RESULT,
} from '@/lib/graph/mapping/diagnosticReports';
import { MAPPING_SPECS, specFor, projectEvent, type UpsertEdge, type UpsertNode } from '@/lib/graph';
import type { C2Event } from '@/lib/outbox';
import { OutboxWriter } from '@/lib/outbox';
import { makeDeps } from '../outbox/fakes';
import { makePgMemStore } from '../outbox/pgMem';
import reports from './fixtures/diagnosticReports.json';

const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

function land(input: Omit<LandInput, 'payload'> & { payload: string }) {
  return landStage.run(input, deps);
}
function normalized(): NormalizedRecord[] {
  const landed = land({ source: diagnosticReportsAdapter.source, format: 'fhir-json', payload: reports.payload });
  return batchStep(diagnosticReportsAdapter)(landed, deps).normalized;
}
function byRef(ref: string): NormalizedRecord {
  return normalized().find((r) => r.fhirResourceId === ref)!;
}
function assertPhiSafe(v: unknown): void {
  const s = JSON.stringify(v);
  for (const bad of ['DR-MEM', 'Patient', 'subject', 'reference']) expect(s).not.toContain(bad);
}

describe('diagnostic-reports FHIR-JSON BATCH adapter (DiagnosticReport)', () => {
  it('normalizes reports and quarantines the content-less one', () => {
    const landed = land({ source: diagnosticReportsAdapter.source, format: 'fhir-json', payload: reports.payload });
    const out = batchStep(diagnosticReportsAdapter)(landed, deps);
    // 3 in (1 computable + 1 narrative-only + 1 empty) -> 2 loaded, 1 rejected.
    expect(out.reconciliation).toMatchObject({ countIn: 3, loaded: 2, rejected: 1, balanced: true });
    expect(out.quarantined[0].reasonCodes).toContain('missing-report-content');
    assertPhiSafe(out.quarantined[0]);

    const rec = byRef('DiagnosticReport/dr-cmp');
    expect(rec).toMatchObject({
      domain: 'diagnostic-reports',
      resourceType: 'DiagnosticReport',
      eventType: 'diagnostic-report.recorded',
      provenance: 'diagnostic-service',
    });
    expect(rec.memberId).toMatch(/^mem-/);
    expect(rec.idempotencyKey).toBe('diagnostic-report:dr-cmp');
    assertPhiSafe(rec);
  });
});

// ─── E9: honest tier — a narrative-only report must not claim the T1 it cannot compute ──
describe('E9 honest computability tier (T1 computable / T2 narrative-only)', () => {
  it('a result-linked report is COMPUTABLE -> T1', () => {
    const cmp = byRef('DiagnosticReport/dr-cmp');
    expect(cmp.tier).toBe('T1');
    const p = cmp.payload as Record<string, unknown>;
    expect(p.computable).toBe(true);
    expect(p.resultRefs).toEqual(['Observation/obs-glucose', 'Observation/obs-creatinine']);
  });

  it('a narrative-only imaging report is NOT computable -> honest T2 (never a claimed T1)', () => {
    const xray = byRef('DiagnosticReport/dr-chest-xray');
    expect(xray.tier).toBe('T2');
    const p = xray.payload as Record<string, unknown>;
    expect(p.computable).toBe(false);
    expect(p.resultRefs).toEqual([]);
    // It carries only a pointer, never parsed structured results.
    expect((p.presentedForm as Record<string, unknown>).contentType).toBe('application/pdf');
  });
});

// ─── graph projection ─────────────────────────────────────────────────────────
describe('diagnostic-reports mapping spec -> the member diagnostics subgraph', () => {
  it('a computable report links results via REPORTS_RESULT', () => {
    const recorded = ev('diagnostic-report.recorded', {
      diagnosticReportRef: 'DiagnosticReport/d-1', code: { system: 'http://loinc.org', code: '24323-8' },
      category: 'LAB', status: 'final', effectiveDateTime: '2026-05-02T09:00:00Z',
      resultRefs: ['Observation/o-1', 'Observation/o-2'], computable: true,
    });
    const nodeKinds = projectEvent(recorded, deps)
      .filter((m): m is UpsertNode => m.op === 'UpsertNode').map((m) => m.kind);
    const edges = projectEvent(recorded, deps).filter((m): m is UpsertEdge => m.op === 'UpsertEdge');
    expect(nodeKinds).toContain(DIAGNOSTIC_REPORT_KIND);
    expect(edges.map((e) => e.type)).toEqual([HAS_DIAGNOSTIC_REPORT, REPORTS_RESULT, REPORTS_RESULT]);
    const resultEdges = edges.filter((e) => e.type === REPORTS_RESULT);
    expect(resultEdges.map((e) => e.to.kind)).toEqual([OBSERVATION_KIND, OBSERVATION_KIND]);
    expect(resultEdges.map((e) => e.to.key)).toEqual(['Observation/o-1', 'Observation/o-2']);
    expect(edges[0].semantics.kind).toBe('associative');
  });

  it('a narrative-only report emits NO REPORTS_RESULT edge (E9: no fabricated linkage)', () => {
    const narrative = ev('diagnostic-report.recorded', {
      diagnosticReportRef: 'DiagnosticReport/d-2', code: { system: 'http://loinc.org', code: '36643-5' },
      category: 'RAD', status: 'final', effectiveDateTime: '2026-05-03T14:30:00Z',
      resultRefs: [], computable: false,
      presentedForm: { url: 'https://synthetic.example/x.pdf', contentType: 'application/pdf', title: 't' },
    });
    const edgeTypes = projectEvent(narrative, deps)
      .filter((m): m is UpsertEdge => m.op === 'UpsertEdge').map((m) => m.type);
    expect(edgeTypes).toEqual([HAS_DIAGNOSTIC_REPORT]);
  });
});

// ─── namespace pinning (F-C1 lesson) ──────────────────────────────────────────
describe('domain namespace integrity — diagnostic-reports', () => {
  it('the pinned constants + adapter + mapping + registries all agree', () => {
    expect(DIAGNOSTIC_REPORTS_DOMAIN).toBe('diagnostic-reports');
    expect(DIAGNOSTIC_REPORT_KIND).toBe('DiagnosticReport');
    expect(HAS_DIAGNOSTIC_REPORT).toBe('HAS_DIAGNOSTIC_REPORT');
    expect(REPORTS_RESULT).toBe('REPORTS_RESULT');
    expect(diagnosticReportsAdapter.domain).toBe(DIAGNOSTIC_REPORTS_DOMAIN);
    expect(diagnosticReportsSpec.domain).toBe(DIAGNOSTIC_REPORTS_DOMAIN);
    expect(diagnosticReportsAdapter.format).toBe('fhir-json');
    expect(MAPPING_SPECS).toContain(diagnosticReportsSpec);
    expect(specFor('diagnostic-report.recorded')).toBe(diagnosticReportsSpec);
  });

  it('every eventType the adapter emits is claimed by exactly the diagnostic-reports spec', () => {
    const emitted = new Set<string>();
    for (const r of normalized()) {
      expect(r.domain).toBe('diagnostic-reports');
      expect(specFor(r.eventType)).toBe(diagnosticReportsSpec);
      emitted.add(r.eventType);
    }
    expect([...emitted]).toEqual(['diagnostic-report.recorded']);
  });
});

// ─── end to end ───────────────────────────────────────────────────────────────
describe('end-to-end diagnostic-reports pipeline: land -> ... -> project+propagate', () => {
  it('propagates one event per record, carrying the honest per-record tier', async () => {
    const { store } = await makePgMemStore();
    const odeps = makeDeps(store);
    const writer = new OutboxWriter(odeps);
    const result = await runPipeline(
      diagnosticReportsAdapter,
      { source: diagnosticReportsAdapter.source, format: 'fhir-json', payload: reports.payload },
      deps,
      { writer },
    );
    expect(result.loadReconciliation).toMatchObject({ countIn: 2, loaded: 2, balanced: true });
    expect(result.quarantined).toHaveLength(1);
    expect(odeps.publisher.events).toHaveLength(2);
    const tiers = odeps.publisher.events.map((e) => e.source.tier).sort();
    expect(tiers).toEqual(['T1', 'T2']); // computable + narrative-only, honestly
  });
});

function ev(eventType: string, payload: Record<string, unknown>): C2Event {
  return {
    eventId: 'evt', eventType, eventVersion: '1.0',
    occurredAt: '2026-05-02T00:00:00Z', recordedAt: '2026-05-02T00:00:00Z',
    memberId: 'M1', partitionKey: 'M1', class: 'batch', sequence: 0,
    correlationId: 'c', idempotencyKey: 'k',
    source: { system: 'diagnostics-hub', feed: 'diagnostic-reports-fhir', tier: 'T1' },
    consentContext: { part2Restricted: false, segmentLabels: [] },
    payload,
  };
}
