import { describe, it, expect } from 'vitest';
import {
  conditionsAdapter,
  batchStep,
  bindSemantics,
  defaultPipelineDeps,
  isCodeCarryingDomain,
  landStage,
  runPipeline,
  type LandInput,
  type NormalizedRecord,
  type PipelineDeps,
} from '@/lib/pipeline';
import {
  conditionsSpec,
  CONDITIONS_DOMAIN,
  CONDITION_KIND,
  HAS_PROBLEM,
} from '@/lib/graph/mapping/conditions';
import { MAPPING_SPECS, specFor, projectEvent, type UpsertEdge, type UpsertNode } from '@/lib/graph';
import type { C2Event } from '@/lib/outbox';
import { OutboxWriter } from '@/lib/outbox';
import { makeDeps } from '../outbox/fakes';
import { makePgMemStore } from '../outbox/pgMem';
import conditions from './fixtures/conditions.json';

const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

function land(input: Omit<LandInput, 'payload'> & { payload: string }) {
  return landStage.run(input, deps);
}
function normalized(): NormalizedRecord[] {
  const landed = land({ source: conditionsAdapter.source, format: 'fhir-json', payload: conditions.payload });
  return batchStep(conditionsAdapter)(landed, deps).normalized;
}
function byRef(ref: string): NormalizedRecord {
  return normalized().find((r) => r.fhirResourceId === ref)!;
}
/** No PHI-marked token may appear in a record or quarantine record. */
function assertPhiSafe(v: unknown): void {
  const s = JSON.stringify(v);
  for (const bad of ['COND-MEM', 'Patient', 'subject', 'reference']) expect(s).not.toContain(bad);
}

describe('conditions FHIR-JSON BATCH adapter (Condition problem list)', () => {
  it('normalizes coded problems at T1 and quarantines the ICD-less one', () => {
    const landed = land({ source: conditionsAdapter.source, format: 'fhir-json', payload: conditions.payload });
    const out = batchStep(conditionsAdapter)(landed, deps);

    // 4 in (3 coded + 1 malformed) -> 3 loaded, 1 rejected.
    expect(out.reconciliation).toMatchObject({ countIn: 4, loaded: 3, rejected: 1, balanced: true });
    expect(out.quarantined[0].reasonCodes).toContain('missing-condition-code');
    assertPhiSafe(out.quarantined[0]);

    const rec = byRef('Condition/cond-diabetes');
    expect(rec).toMatchObject({
      domain: 'conditions',
      resourceType: 'Condition',
      eventType: 'condition.recorded',
      tier: 'T1',
      provenance: 'diagnosis-authoritative',
    });
    expect(rec.memberId).toMatch(/^mem-/); // anchored, never the raw COND-MEM id
    expect(rec.idempotencyKey).toBe('condition:cond-diabetes');
    expect(rec.occurredAt).toBe('2026-03-04T00:00:00Z');
    assertPhiSafe(rec);
  });

  it('carries the ICD-10-CM + SNOMED codings and honest HCC relevance', () => {
    const diabetes = byRef('Condition/cond-diabetes').payload as Record<string, unknown>;
    expect((diabetes.code as Record<string, unknown>).code).toBe('E11.9');
    expect((diabetes.snomed as Record<string, unknown>).code).toBe('44054006');
    expect((diabetes.hcc as Record<string, unknown>).code).toBe('HCC38');
    expect(diabetes.hccRelevant).toBe(true);
  });

  it('every normalized conditions record is tier T1 (C9 tier grammar)', () => {
    for (const r of normalized()) expect(r.tier).toBe('T1');
  });
});

describe('conditions is a code-carrying domain: governed codings run the semantic gate', () => {
  it('conditions is registered in the code-carrying set', () => {
    expect(isCodeCarryingDomain('conditions')).toBe(true);
  });

  it('admits the seed-valid ICD/SNOMED/HCC codings (flag posture)', () => {
    const rec = byRef('Condition/cond-diabetes');
    expect(bindSemantics(rec, { posture: 'flag' }).ok).toBe(true);
  });

  it('quarantines an unrecognized ICD-10 code before admission (PHI-safe reason)', () => {
    const bogus: NormalizedRecord = {
      ...byRef('Condition/cond-hf'),
      payload: { conditionRef: 'Condition/x', code: { system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'X99.9' } },
    };
    const result = bindSemantics(bogus, { posture: 'flag' });
    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => i.reasonCode)).toContain('semantic-unrecognized-code');
    // PHI-safe: reason + field path only, no display or narrative.
    expect(JSON.stringify(result.issues)).not.toContain('display');
  });
});

// ─── graph projection ─────────────────────────────────────────────────────────
describe('conditions mapping spec -> the member problem subgraph', () => {
  it('projects a Condition node + a dated associative HAS_PROBLEM edge', () => {
    const recorded = ev('condition.recorded', {
      conditionRef: 'Condition/c-1',
      code: { system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'E11.9' },
      snomed: { system: 'http://snomed.info/sct', code: '44054006' },
      hcc: { system: 'urn:cms:risk-adjustment:hcc', code: 'HCC38' },
      hccRelevant: true, clinicalStatus: 'active', verificationStatus: 'confirmed',
      recordedDate: '2026-03-04',
    });
    const nodeKinds = projectEvent(recorded, deps)
      .filter((m): m is UpsertNode => m.op === 'UpsertNode').map((m) => m.kind);
    const edges = projectEvent(recorded, deps).filter((m): m is UpsertEdge => m.op === 'UpsertEdge');
    expect(nodeKinds).toContain(CONDITION_KIND);
    expect(edges.map((e) => e.type)).toEqual([HAS_PROBLEM]);
    expect(edges[0].semantics.kind).toBe('associative');
    expect(edges[0].validity).toMatchObject({ start: '2026-03-04', end: null });
    expect(edges[0].properties).toMatchObject({ hccRelevant: true });
  });
});

// ─── namespace pinning (F-C1 lesson) ──────────────────────────────────────────
describe('domain namespace integrity — conditions', () => {
  it('the pinned constants + adapter + mapping + registries all agree', () => {
    expect(CONDITIONS_DOMAIN).toBe('conditions');
    expect(CONDITION_KIND).toBe('Condition');
    expect(HAS_PROBLEM).toBe('HAS_PROBLEM');
    expect(conditionsAdapter.domain).toBe(CONDITIONS_DOMAIN);
    expect(conditionsSpec.domain).toBe(CONDITIONS_DOMAIN);
    expect(conditionsAdapter.format).toBe('fhir-json');
    expect(conditionsAdapter.arrivalMode).toBe('batch');
    expect(MAPPING_SPECS).toContain(conditionsSpec);
    expect(specFor('condition.recorded')).toBe(conditionsSpec);
  });

  it('every eventType the adapter emits is claimed by exactly the conditions spec', () => {
    const emitted = new Set<string>();
    for (const r of normalized()) {
      expect(r.domain).toBe('conditions');
      expect(specFor(r.eventType)).toBe(conditionsSpec);
      emitted.add(r.eventType);
    }
    expect([...emitted]).toEqual(['condition.recorded']);
  });
});

// ─── end to end ───────────────────────────────────────────────────────────────
describe('end-to-end conditions pipeline: land -> ... -> project+propagate', () => {
  it('propagates one T1 event per record', async () => {
    const { store } = await makePgMemStore();
    const odeps = makeDeps(store);
    const writer = new OutboxWriter(odeps);
    const result = await runPipeline(
      conditionsAdapter,
      { source: conditionsAdapter.source, format: 'fhir-json', payload: conditions.payload },
      deps,
      { writer },
    );
    expect(result.loadReconciliation).toMatchObject({ countIn: 3, loaded: 3, balanced: true });
    expect(result.quarantined).toHaveLength(1);
    expect(odeps.publisher.events).toHaveLength(3);
    for (const e of odeps.publisher.events) {
      expect(e.eventType).toBe('condition.recorded');
      expect(e.class).toBe('batch');
      expect(e.source.tier).toBe('T1');
    }
  });
});

/** Minimal C2 event for the projector-surface assertions. */
function ev(eventType: string, payload: Record<string, unknown>): C2Event {
  return {
    eventId: 'evt', eventType, eventVersion: '1.0',
    occurredAt: '2026-03-04T00:00:00Z', recordedAt: '2026-03-04T00:00:00Z',
    memberId: 'M1', partitionKey: 'M1', class: 'batch', sequence: 0,
    correlationId: 'c', idempotencyKey: 'k',
    source: { system: 'ehr-problem-list', feed: 'conditions-fhir', tier: 'T1' },
    consentContext: { part2Restricted: false, segmentLabels: [] },
    payload,
  };
}
