import { describe, it, expect } from 'vitest';
import { createRuntime, type ProposedAction } from '@/lib/agentRuntime';
import { flush, proposingWorkflow, waitFor } from './helpers';

const ACTION: ProposedAction = {
  actionType: 'send-outreach',
  priority: 'high',
  refs: { touchpoint: 'tp-1' },
  summary: 'A1c overdue outreach',
};

describe('HITL proposeAndWait (suspend / resume)', () => {
  it('suspends on propose, then resumes on approval; emits proposed + approved + executed', async () => {
    const { engine, eventSink, inbox } = createRuntime();
    const handle = engine.start(proposingWorkflow('outreach-agent', ACTION), {
      memberId: 'm1',
      input: undefined,
    });

    // Suspended: proposed event out, work-queue item created, awaiting a decision.
    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision', 'suspended');
    const snap = engine.query(handle.workflowId)!;
    expect(snap.awaitingProposalId).toBeDefined();
    expect(eventSink.ofType('agent.task.proposed')).toHaveLength(1);
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(0); // NOT executed yet
    const pending = await inbox.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0].item.queue).toBe('agent-proposal');

    // Human approves -> resumes, emits approved then executed, resolves the workflow.
    const proposalId = snap.awaitingProposalId!;
    await engine.signal(handle.workflowId, {
      name: 'agent.task.approved',
      proposalId,
      decidedBy: 'reviewer:rn-7',
    });
    const result = await handle.done;
    expect(result).toBe('approved');
    expect(eventSink.ofType('agent.task.approved')).toHaveLength(1);
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(1);
    expect((await inbox.get(proposalId))?.status).toBe('approved');
    // Event order: proposed -> approved -> executed.
    expect(eventSink.events.map((e) => e.eventType)).toEqual([
      'agent.task.proposed',
      'agent.task.approved',
      'agent.task.executed',
    ]);
  });

  it('rejection path: emits rejected, NO executed, workflow resolves rejected', async () => {
    const { engine, eventSink } = createRuntime();
    const handle = engine.start(proposingWorkflow('outreach-agent', ACTION), {
      memberId: 'm2',
      input: undefined,
    });
    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision');
    const proposalId = engine.query(handle.workflowId)!.awaitingProposalId!;

    await engine.signal(handle.workflowId, {
      name: 'agent.task.rejected',
      proposalId,
      decidedBy: 'reviewer:rn-7',
    });
    expect(await handle.done).toBe('rejected');
    expect(eventSink.ofType('agent.task.rejected')).toHaveLength(1);
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(0);
  });

  it('a stale / duplicate decision signal is idempotent (no double resume)', async () => {
    const { engine, eventSink } = createRuntime();
    const handle = engine.start(proposingWorkflow('outreach-agent', ACTION), {
      memberId: 'm3',
      input: undefined,
    });
    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision');
    const proposalId = engine.query(handle.workflowId)!.awaitingProposalId!;
    const sig = { name: 'agent.task.approved' as const, proposalId, decidedBy: 'rn' };
    await engine.signal(handle.workflowId, sig);
    await engine.signal(handle.workflowId, sig); // duplicate: ignored
    await handle.done;
    await flush();
    expect(eventSink.ofType('agent.task.approved')).toHaveLength(1);
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(1);
  });
});
