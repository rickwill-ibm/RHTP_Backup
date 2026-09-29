import { describe, it, expect } from 'vitest';
import {
  createRuntime,
  loadEscalationPolicies,
  parseEscalationPolicies,
  getEscalationTier,
  nextEscalationStep,
  EscalationPolicyError,
  WorkflowTerminatedError,
  type ProposedAction,
} from '@/lib/agentRuntime';
import { proposingWorkflow, testReviewer, waitFor, HOUR } from './helpers';

/** The seeded reviewer of record. A signal now carries a real qualification proof, not a name. */
const REVIEWER = 'Practitioner/dev';

const URGENT: ProposedAction = { actionType: 'send-outreach', priority: 'urgent' };

describe('escalation-as-data (SLA -> hierarchy -> park, never silent)', () => {
  it('fires SLA timers, walks the hierarchy, then parks with audit', async () => {
    const { engine, eventSink, inbox } = createRuntime();
    const handle = engine.start(proposingWorkflow('outreach-agent', URGENT), {
      memberId: 'm1',
      input: undefined,
    });
    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision');

    // urgent tier: slaHours 4, hierarchy [assigned-reviewer, care-team-lead, clinical-supervisor].
    await engine.advanceTime(4 * HOUR); // hop 0
    await engine.advanceTime(4 * HOUR); // hop 1
    await engine.advanceTime(4 * HOUR); // hop 2
    const escalations = eventSink.ofType('agent.task.escalated');
    expect(escalations.map((e) => e.payload.target)).toEqual([
      'assigned-reviewer',
      'care-team-lead',
      'clinical-supervisor',
    ]);
    // The work item moved into the 'escalated' queue.
    expect((await inbox.get(escalations[0].proposalId!))?.item.queue).toBe('escalated');

    await engine.advanceTime(4 * HOUR); // hierarchy exhausted -> ABANDONED

    // THE TERMINAL HAS ITS OWN EVENT TYPE. It used to be a FOURTH `agent.task.escalated` carrying
    // `parked: true`, on a work item still sitting at queue 'escalated' and status 'pending' — so a
    // reviewer scanning the escalated queue could not tell a live proposal from a dead one. That
    // mislabelling, not invisibility, was G-001. Pinned by count: four escalations would mean the
    // terminal had quietly gone back to being a hop.
    expect(eventSink.ofType('agent.task.escalated')).toHaveLength(3);
    const abandoned = eventSink.ofType('agent.task.abandoned');
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0].payload.auditedHops).toEqual([
      'assigned-reviewer',
      'care-team-lead',
      'clinical-supervisor',
    ]);

    // The item moved to its OWN queue and stays actionable-looking: the workflow ended, the row
    // did not vanish.
    const item = await inbox.get(abandoned[0].proposalId!);
    expect(item?.item.queue).toBe('parked');
    expect(item?.status).toBe('pending');

    // Terminated with its own status — never a synthesised approval or rejection. `rejected` would
    // be a timer-manufactured adverse benefit determination carrying 42 CFR 438.404 notice and
    // appeal duties that nothing here discharges.
    expect(engine.query(handle.workflowId)?.status).toBe('abandoned');
    expect(await handle.done).toEqual({ outcome: 'abandoned' });

    // No settle event: the body never resumed, so nothing reported an outcome. An abandonment is
    // the runtime's own record, not the workflow's.
    expect(eventSink.ofType('agent.task.settled')).toHaveLength(0);
  });

  it('a decision arriving AFTER abandonment is refused loudly, never resumes the body', async () => {
    // The pending record outlives the terminated workflow so the parked row stays queryable. It is
    // NOT a re-activation path, and the difference is load-bearing: the workflow body is still
    // suspended on its decided-promise, so resolving the record would run its `useTool` effect
    // after the runtime declared the work abandoned — and `settle()` early-returns on an already
    // settled instance, so that effect would never reach the event stream at all.
    const { engine, eventSink, inbox } = createRuntime();
    const handle = engine.start(proposingWorkflow('outreach-agent', URGENT), {
      memberId: 'm5',
      input: undefined,
    });
    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision');
    const proposalId = engine.query(handle.workflowId)!.awaitingProposalId!;
    // Each hop arms the NEXT timer at now+SLA, so the ladder is walked one window at a time.
    for (let i = 0; i < 4; i++) await engine.advanceTime(4 * HOUR); // 3 hops + the terminal
    expect(engine.query(handle.workflowId)?.status).toBe('abandoned');

    await expect(
      engine.signal(handle.workflowId, {
        name: 'agent.task.approved',
        proposalId,
        decidedBy: REVIEWER,
        reviewer: testReviewer(),
      })
    ).rejects.toThrow(WorkflowTerminatedError);

    // Nothing moved: no approval on the record, the row still parked and pending, status terminal.
    expect(eventSink.ofType('agent.task.approved')).toHaveLength(0);
    const item = await inbox.get(proposalId);
    expect(item?.item.queue).toBe('parked');
    expect(item?.status).toBe('pending');
    expect(engine.query(handle.workflowId)?.status).toBe('abandoned');
  });

  it('a human decision before the SLA cancels escalation', async () => {
    const { engine, eventSink } = createRuntime();
    const handle = engine.start(proposingWorkflow('outreach-agent', URGENT), {
      memberId: 'm2',
      input: undefined,
    });
    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision');
    const proposalId = engine.query(handle.workflowId)!.awaitingProposalId!;
    await engine.signal(handle.workflowId, {
      name: 'agent.task.approved',
      proposalId,
      decidedBy: REVIEWER,
      reviewer: testReviewer(),
    });
    await handle.done;
    await engine.advanceTime(100 * HOUR); // timers should be cancelled
    expect(eventSink.ofType('agent.task.escalated')).toHaveLength(0);
  });

  it('policy data validates: default set covers every priority; malformed refuses loudly', () => {
    const policies = loadEscalationPolicies();
    expect(getEscalationTier(policies, 'default', 'urgent').slaHours).toBe(4);
    expect(nextEscalationStep(getEscalationTier(policies, 'default', 'routine'), 1).kind).toBe(
      'park'
    );
    expect(() => parseEscalationPolicies({ version: '1', policies: {} })).not.toThrow();
    expect(() =>
      parseEscalationPolicies({
        version: '1',
        policies: {
          default: {
            tiers: [{ priority: 'urgent', slaHours: 4, hierarchy: ['x'], onExhaust: 'park' }],
          },
        },
      })
    ).toThrow(EscalationPolicyError); // missing high + routine tiers
  });
});
