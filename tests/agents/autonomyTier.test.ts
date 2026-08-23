import { describe, it, expect } from 'vitest';
import { type ProposedAction } from '@/lib/agentRuntime';
import { proposingWorkflow, registryWithTier, runtimeWithRegistry, waitFor, flush } from './helpers';

const ACTION: ProposedAction = { actionType: 'send-outreach', priority: 'high' };

describe('autonomy tier is READ from the manifest, never branched (§10.5)', () => {
  it('HITL (shipped) suspends and requires a human signal', async () => {
    const { engine, eventSink } = runtimeWithRegistry(registryWithTier('outreach-agent', 'HITL'));
    const handle = engine.start(proposingWorkflow('outreach-agent', ACTION), {
      memberId: 'm1',
      input: undefined,
    });
    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision');
    await flush();
    // No auto-execution: still waiting, no executed event.
    expect(engine.query(handle.workflowId)?.status).toBe('waiting-decision');
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(0);
  });

  it('flipping the SAME agent manifest to autonomous auto-approves — NO code change', async () => {
    // Only the data (the manifest tier) changed between this run and the one above.
    const { engine, eventSink } = runtimeWithRegistry(registryWithTier('outreach-agent', 'autonomous'));
    const handle = engine.start(proposingWorkflow('outreach-agent', ACTION), {
      memberId: 'm1',
      input: undefined,
    });
    const result = await handle.done;
    expect(result).toBe('approved');
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(1);
    // Auto-approval is attributed to the tier, not a human.
    expect(eventSink.ofType('agent.task.approved')[0].payload.decidedBy).toBe('autonomy:autonomous');
  });

  it('HOTL auto-approves after the SLA review window unless rejected first', async () => {
    const { engine, eventSink, clock } = runtimeWithRegistry(registryWithTier('outreach-agent', 'HOTL'));
    const handle = engine.start(proposingWorkflow('outreach-agent', ACTION), {
      memberId: 'm1',
      input: undefined,
    });
    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision');
    // Before the window: still waiting.
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(0);
    // high tier SLA is 24h; advance past it -> auto-approve.
    await engine.advanceTime(25 * 3600_000);
    expect(await handle.done).toBe('approved');
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(1);
    expect(clock.now()).toBeGreaterThan(0);
  });
});
