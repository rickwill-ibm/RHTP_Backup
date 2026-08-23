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
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(1);
  });

  it('rejects on rejection (no executed)', async () => {
    const { engine, eventSink } = createRuntime();
    const handle = engine.start(createReferralWorkflow(), { memberId: 'm2', input: STALLED });
    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision');
    await reject(engine, handle.workflowId);
    expect((await handle.done).outcome).toBe('rejected');
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(0);
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

    await engine.advanceTime(4 * HOUR); // hierarchy exhausted -> park
    const parked = eventSink.ofType('agent.task.escalated').at(-1)!;
    expect(parked.payload.parked).toBe(true);
    // Parked with audit and re-activatable: still waiting, never failed/expired/executed.
    expect(engine.query(handle.workflowId)?.status).toBe('waiting-decision');
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(0);
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
