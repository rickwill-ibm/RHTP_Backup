import { describe, it, expect } from 'vitest';
import { createOutreachWorkflow, type OutreachTask } from '@/lib/agents/outreach';
import type { MemberContext, Touchpoint } from '@/lib/sde';
import { createRuntime, waitFor, flush, approve, reject, disclosedForTest } from './helpers';

const TOUCHPOINT: Touchpoint = {
  touchpointId: 'tp-1',
  memberId: 'm1',
  channel: 'portal',
  intents: [
    { signalId: 'sig-1', kind: 'care-gap.opened', priorityScore: 9, channel: 'portal' },
    { signalId: 'sig-2', kind: 'care-gap.opened', priorityScore: 6, channel: 'portal' },
  ],
};

const GRANTED: MemberContext = { memberId: 'm1', consentScopesGranted: ['care-outreach'] };
const NO_CONSENT: MemberContext = { memberId: 'm1', consentScopesGranted: [] };

function task(memberContext: MemberContext): OutreachTask {
  return {
    touchpoint: disclosedForTest(TOUCHPOINT),
    memberContext,
    consentScope: 'care-outreach',
    priority: 'high',
  };
}

describe('outreach agent (consume SDE touchpoint -> HITL -> send)', () => {
  it('proposes and waits, then executes the send on approval', async () => {
    const sent: string[] = [];
    const wf = createOutreachWorkflow({
      async send(_a, t) {
        sent.push(t.touchpoint.touchpointId);
        return { ref: `send::${t.touchpoint.touchpointId}` };
      },
      consentGranted: () => true,
    });
    const { engine, eventSink, inbox } = createRuntime();
    const handle = engine.start(wf, { memberId: 'm1', input: task(GRANTED) });

    await waitFor(
      () => engine.query(handle.workflowId)?.status === 'waiting-decision',
      'suspended'
    );
    // Suspended at the work queue; proposed but NOT yet sent.
    expect(eventSink.ofType('agent.task.proposed')).toHaveLength(1);
    expect(sent).toHaveLength(0);
    expect((await inbox.pending())[0].item.queue).toBe('agent-proposal');

    await approve(engine, handle.workflowId);
    const result = await handle.done;
    expect(result).toEqual({
      outcome: 'executed',
      touchpointId: 'tp-1',
      channel: 'portal',
      sendRef: 'send::tp-1',
      decidedBy: 'Practitioner/dev',
    });
    // The send happened only after approval; executed event emitted.
    expect(sent).toEqual(['tp-1']);
    expect(eventSink.ofType('agent.task.settled')).toHaveLength(1);
  });

  it('rejects: no send, and the settle event RECORDS the non-execution', async () => {
    const sent: string[] = [];
    const wf = createOutreachWorkflow({
      async send(_a, t) {
        sent.push(t.touchpoint.touchpointId);
        return { ref: 'x' };
      },
      consentGranted: () => true,
    });
    const { engine, eventSink } = createRuntime();
    const handle = engine.start(wf, { memberId: 'm1', input: task(GRANTED) });
    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision');
    await reject(engine, handle.workflowId);
    const result = await handle.done;
    expect(result.outcome).toBe('rejected');
    // NO SEND is the effect assertion, and it is the one that matters — the engine performs no
    // effects, so only this can show the outreach did not go out.
    expect(sent).toHaveLength(0);
    // A rejection SETTLES. The old assertion was "no agent.task.executed"; renaming it to "no
    // settled" would assert the opposite of the design. The truthful record is the settle event's
    // OUTCOME, copied verbatim from what the workflow reported.
    const settled = eventSink.ofType('agent.task.settled');
    expect(settled).toHaveLength(1);
    expect(settled[0].payload.outcome).toBe('rejected');
    expect(eventSink.ofType('agent.task.rejected')).toHaveLength(1);
    // The approval-side pair: no approval was emitted, so no `effectPending` is left open.
    expect(eventSink.ofType('agent.task.approved')).toHaveLength(0);
  });

  it('consent-suppressed: no consent scope -> suppress-with-reason, never proposes or sends', async () => {
    const sent: string[] = [];
    // Uses the real SDE consent seam by default (no scope granted -> not allowed).
    const wf = createOutreachWorkflow({
      async send(_a, t) {
        sent.push(t.touchpoint.touchpointId);
        return { ref: 'x' };
      },
      // Explicit: the member has not granted the scope.
      consentGranted: (_m, _s, ctx) => (ctx.consentScopesGranted ?? []).includes('care-outreach'),
    });
    const { engine, eventSink, inbox } = createRuntime();
    const handle = engine.start(wf, { memberId: 'm1', input: task(NO_CONSENT) });

    const result = await handle.done;
    await flush();
    expect(result).toEqual({
      outcome: 'suppressed',
      touchpointId: 'tp-1',
      reason: 'consent-absent',
    });
    // Suppressed with reason: NO proposal, NO work item, NO send.
    expect(sent).toHaveLength(0);
    expect(await inbox.pending()).toHaveLength(0);
    expect(eventSink.ofType('agent.task.proposed')).toHaveLength(0);

    // BUT NOT NO EVENTS — this test used to assert total silence, and silence is exactly what a
    // workflow that never ran looks like. A suppression is a decision about a member and belongs on
    // the record, so the settle event carries it.
    expect(eventSink.events).toHaveLength(1);
    const settled = eventSink.ofType('agent.task.settled');
    expect(settled).toHaveLength(1);
    expect(settled[0].payload.outcome).toBe('suppressed');
    // And it carries NO proposalId, because nothing was proposed. Filling that field with the
    // workflowId would make every suppression join to a proposal that never existed.
    expect(settled[0].proposalId).toBeUndefined();
  });
});
