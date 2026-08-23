import { describe, it, expect } from 'vitest';
import {
  familyHistoryAdapter,
  batchStep,
  defaultPipelineDeps,
  landStage,
  runPipeline,
  type LandInput,
  type NormalizedRecord,
  type PipelineDeps,
} from '@/lib/pipeline';
import {
  familyHistorySpec,
  FAMILY_HISTORY_DOMAIN,
  FAMILY_MEMBER_HISTORY_KIND,
  HAS_FAMILY_HISTORY,
} from '@/lib/graph/mapping/familyHistory';
import { MAPPING_SPECS, specFor, projectEvent, type UpsertEdge, type UpsertNode } from '@/lib/graph';
import type { C2Event } from '@/lib/outbox';
import { OutboxWriter } from '@/lib/outbox';
import { makeDeps } from '../outbox/fakes';
import { makePgMemStore } from '../outbox/pgMem';
import fh from './fixtures/familyHistory.json';

const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

function land(input: Omit<LandInput, 'payload'> & { payload: string }) {
  return landStage.run(input, deps);
}
function normalized(): NormalizedRecord[] {
  const landed = land({ source: familyHistoryAdapter.source, format: 'fhir-json', payload: fh.payload });
  return batchStep(familyHistoryAdapter)(landed, deps).normalized;
}
function byRef(ref: string): NormalizedRecord {
  return normalized().find((r) => r.fhirResourceId === ref)!;
}
function assertPhiSafe(v: unknown): void {
  const s = JSON.stringify(v);
  for (const bad of ['FH-MEM', 'Patient', 'patient', 'reference']) expect(s).not.toContain(bad);
}

describe('family-history FHIR-JSON BATCH adapter (FamilyMemberHistory)', () => {
  it('normalizes histories at T1 and quarantines the relationship-less one', () => {
    const landed = land({ source: familyHistoryAdapter.source, format: 'fhir-json', payload: fh.payload });
    const out = batchStep(familyHistoryAdapter)(landed, deps);
    // 3 in (2 coded + 1 malformed) -> 2 loaded, 1 rejected.
    expect(out.reconciliation).toMatchObject({ countIn: 3, loaded: 2, rejected: 1, balanced: true });
    expect(out.quarantined[0].reasonCodes).toContain('missing-relationship');
    assertPhiSafe(out.quarantined[0]);

    const rec = byRef('FamilyMemberHistory/fmh-mother');
    expect(rec).toMatchObject({
      domain: 'family-history',
      resourceType: 'FamilyMemberHistory',
      eventType: 'family-history.recorded',
      tier: 'T1',
      provenance: 'family-reported',
    });
    expect(rec.memberId).toMatch(/^mem-/); // the MEMBER is anchored; the relative is not
    expect(rec.idempotencyKey).toBe('family-history:fmh-mother');
    expect(rec.occurredAt).toBe('2026-04-01T00:00:00Z');
    assertPhiSafe(rec);
  });

  it('carries the relationship role + coded relative conditions (PHI-minimal)', () => {
    const mother = byRef('FamilyMemberHistory/fmh-mother').payload as Record<string, unknown>;
    expect(mother.relationship).toBe('MTH');
    const conditions = mother.conditions as Array<Record<string, unknown>>;
    expect(conditions).toHaveLength(1);
    expect(conditions[0].code).toBe('44054006');
  });

  it('every normalized family-history record is tier T1 (C9 tier grammar)', () => {
    for (const r of normalized()) expect(r.tier).toBe('T1');
  });
});

// ─── graph projection ─────────────────────────────────────────────────────────
describe('family-history mapping spec -> the member family-history subgraph', () => {
  it('projects a FamilyMemberHistory node + a dated associative HAS_FAMILY_HISTORY edge', () => {
    const recorded = ev('family-history.recorded', {
      familyMemberHistoryRef: 'FamilyMemberHistory/f-1', relationship: 'MTH',
      conditions: [{ system: 'http://snomed.info/sct', code: '44054006' }],
      status: 'completed', recordedDate: '2026-04-01', provenance: 'family-reported',
    });
    const nodes = projectEvent(recorded, deps).filter((m): m is UpsertNode => m.op === 'UpsertNode');
    const edges = projectEvent(recorded, deps).filter((m): m is UpsertEdge => m.op === 'UpsertEdge');
    expect(nodes.map((n) => n.kind)).toContain(FAMILY_MEMBER_HISTORY_KIND);
    const fmhNode = nodes.find((n) => n.kind === FAMILY_MEMBER_HISTORY_KIND)!;
    expect(fmhNode.properties.relationship).toBe('MTH');
    expect(fmhNode.properties.conditionCodes).toEqual(['44054006']);
    expect(edges.map((e) => e.type)).toEqual([HAS_FAMILY_HISTORY]);
    expect(edges[0].semantics.kind).toBe('associative');
    expect(edges[0].validity).toMatchObject({ start: '2026-04-01', end: null });
  });
});

// ─── namespace pinning (F-C1 lesson) ──────────────────────────────────────────
describe('domain namespace integrity — family-history', () => {
  it('the pinned constants + adapter + mapping + registries all agree', () => {
    expect(FAMILY_HISTORY_DOMAIN).toBe('family-history');
    expect(FAMILY_MEMBER_HISTORY_KIND).toBe('FamilyMemberHistory');
    expect(HAS_FAMILY_HISTORY).toBe('HAS_FAMILY_HISTORY');
    expect(familyHistoryAdapter.domain).toBe(FAMILY_HISTORY_DOMAIN);
    expect(familyHistorySpec.domain).toBe(FAMILY_HISTORY_DOMAIN);
    expect(familyHistoryAdapter.format).toBe('fhir-json');
    expect(MAPPING_SPECS).toContain(familyHistorySpec);
    expect(specFor('family-history.recorded')).toBe(familyHistorySpec);
  });

  it('every eventType the adapter emits is claimed by exactly the family-history spec', () => {
    const emitted = new Set<string>();
    for (const r of normalized()) {
      expect(r.domain).toBe('family-history');
      expect(specFor(r.eventType)).toBe(familyHistorySpec);
      emitted.add(r.eventType);
    }
    expect([...emitted]).toEqual(['family-history.recorded']);
  });
});

// ─── end to end ───────────────────────────────────────────────────────────────
describe('end-to-end family-history pipeline: land -> ... -> project+propagate', () => {
  it('propagates one T1 event per record', async () => {
    const { store } = await makePgMemStore();
    const odeps = makeDeps(store);
    const writer = new OutboxWriter(odeps);
    const result = await runPipeline(
      familyHistoryAdapter,
      { source: familyHistoryAdapter.source, format: 'fhir-json', payload: fh.payload },
      deps,
      { writer },
    );
    expect(result.loadReconciliation).toMatchObject({ countIn: 2, loaded: 2, balanced: true });
    expect(result.quarantined).toHaveLength(1);
    expect(odeps.publisher.events).toHaveLength(2);
    for (const e of odeps.publisher.events) {
      expect(e.eventType).toBe('family-history.recorded');
      expect(e.source.tier).toBe('T1');
    }
  });
});

function ev(eventType: string, payload: Record<string, unknown>): C2Event {
  return {
    eventId: 'evt', eventType, eventVersion: '1.0',
    occurredAt: '2026-04-01T00:00:00Z', recordedAt: '2026-04-01T00:00:00Z',
    memberId: 'M1', partitionKey: 'M1', class: 'batch', sequence: 0,
    correlationId: 'c', idempotencyKey: 'k',
    source: { system: 'ehr-family-history', feed: 'family-history-fhir', tier: 'T1' },
    consentContext: { part2Restricted: false, segmentLabels: [] },
    payload,
  };
}
