import { describe, it, expect } from 'vitest';
import {
  batchStep,
  defaultPipelineDeps,
  landStage,
  priorAuthLifecycleAdapter,
  runPipeline,
  type LandInput,
  type PipelineDeps,
} from '@/lib/pipeline';
import { transition } from '@/lib/workflow/paMachine';
import { referencedState } from '@/lib/graph/mapping/priorAuthLifecycle';
import { OutboxWriter } from '@/lib/outbox';
import { makeDeps } from '../outbox/fakes';
import { makePgMemStore } from '../outbox/pgMem';
import pa from './fixtures/priorAuthLifecycle.json';

const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

function land(input: Omit<LandInput, 'payload'> & { payload: string }) {
  return landStage.run(input, deps);
}

describe('pa-lifecycle FHIR-JSON BATCH adapter (captured PA request status lifecycle)', () => {
  it('captures a DATED status lifecycle (submitted -> pending -> approved), not a snapshot', () => {
    const landed = land({ source: priorAuthLifecycleAdapter.source, format: 'fhir-json', payload: pa.payload });
    const out = batchStep(priorAuthLifecycleAdapter)(landed, deps);

    // 3 in (2 PA lifecycles + 1 subject-less) -> 2 loaded, 1 rejected.
    expect(out.reconciliation).toMatchObject({ countIn: 3, loaded: 2, rejected: 1, balanced: true });
    expect(out.quarantined[0].reasonCodes).toContain('missing-subject');

    const approved = out.normalized.find((r) => r.fhirResourceId === 'PriorAuthRequest/pa-1')!;
    expect(approved).toMatchObject({
      domain: 'pa-lifecycle', resourceType: 'PriorAuthRequest', eventType: 'pa-lifecycle.captured',
      tier: 'T1', provenance: 'pa-lifecycle-capture',
    });
    expect(approved.memberId).toMatch(/^mem-/); // anchored, never the raw PA-MEM-01
    expect(approved.idempotencyKey).toBe('pa-lifecycle:pa-1');
    const history = approved.payload.statusHistory as { status: string; at: string; seq: number }[];
    expect(history.map((h) => h.status)).toEqual(['submitted', 'pending', 'approved']);
    // Each transition is DATED, in order.
    expect(history.map((h) => h.at)).toEqual(['2026-05-01', '2026-05-02', '2026-05-05']);
    expect(approved.payload).toMatchObject({
      currentStatus: 'approved', submittedAt: '2026-05-01', decisionAt: '2026-05-05',
      serviceRequestRef: 'ServiceRequest/sr-100', claimRef: 'Claim/c-1',
    });
    expect(approved.occurredAt).toBe('2026-05-01T00:00:00Z');
  });

  it('captures a denied-then-appealed lifecycle with the decision date', () => {
    const landed = land({ source: priorAuthLifecycleAdapter.source, format: 'fhir-json', payload: pa.payload });
    const out = batchStep(priorAuthLifecycleAdapter)(landed, deps);
    const appealed = out.normalized.find((r) => r.fhirResourceId === 'PriorAuthRequest/pa-2')!;
    const history = appealed.payload.statusHistory as { status: string }[];
    expect(history.map((h) => h.status)).toEqual(['submitted', 'pending', 'denied', 'appealed']);
    expect(appealed.payload).toMatchObject({ currentStatus: 'appealed', decisionAt: '2026-06-07' });
  });

  it('every normalized pa-lifecycle record is tier T1 (C9 tier grammar)', () => {
    const landed = land({ source: priorAuthLifecycleAdapter.source, format: 'fhir-json', payload: pa.payload });
    const out = batchStep(priorAuthLifecycleAdapter)(landed, deps);
    expect(out.normalized).toHaveLength(2);
    for (const r of out.normalized) expect(r.tier).toBe('T1');
  });

  it('REFERENCES the paMachine PaState vocabulary but never sets authoritative state', () => {
    // Authoritative Approved/Denied comes ONLY from the paMachine transition (a
    // payer ClaimResponse). This is the source of truth this domain must not usurp.
    const authoritative = transition('Pending', { type: 'claim-response', decision: 'denied', reasons: ['CO-197'] }, { priority: 'standard' });
    expect(authoritative.state).toBe('Denied');

    // pa-lifecycle merely REFERENCES that vocabulary for a captured status label,
    // and cannot name a state the machine does not define.
    expect(referencedState('denied')).toBe('Denied');
    expect(referencedState('approved')).toBe('Approved');
    expect(referencedState('totally-made-up')).toBe('Unknown');

    // The capture feed is disjoint from the authoritative machine feed: it emits
    // pa-lifecycle.* events only, never the machine's authoritative claim-response.
    const landed = land({ source: priorAuthLifecycleAdapter.source, format: 'fhir-json', payload: pa.payload });
    const out = batchStep(priorAuthLifecycleAdapter)(landed, deps);
    for (const r of out.normalized) {
      expect(r.eventType).toMatch(/^pa-lifecycle\./);
      expect(r.eventType).not.toBe('claim-response');
      // The normalized record carries a captured status, not an authoritative decision field.
      expect(r.payload).not.toHaveProperty('authoritativeState');
    }
  });
});

describe('end-to-end pa-lifecycle pipeline: land -> ... -> project+propagate (outbox)', () => {
  it('runs all five stages and propagates a captured PA event per record (pg-mem)', async () => {
    const { store } = await makePgMemStore();
    const odeps = makeDeps(store);
    const writer = new OutboxWriter(odeps);

    const result = await runPipeline(
      priorAuthLifecycleAdapter,
      { source: priorAuthLifecycleAdapter.source, format: 'fhir-json', payload: pa.payload },
      deps,
      { writer },
    );

    expect(result.loadReconciliation).toMatchObject({ countIn: 2, loaded: 2, balanced: true });
    expect(result.quarantined).toHaveLength(1);
    expect(result.affectedMembers).toHaveLength(2);
    expect(odeps.publisher.events).toHaveLength(2);
    for (const e of odeps.publisher.events) {
      expect(e.eventType).toBe('pa-lifecycle.captured');
      expect(e.class).toBe('batch');
      expect(e.source.tier).toBe('T1');
      expect(e.partitionKey).toBe(e.memberId);
    }
  });
});
