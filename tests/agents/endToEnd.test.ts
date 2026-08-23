import { describe, it, expect } from 'vitest';
import { loadDemoBatch, runRealDemo } from '@/lib/sde';
import { routeBatch, runDispatch } from '@/lib/agents/dispatch';
import { createRuntime, waitFor, approve } from './helpers';

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
    expect(batch.summary.approved).toBe(5);
    const seededTouchpointId = batch.touchpoints[0].touchpointId; // derived, not a literal

    // 2. Dispatch: route the batch; find the outreach task for the touchpoint.
    const tasks = routeBatch({ batch, memberContext: demo.memberContext, signals: demo.signals });
    const outreach = tasks.find((t) => t.taskKind === 'outreach');
    expect(outreach?.task.touchpoint.touchpointId).toBe(seededTouchpointId);

    // 3. Run on the runtime (injected ManualClock via createRuntime) and dispatch.
    const { engine, eventSink } = createRuntime();
    const handles = runDispatch(engine, tasks);
    const outreachHandle = handles[tasks.indexOf(outreach!)];

    // 4. The agent proposed and is waiting at the HITL work queue (not yet executed).
    await waitFor(() => engine.query(outreachHandle.workflowId)?.status === 'waiting-decision');
    const proposed = eventSink.ofType('agent.task.proposed').find((e) => e.agentId === 'outreach-agent');
    expect(proposed).toBeDefined();
    expect(proposed!.payload.refs).toMatchObject({ touchpoint: seededTouchpointId });
    expect(
      eventSink.ofType('agent.task.executed').filter((e) => e.agentId === 'outreach-agent'),
    ).toHaveLength(0);

    // 5. A human approves -> executed.
    await approve(engine, outreachHandle.workflowId, 'reviewer:rn-7');
    const result = (await outreachHandle.done) as { outcome: string };
    expect(result.outcome).toBe('executed');
    const executed = eventSink.ofType('agent.task.executed').filter((e) => e.agentId === 'outreach-agent');
    expect(executed).toHaveLength(1);
    expect(executed[0].memberId).toBe(demo.memberId);
  });
});
