import { describe, it, expect } from 'vitest';
import { createRuntime, type ProposedAction } from '@/lib/agentRuntime';
import { flush, proposingWorkflow, testReviewer, waitFor } from './helpers';

/** The seeded reviewer of record. A signal now carries a real qualification proof, not a name. */
const REVIEWER = 'Practitioner/dev';

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
    await waitFor(
      () => engine.query(handle.workflowId)?.status === 'waiting-decision',
      'suspended'
    );
    const snap = engine.query(handle.workflowId)!;
    expect(snap.awaitingProposalId).toBeDefined();
    expect(eventSink.ofType('agent.task.proposed')).toHaveLength(1);
    expect(eventSink.ofType('agent.task.settled')).toHaveLength(0); // NOT executed yet
    const pending = await inbox.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0].item.queue).toBe('agent-proposal');

    // Human approves -> resumes, emits approved then executed, resolves the workflow.
    const proposalId = snap.awaitingProposalId!;
    await engine.signal(handle.workflowId, {
      name: 'agent.task.approved',
      proposalId,
      decidedBy: REVIEWER,
      reviewer: testReviewer(),
    });
    const result = await handle.done;
    expect(result).toBe('approved');
    expect(eventSink.ofType('agent.task.approved')).toHaveLength(1);
    expect(eventSink.ofType('agent.task.settled')).toHaveLength(1);
    expect((await inbox.get(proposalId))?.status).toBe('approved');
    // Event order: proposed -> approved -> executed.
    expect(eventSink.events.map((e) => e.eventType)).toEqual([
      'agent.task.proposed',
      'agent.task.approved',
      'agent.task.settled',
    ]);
  });

  it('rejection path: emits rejected, settles with outcome `rejected`, no effect', async () => {
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
      decidedBy: REVIEWER,
      reviewer: testReviewer(),
    });
    expect(await handle.done).toBe('rejected');
    expect(eventSink.ofType('agent.task.rejected')).toHaveLength(1);
    // The workflow settled; it did not execute. Those are different claims, and collapsing them is
    // what `agent.task.executed` did.
    const settled = eventSink.ofType('agent.task.settled');
    expect(settled).toHaveLength(1);
    expect(settled[0].payload.outcome).toBe('rejected');
    expect(settled[0].payload.status).toBe('completed');
  });

  it('a stale / duplicate decision signal is idempotent (no double resume)', async () => {
    const { engine, eventSink } = createRuntime();
    const handle = engine.start(proposingWorkflow('outreach-agent', ACTION), {
      memberId: 'm3',
      input: undefined,
    });
    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision');
    const proposalId = engine.query(handle.workflowId)!.awaitingProposalId!;
    const sig = {
      name: 'agent.task.approved' as const,
      proposalId,
      decidedBy: REVIEWER,
      reviewer: testReviewer(),
    };
    await engine.signal(handle.workflowId, sig);
    await engine.signal(handle.workflowId, sig); // duplicate: ignored
    await handle.done;
    await flush();
    expect(eventSink.ofType('agent.task.approved')).toHaveLength(1);
    expect(eventSink.ofType('agent.task.settled')).toHaveLength(1);
  });
});
