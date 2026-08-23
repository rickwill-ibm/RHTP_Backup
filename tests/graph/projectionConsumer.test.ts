/**
 * HW1 / I14 — outbox->projector consumer (REC-01). Proves the previously-unwired
 * projection path now drains eligible intents into the graph, in per-member
 * sequence order, resumably and idempotently.
 */
import { describe, it, expect } from 'vitest';
import { runProjectionOnce, createMemoryCheckpointStore } from '../../src/lib/graph/consumer';
import type { OutboxStore, OutboxIntentRow, OutboxIntentInput } from '../../src/lib/outbox';
import type { GraphStore, Mutation } from '../../src/lib/graph/types';

function intent(memberId: string, seq: number | null, status: OutboxIntentRow['status'], n: number): OutboxIntentRow {
  const envelope: OutboxIntentInput = {
    memberId,
    eventType: 'medication.dispensed',
    fhirResourceId: `MedicationDispense/${memberId}-${n}`,
    idempotencyKey: `${memberId}-${n}`,
    actor: 'system',
    correlationId: `corr-${memberId}-${n}`,
    class: 'stream',
    source: { system: 'test', feed: 'unit' },
    consentContext: { part2Restricted: false },
    eventVersion: '1.0',
    payload: { code: 'rx-1' },
  };
  return {
    id: `${memberId}-${n}`, memberId, eventType: envelope.eventType,
    fhirResourceId: envelope.fhirResourceId, idempotencyKey: envelope.idempotencyKey,
    status, sequence: seq, attempts: 0, actor: 'system', correlationId: envelope.correlationId,
    createdAtMs: 1000 + n, updatedAtMs: 1000 + n, envelope,
  };
}

function stubOutbox(rows: OutboxIntentRow[]): OutboxStore {
  return {
    id: 'stub',
    async all() { return rows; },
    async enqueue(r) { return { row: r, deduped: false }; },
    async pendingForMember() { return []; },
    async confirmedForMember() { return []; },
    async nextSequence() { return 0; },
    async claimForConfirm() { return null; },
    async update() {},
    async stalePending() { return []; },
    async get() { return null; },
  };
}

function recordingGraph(): GraphStore & { applied: Mutation[]; calls: number } {
  const applied: Mutation[] = [];
  return {
    id: 'rec', applied, calls: 0,
    async apply(m: Mutation[]) { this.calls++; applied.push(...m); },
    async getNode() { return null; },
    async listNodes() { return []; },
    async listEdges() { return []; },
  };
}

const deps = { now: () => 1_700_000_000_000, rng: () => 0.42 };

describe('runProjectionOnce (REC-01)', () => {
  it('applies eligible intents in per-member sequence order and advances the checkpoint', async () => {
    const rows = [
      intent('A', 1, 'confirmed', 2),
      intent('A', 0, 'confirmed', 1),   // out of order in the array; consumer must sort
      intent('A', null, 'pending', 3),  // pending: NOT eligible
      intent('B', 0, 'published', 1),
    ];
    const graph = recordingGraph();
    const ckpt = createMemoryCheckpointStore();
    const res = await runProjectionOnce(stubOutbox(rows), graph, ckpt, deps);

    expect(res.applied).toBe(3);          // A:0,A:1,B:0 — pending excluded
    expect(res.members).toBe(2);
    expect(res.highWater).toEqual({ A: 1, B: 0 });
    expect(graph.calls).toBe(3);          // one apply per eligible intent
    expect(await ckpt.highWater('A')).toBe(1);
  });

  it('is idempotent — a second run re-applies nothing (checkpoint holds)', async () => {
    const rows = [intent('A', 0, 'confirmed', 1), intent('A', 1, 'confirmed', 2)];
    const graph = recordingGraph();
    const ckpt = createMemoryCheckpointStore();
    await runProjectionOnce(stubOutbox(rows), graph, ckpt, deps);
    const second = await runProjectionOnce(stubOutbox(rows), graph, ckpt, deps);
    expect(second.applied).toBe(0);
    expect(second.skipped).toBe(2);
  });

  it('resumes — only intents beyond the checkpoint are applied', async () => {
    const ckpt = createMemoryCheckpointStore();
    await ckpt.advance('A', 0); // pretend seq 0 already applied
    const graph = recordingGraph();
    const res = await runProjectionOnce(stubOutbox([
      intent('A', 0, 'confirmed', 1),
      intent('A', 1, 'confirmed', 2),
    ]), graph, ckpt, deps);
    expect(res.applied).toBe(1);   // only seq 1
    expect(res.skipped).toBe(1);
  });
});
