import { describe, it, expect } from 'vitest';
import {
  createRuntime,
  createMemoryEventSink,
  buildAgentEvent,
  UnallowedAgentEventError,
  type ProposedAction,
} from '@/lib/agentRuntime';
import { proposingWorkflow, waitFor, flush } from './helpers';

const SUBMIT_PA: ProposedAction = {
  actionType: 'submit-pa',
  priority: 'high',
  refs: { thread: 'th-1' },
};

describe('AI guardrail: the runtime never sets an authoritative state', () => {
  it('an HITL PA proposal cannot execute without a human approval (the state machine gates)', async () => {
    const { engine, eventSink } = createRuntime();
    const handle = engine.start(proposingWorkflow('pa-documentation-agent', SUBMIT_PA), {
      memberId: 'm1',
      input: undefined,
    });
    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision');
    await flush();
    // No amount of waiting produces an executed action: the runtime only PROPOSES.
    expect(engine.query(handle.workflowId)?.status).toBe('waiting-decision');
    expect(eventSink.ofType('agent.task.settled')).toHaveLength(0);
    expect(eventSink.ofType('agent.task.proposed')).toHaveLength(1);
  });

  it('the engine exposes NO API to set an authoritative domain state', () => {
    const { engine } = createRuntime();
    // The only surface is the WorkflowEngine contract + the test-time clock driver.
    expect((engine as unknown as Record<string, unknown>).setState).toBeUndefined();
    expect((engine as unknown as Record<string, unknown>).approve).toBeUndefined();
    expect(typeof engine.start).toBe('function');
    expect(typeof engine.signal).toBe('function');
    expect(typeof engine.query).toBe('function');
  });

  it('emits ONLY the pre-allocated C2 event types', async () => {
    const sink = createMemoryEventSink();
    expect(() =>
      buildAgentEvent({
        eventType: 'pa.approved' as never,
        memberId: 'm1',
        workflowId: 'w1',
        agentId: 'pa-documentation-agent',
        occurredAtMs: 0,
        correlationId: 'c',
        proposalId: 'p',
      })
    ).toThrow(UnallowedAgentEventError);
    await expect(
      sink.emit({
        eventType: 'pa.approved' as never,
        memberId: 'm1',
        partitionKey: 'm1',
        workflowId: 'w1',
        agentId: 'a',
        occurredAtMs: 0,
        correlationId: 'c',
        payload: {},
      })
    ).rejects.toBeInstanceOf(UnallowedAgentEventError);
  });
});
