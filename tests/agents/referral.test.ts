import { describe, it, expect } from 'vitest';
import { createReferralWorkflow, type ReferralTask } from '@/lib/agents/referral';
import { createRuntime, waitFor, approve, reject, HOUR } from './helpers';

const STALLED: ReferralTask = {
  referralRef: 'ServiceRequest/ref-12',
  priority: 'urgent',
  knownState: 'stalled',
};

describe('referral coordination agent (open/track -> HITL -> escalate on stall)', () => {
  it('proposes HITL, then executes on approval', async () => {
    const { engine, eventSink } = createRuntime();
    const handle = engine.start(createReferralWorkflow(), { memberId: 'm1', input: STALLED });
    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision');
    expect(eventSink.ofType('agent.task.proposed')).toHaveLength(1);
    await approve(engine, handle.workflowId);
    const result = await handle.done;
    expect(result).toMatchObject({ outcome: 'executed', referralRef: 'ServiceRequest/ref-12' });
    expect(eventSink.ofType('agent.task.settled')).toHaveLength(1);
  });

  it('rejects on rejection (no executed)', async () => {
    const { engine, eventSink } = createRuntime();
    const handle = engine.start(createReferralWorkflow(), { memberId: 'm2', input: STALLED });
    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision');
    await reject(engine, handle.workflowId);
    expect((await handle.done).outcome).toBe('rejected');
    // A rejection SETTLES — the workflow ran to a terminal, it simply did not execute. The old
    // assertion here was "no agent.task.executed", and mechanically renaming it to "no settled"
    // asserted the opposite of the design: the truthful record is the settle event's OUTCOME.
    const settled = eventSink.ofType('agent.task.settled');
    expect(settled).toHaveLength(1);
    expect(settled[0].payload.outcome).toBe('rejected');
    expect(settled[0].payload.status).toBe('completed');
  });

  it('a stall walks the SLA -> care-team hierarchy -> park (never silently expires)', async () => {
    const { engine, eventSink, inbox } = createRuntime();
    const handle = engine.start(createReferralWorkflow(), { memberId: 'm3', input: STALLED });
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
    expect((await inbox.get(escalations[0].proposalId!))?.item.queue).toBe('escalated');

    await engine.advanceTime(4 * HOUR); // hierarchy exhausted -> ABANDONED
    expect(eventSink.ofType('agent.task.escalated')).toHaveLength(3); // not a fourth hop
    const abandoned = eventSink.ofType('agent.task.abandoned');
    expect(abandoned).toHaveLength(1);
    // Abandoned with audit: its own queue, its own workflow status, and NO referral write — the
    // body never resumed, so `useTool` was never reached.
    expect((await inbox.get(abandoned[0].proposalId!))?.item.queue).toBe('parked');
    expect(engine.query(handle.workflowId)?.status).toBe('abandoned');
    expect(await handle.done).toEqual({ outcome: 'abandoned' });
    expect(eventSink.ofType('agent.task.settled')).toHaveLength(0);
  });

  it('a completed referral resolves with no action (no proposal)', async () => {
    const { engine, eventSink } = createRuntime();
    const handle = engine.start(createReferralWorkflow(), {
      memberId: 'm4',
      input: { referralRef: 'ServiceRequest/ref-99', priority: 'high', knownState: 'completed' },
    });
    const result = await handle.done;
    expect(result).toEqual({ outcome: 'resolved-no-action', referralRef: 'ServiceRequest/ref-99' });
    expect(eventSink.ofType('agent.task.proposed')).toHaveLength(0);
  });
});
