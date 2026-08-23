import { describe, it, expect } from 'vitest';
import {
  batchStep,
  defaultPipelineDeps,
  goalTaskAdapter,
  landStage,
  runPipeline,
  type LandInput,
  type PipelineDeps,
} from '@/lib/pipeline';
import { OutboxWriter } from '@/lib/outbox';
import { makeDeps } from '../outbox/fakes';
import { makePgMemStore } from '../outbox/pgMem';
import goalTask from './fixtures/goalTask.json';

const deps: PipelineDeps = defaultPipelineDeps({ now: () => 1_700_000_000_000 });

function land(input: Omit<LandInput, 'payload'> & { payload: string }) {
  return landStage.run(input, deps);
}

/** No PHI-marked token may appear in a quarantine record. */
function assertQuarantinePhiSafe(q: unknown): void {
  const s = JSON.stringify(q);
  for (const bad of ['GT-MEM', 'Patient', 'name', 'given', 'family']) {
    expect(s).not.toContain(bad);
  }
}

describe('goals/tasks FHIR-JSON BATCH adapter (Goal + Task)', () => {
  it('normalizes Goal + Task records at T1 and quarantines the coding-less goal', () => {
    const landed = land({ source: goalTaskAdapter.source, format: 'fhir-json', payload: goalTask.payload });
    const out = batchStep(goalTaskAdapter)(landed, deps);

    // 5 in (2 goal + 2 task + 1 malformed) -> 4 loaded, 1 rejected.
    expect(out.reconciliation).toMatchObject({ countIn: 5, loaded: 4, rejected: 1, balanced: true });
    expect(out.quarantined[0].reasonCodes).toContain('missing-goal-code');
    assertQuarantinePhiSafe(out.quarantined[0]);

    const goal = out.normalized.find((r) => r.fhirResourceId === 'Goal/goal-1')!;
    expect(goal).toMatchObject({
      domain: 'goals-tasks',
      resourceType: 'Goal',
      eventType: 'goal.recorded',
      tier: 'T1', // C9 tier assertion
      provenance: 'care-plan-goal',
    });
    expect(goal.memberId).toMatch(/^mem-/); // anchored, never the raw GT-MEM-01
    expect(goal.idempotencyKey).toBe('gt:goal:goal-1');
    expect(goal.payload).toMatchObject({ goalRef: 'Goal/goal-1', code: '443402002', startDate: '2026-02-01', dueDate: '2026-08-01' });
    expect(goal.occurredAt).toBe('2026-02-01T00:00:00Z');

    // task-1 references its Goal via focus; task-2 is free-standing (no goalRef).
    const task1 = out.normalized.find((r) => r.fhirResourceId === 'Task/task-1')!;
    expect(task1).toMatchObject({ resourceType: 'Task', eventType: 'task.recorded', tier: 'T1', provenance: 'care-plan-task' });
    expect(task1.payload).toMatchObject({ taskRef: 'Task/task-1', goalRef: 'Goal/goal-1', code: 'schedule-visit' });
    const task2 = out.normalized.find((r) => r.fhirResourceId === 'Task/task-2')!;
    expect(task2.payload).toMatchObject({ goalRef: '', code: 'outreach-call' });
    expect(JSON.stringify(out.normalized)).not.toContain('GT-MEM'); // no PHI in payloads
  });

  it('every normalized goals-tasks record is tier T1 (C9 tier grammar)', () => {
    const landed = land({ source: goalTaskAdapter.source, format: 'fhir-json', payload: goalTask.payload });
    const out = batchStep(goalTaskAdapter)(landed, deps);
    expect(out.normalized).toHaveLength(4);
    for (const r of out.normalized) {
      expect(r.tier).toBe('T1');
      expect(r.provenance).toBeTruthy();
    }
  });
});

describe('end-to-end goals/tasks pipeline: land -> ... -> project+propagate (outbox)', () => {
  it('runs all five stages and propagates a goal/task event per record (pg-mem)', async () => {
    const { store } = await makePgMemStore();
    const odeps = makeDeps(store);
    const writer = new OutboxWriter(odeps);

    const result = await runPipeline(
      goalTaskAdapter,
      { source: goalTaskAdapter.source, format: 'fhir-json', payload: goalTask.payload },
      deps,
      { writer },
    );

    expect(result.loadReconciliation).toMatchObject({ countIn: 4, loaded: 4, balanced: true });
    expect(result.quarantined).toHaveLength(1); // the coding-less goal
    expect(result.affectedMembers).toHaveLength(2); // GT-MEM-01, GT-MEM-02
    expect(odeps.publisher.events).toHaveLength(4);
    const types = odeps.publisher.events.map((e) => e.eventType).sort();
    expect(types).toEqual(['goal.recorded', 'goal.recorded', 'task.recorded', 'task.recorded']);
    for (const e of odeps.publisher.events) {
      expect(e.class).toBe('batch');
      expect(e.source.tier).toBe('T1');
      expect(e.partitionKey).toBe(e.memberId);
    }
  });
});
