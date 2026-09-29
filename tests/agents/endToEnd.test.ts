import { describe, it, expect } from 'vitest';
import { loadDemoBatch, runRealDemo } from '@/lib/sde';
import { routeBatch, runDispatch } from '@/lib/agents/dispatch';
import { createRuntime, waitFor, approve, seededDisclosure } from './helpers';

/**
 * The decide -> act loop, end to end, from a SEEDED signal (nothing hardcoded):
 * SDE folds the seeded batch and approves a coordinated touchpoint -> the dispatcher
 * routes it to the outreach agent -> the agent proposes and waits at the HITL work
 * queue -> a human approves -> an executed event is emitted.
 */
describe('SDE -> dispatcher -> agent -> HITL -> execute (seeded, deterministic)', () => {
  it('reproduces the loop from the seeded SDE demo batch', async () => {
    // 1. SDE decides: the seeded batch folds into an approved coordinated touchpoint.
    const demo = loadDemoBatch();
    const batch = runRealDemo();
    expect(batch.summary.touchpoints).toBe(1); // a touchpoint was approved, from policy
    // 6 since sig-10, the 42 CFR Part 2 signal, joined the seeded batch so the
    // disclosure gate is exercised on real data rather than only in fixtures.
    // 6 -> 7 (W7.5d): the member's stated channel preference now wins over the taxonomy default, so
    // the behavioral.window signal is no longer moved onto sms against their choice and then caught
    // by the sms quiet-hours window. See tests/sde/dispositionEngine.test.ts for the full re-walk.
    expect(batch.summary.approved).toBe(7);
    const seededTouchpointId = batch.touchpoints[0].touchpointId; // derived, not a literal

    // 2. Dispatch: route the batch; find the outreach task for the touchpoint.
    const tasks = routeBatch({
      batch,
      memberContext: demo.memberContext,
      signals: demo.signals,
      disclosure: seededDisclosure(demo.nowMs),
    });
    const outreach = tasks.find((t) => t.taskKind === 'outreach');
    expect(outreach?.task.touchpoint.touchpointId).toBe(seededTouchpointId);

    // 3. Run on the runtime (injected ManualClock via createRuntime) and dispatch.
    const { engine, eventSink } = createRuntime();
    const handles = runDispatch(engine, tasks);
    const outreachHandle = handles[tasks.indexOf(outreach!)];

    // 4. The agent proposed and is waiting at the HITL work queue (not yet executed).
    await waitFor(() => engine.query(outreachHandle.workflowId)?.status === 'waiting-decision');
    const proposed = eventSink
      .ofType('agent.task.proposed')
      .find((e) => e.agentId === 'outreach-agent');
    expect(proposed).toBeDefined();
    expect(proposed!.payload.refs).toMatchObject({ touchpoint: seededTouchpointId });
    expect(
      eventSink.ofType('agent.task.settled').filter((e) => e.agentId === 'outreach-agent')
    ).toHaveLength(0);

    // 5. A human approves -> executed.
    await approve(engine, outreachHandle.workflowId, 'Practitioner/dev');
    const result = (await outreachHandle.done) as { outcome: string };
    expect(result.outcome).toBe('executed');
    // The settle event carries what the workflow REPORTED — here `executed`, the outreach
    // agent's own terminal. That is the substance of G-002: the durable record now says what
    // happened rather than asserting an effect at approval time.
    const executed = eventSink
      .ofType('agent.task.settled')
      .filter((e) => e.agentId === 'outreach-agent');
    expect(executed).toHaveLength(1);
    expect(executed[0].payload.outcome).toBe('executed');
    expect(executed[0].memberId).toBe(demo.memberId);
  });
});
