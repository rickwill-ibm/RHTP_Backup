import { describe, it, expect } from 'vitest';
import { createRuntime, type ProposedAction } from '@/lib/agentRuntime';
import { proposingWorkflow, testReviewer, waitFor } from './helpers';

/** The seeded reviewer of record. A signal now carries a real qualification proof, not a name. */
const REVIEWER = 'Practitioner/dev';

const ACTION: ProposedAction = { actionType: 'send-outreach', priority: 'high' };

describe('per-member ordering under concurrent signals (L4, memberId partition)', () => {
  it('serializes decisions for one member: each approved is immediately paired with its executed', async () => {
    const { engine, eventSink } = createRuntime();
    const N = 6;
    const handles = Array.from({ length: N }, () =>
      engine.start(proposingWorkflow('outreach-agent', ACTION), {
        memberId: 'm1',
        input: undefined,
      })
    );
    await waitFor(
      () => handles.every((h) => engine.query(h.workflowId)?.status === 'waiting-decision'),
      'all suspended'
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
          decidedBy: REVIEWER,
          reviewer: testReviewer(),
        })
      )
    );
    await Promise.all(handles.map((h) => h.done));

    // The member lock serializes: for every approved event, the very next event is its OWN
    // settle (same proposalId) — no interleaving across concurrent signals.
    //
    // `settled` replaced `executed` in W8 (register G-002) and made this test meaningful rather
    // than tautological: `executed` was emitted in the same synchronous block as `approved`, so
    // their adjacency was guaranteed by construction. `settled` fires after the workflow body
    // resumes and returns, so adjacency now genuinely proves the lock holds across the await.
    const events = eventSink.forMember('m1');
    const decisionEvents = events.filter(
      (e) => e.eventType === 'agent.task.approved' || e.eventType === 'agent.task.settled'
    );
    expect(decisionEvents).toHaveLength(2 * N);
    for (let i = 0; i < decisionEvents.length; i += 2) {
      expect(decisionEvents[i].eventType).toBe('agent.task.approved');
      expect(decisionEvents[i + 1].eventType).toBe('agent.task.settled');
      expect(decisionEvents[i + 1].proposalId).toBe(decisionEvents[i].proposalId);
    }
  });

  it('different members are independent (both complete)', async () => {
    const { engine } = createRuntime();
    const a = engine.start(proposingWorkflow('outreach-agent', ACTION), {
      memberId: 'mA',
      input: undefined,
    });
    const b = engine.start(proposingWorkflow('outreach-agent', ACTION), {
      memberId: 'mB',
      input: undefined,
    });
    await waitFor(
      () =>
        engine.query(a.workflowId)?.status === 'waiting-decision' &&
        engine.query(b.workflowId)?.status === 'waiting-decision'
    );
    await Promise.all([
      engine.signal(a.workflowId, {
        name: 'agent.task.approved',
        proposalId: engine.query(a.workflowId)!.awaitingProposalId!,
        decidedBy: REVIEWER,
        reviewer: testReviewer(),
      }),
      engine.signal(b.workflowId, {
        name: 'agent.task.rejected',
        proposalId: engine.query(b.workflowId)!.awaitingProposalId!,
        decidedBy: REVIEWER,
        reviewer: testReviewer(),
      }),
    ]);
    expect(await a.done).toBe('approved');
    expect(await b.done).toBe('rejected');
  });
});
