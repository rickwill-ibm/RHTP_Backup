/**
 * Per-agent AI guardrail (Iteration 3 convergence, item 4).
 *
 * The generic runtime guardrail (guardrail.test.ts) proves the ENGINE has no
 * authoritative-state API and never executes without a human signal. The PA agent
 * has its own explicit guardrail (paDocumentation.test.ts: claim-response refused).
 * This file adds the matching explicit guardrail for the OTHER two HITL agents:
 * neither outreach nor referral can produce its authoritative effect (a comms send;
 * an executed coordination action) without a human approval — not on suspend, and
 * NOT merely by the passage of time. This is the "autonomy is HITL by config, and
 * time never substitutes for the human" assertion, run against the real workflows.
 */
import { describe, it, expect } from 'vitest';
import { createOutreachWorkflow, type OutreachTask } from '@/lib/agents/outreach';
import { createReferralWorkflow, type ReferralTask } from '@/lib/agents/referral';
import type { MemberContext, Touchpoint } from '@/lib/sde';
import { createRuntime, waitFor, flush, HOUR } from './helpers';

const TOUCHPOINT: Touchpoint = {
  touchpointId: 'tp-g',
  memberId: 'm1',
  channel: 'portal',
  intents: [{ signalId: 'sig-g', kind: 'care-gap.opened', priorityScore: 9, channel: 'portal' }],
};
const GRANTED: MemberContext = { memberId: 'm1', consentScopesGranted: ['care-outreach'] };
const OUTREACH_TASK: OutreachTask = {
  touchpoint: TOUCHPOINT,
  memberContext: GRANTED,
  consentScope: 'care-outreach',
  priority: 'high',
};
const REFERRAL_TASK: ReferralTask = {
  referralRef: 'ServiceRequest/ref-g',
  priority: 'urgent',
  knownState: 'stalled',
};

describe('AI guardrail: outreach cannot send without a human approval', () => {
  it('the send effect never fires while suspended, and time alone never approves it', async () => {
    const sent: string[] = [];
    const wf = createOutreachWorkflow({
      async send(_a, t) {
        sent.push(t.touchpoint.touchpointId);
        return { ref: 'x' };
      },
      consentGranted: () => true,
    });
    const { engine, eventSink } = createRuntime();
    const handle = engine.start(wf, { memberId: 'm1', input: OUTREACH_TASK });

    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision', 'suspended');
    // Suspended at the HITL gate: proposed, but no authoritative effect.
    expect(eventSink.ofType('agent.task.proposed')).toHaveLength(1);
    expect(sent).toHaveLength(0);
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(0);

    // Let a large amount of virtual time pass with NO human signal. A HITL agent
    // must not auto-approve on time — it may only escalate; it never sends.
    await engine.advanceTime(240 * HOUR);
    await flush();
    expect(sent).toHaveLength(0);
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(0);
    expect(engine.query(handle.workflowId)?.status).toBe('waiting-decision');
  });
});

describe('AI guardrail: referral cannot execute without a human approval', () => {
  it('no executed action while suspended, and time only escalates — never approves', async () => {
    const { engine, eventSink } = createRuntime();
    const handle = engine.start(createReferralWorkflow(), { memberId: 'm2', input: REFERRAL_TASK });

    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision', 'suspended');
    expect(eventSink.ofType('agent.task.proposed')).toHaveLength(1);
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(0);

    // Walk well past every SLA hop into the park: still no executed, still waiting.
    await engine.advanceTime(240 * HOUR);
    await flush();
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(0);
    // Escalation (not execution) is the only thing time produces for a HITL agent.
    expect(eventSink.ofType('agent.task.escalated').length).toBeGreaterThan(0);
    expect(engine.query(handle.workflowId)?.status).toBe('waiting-decision');
  });
});
