import { describe, it, expect } from 'vitest';
import { createOutreachWorkflow, type OutreachTask } from '@/lib/agents/outreach';
import type { MemberContext, Touchpoint } from '@/lib/sde';
import { createRuntime, waitFor, flush, approve, reject } from './helpers';

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
  return { touchpoint: TOUCHPOINT, memberContext, consentScope: 'care-outreach', priority: 'high' };
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

    await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision', 'suspended');
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
      decidedBy: 'reviewer:rn-7',
    });
    // The send happened only after approval; executed event emitted.
    expect(sent).toEqual(['tp-1']);
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(1);
  });

  it('rejects: no send, no executed event, workflow resolves rejected', async () => {
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
    expect(sent).toHaveLength(0);
    expect(eventSink.ofType('agent.task.executed')).toHaveLength(0);
    expect(eventSink.ofType('agent.task.rejected')).toHaveLength(1);
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
    expect(result).toEqual({ outcome: 'suppressed', touchpointId: 'tp-1', reason: 'consent-absent' });
    // Suppressed with reason: NO proposal, NO work item, NO send, NO events.
    expect(sent).toHaveLength(0);
    expect(eventSink.events).toHaveLength(0);
    expect(await inbox.pending()).toHaveLength(0);
  });
});
