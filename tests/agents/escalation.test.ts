import { describe, it, expect } from 'vitest';
import { createRuntime, loadEscalationPolicies, parseEscalationPolicies, getEscalationTier, nextEscalationStep, EscalationPolicyError, type ProposedAction } from '@/lib/agentRuntime';
import { proposingWorkflow, waitFor, HOUR } from './helpers';

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

    await engine.advanceTime(4 * HOUR); // hierarchy exhausted -> park
    const parked = eventSink.ofType('agent.task.escalated').at(-1)!;
    expect(parked.payload.parked).toBe(true);
    expect(parked.payload.auditedHops).toEqual([
      'assigned-reviewer',
      'care-team-lead',
      'clinical-supervisor',
    ]);
    // Never silently expired: the workflow is still waiting (re-activatable), not failed.
    expect(engine.query(handle.workflowId)?.status).toBe('waiting-decision');
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(0);
  });

  it('a human decision before the SLA cancels escalation', async () => {
    const { engine, eventSink } = createRuntime();
    const handle = engine.start(proposingWorkflow('outreach-agent', URGENT), {
      memberId: 'm2',
      input: undefined,
    });
    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision');
    const proposalId = engine.query(handle.workflowId)!.awaitingProposalId!;
    await engine.signal(handle.workflowId, { name: 'agent.task.approved', proposalId, decidedBy: 'rn' });
    await handle.done;
    await engine.advanceTime(100 * HOUR); // timers should be cancelled
    expect(eventSink.ofType('agent.task.escalated')).toHaveLength(0);
  });

  it('policy data validates: default set covers every priority; malformed refuses loudly', () => {
    const policies = loadEscalationPolicies();
    expect(getEscalationTier(policies, 'default', 'urgent').slaHours).toBe(4);
    expect(nextEscalationStep(getEscalationTier(policies, 'default', 'routine'), 1).kind).toBe('park');
    expect(() => parseEscalationPolicies({ version: '1', policies: {} })).not.toThrow();
    expect(() =>
      parseEscalationPolicies({
        version: '1',
        policies: { default: { tiers: [{ priority: 'urgent', slaHours: 4, hierarchy: ['x'], onExhaust: 'park' }] } },
      }),
    ).toThrow(EscalationPolicyError); // missing high + routine tiers
  });
});
