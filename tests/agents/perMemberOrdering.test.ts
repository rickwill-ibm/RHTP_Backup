import { describe, it, expect } from 'vitest';
import { createRuntime, type ProposedAction } from '@/lib/agentRuntime';
import { proposingWorkflow, waitFor } from './helpers';

const ACTION: ProposedAction = { actionType: 'send-outreach', priority: 'high' };

describe('per-member ordering under concurrent signals (L4, memberId partition)', () => {
  it('serializes decisions for one member: each approved is immediately paired with its executed', async () => {
    const { engine, eventSink } = createRuntime();
    const N = 6;
    const handles = Array.from({ length: N }, () =>
      engine.start(proposingWorkflow('outreach-agent', ACTION), { memberId: 'm1', input: undefined }),
    );
    await waitFor(
      () => handles.every((h) => engine.query(h.workflowId)?.status === 'waiting-decision'),
      'all suspended',
    );
    const proposals = handles.map((h) => ({
      workflowId: h.workflowId,
      proposalId: engine.query(h.workflowId)!.awaitingProposalId!,
    }));

    // Fire ALL decisions concurrently, in a non-sorted order, without awaiting between.
    const order = [3, 0, 5, 1, 4, 2];
    await Promise.all(
      order.map((i) =>
        engine.signal(proposals[i].workflowId, {
          name: 'agent.task.approved',
          proposalId: proposals[i].proposalId,
          decidedBy: `rn-${i}`,
        }),
      ),
    );
    await Promise.all(handles.map((h) => h.done));

    // The member lock serializes: for every approved event, the very next event is
    // its OWN executed (same proposalId) — no interleaving across concurrent signals.
    const events = eventSink.forMember('m1');
    const decisionEvents = events.filter(
      (e) => e.eventType === 'agent.task.approved' || e.eventType === 'agent.task.executed',
    );
    expect(decisionEvents).toHaveLength(2 * N);
    for (let i = 0; i < decisionEvents.length; i += 2) {
      expect(decisionEvents[i].eventType).toBe('agent.task.approved');
      expect(decisionEvents[i + 1].eventType).toBe('agent.task.executed');
      expect(decisionEvents[i + 1].proposalId).toBe(decisionEvents[i].proposalId);
    }
  });

  it('different members are independent (both complete)', async () => {
    const { engine } = createRuntime();
    const a = engine.start(proposingWorkflow('outreach-agent', ACTION), { memberId: 'mA', input: undefined });
    const b = engine.start(proposingWorkflow('outreach-agent', ACTION), { memberId: 'mB', input: undefined });
    await waitFor(
      () =>
        engine.query(a.workflowId)?.status === 'waiting-decision' &&
        engine.query(b.workflowId)?.status === 'waiting-decision',
    );
    await Promise.all([
      engine.signal(a.workflowId, {
        name: 'agent.task.approved',
        proposalId: engine.query(a.workflowId)!.awaitingProposalId!,
        decidedBy: 'rn',
      }),
      engine.signal(b.workflowId, {
        name: 'agent.task.rejected',
        proposalId: engine.query(b.workflowId)!.awaitingProposalId!,
        decidedBy: 'rn',
      }),
    ]);
    expect(await a.done).toBe('approved');
    expect(await b.done).toBe('rejected');
  });
});
