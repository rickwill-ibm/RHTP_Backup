/**
 * NS-04: agent send-effects are not duplicated on an outbox at-least-once
 * republish. The outreach send and the referral coordination action are each
 * claimed exactly once via the durable idempotency store (consumer per agent),
 * so a second delivery of the same touchpoint / referral is deduped BEFORE the
 * effect fires.
 */
import { describe, it, expect } from 'vitest';
import { createOutreachWorkflow, type OutreachTask } from '@/lib/agents/outreach';
import { createReferralWorkflow, type ReferralTask } from '@/lib/agents/referral';
import type { MemberContext, Touchpoint } from '@/lib/sde';
import { createMemoryIdempotencyStore, IDEMPOTENCY_CONSUMERS } from '@/lib/idempotency';
import { createRuntime, waitFor } from './helpers';
import { approve, disclosedForTest } from './helpers';

const TOUCHPOINT: Touchpoint = {
  touchpointId: 'tp-1',
  memberId: 'm1',
  channel: 'portal',
  intents: [{ signalId: 'sig-1', kind: 'care-gap.opened', priorityScore: 9, channel: 'portal' }],
};
const GRANTED: MemberContext = { memberId: 'm1', consentScopesGranted: ['care-outreach'] };

function outreachTask(): OutreachTask {
  return {
    touchpoint: disclosedForTest(TOUCHPOINT),
    memberContext: GRANTED,
    consentScope: 'care-outreach',
    priority: 'high',
  };
}

async function runOutreach(
  idempotency: ReturnType<typeof createMemoryIdempotencyStore>,
  sent: string[]
) {
  const wf = createOutreachWorkflow({
    async send(_a, t) {
      sent.push(t.touchpoint.touchpointId);
      return { ref: `send::${t.touchpoint.touchpointId}` };
    },
    consentGranted: () => true,
    idempotency,
  });
  const { engine } = createRuntime();
  const handle = engine.start(wf, { memberId: 'm1', input: outreachTask() });
  await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision', 'suspended');
  await approve(engine, handle.workflowId);
  return handle.done;
}

describe('outreach send is not duplicated on republish (NS-04)', () => {
  it('the second delivery of the same touchpoint is deduped: exactly one send', async () => {
    const idempotency = createMemoryIdempotencyStore('t');
    const sent: string[] = [];

    const first = await runOutreach(idempotency, sent);
    expect(first.outcome).toBe('executed');
    expect(sent).toEqual(['tp-1']);

    // Republish: same touchpoint reaches the approved send path again.
    const second = await runOutreach(idempotency, sent);
    expect(second.outcome).toBe('deduped');
    expect(sent).toEqual(['tp-1']); // NO second send
    expect(await idempotency.isProcessed(IDEMPOTENCY_CONSUMERS.outreachAgent, 'tp-1')).toBe(true);
  });

  it('without an idempotency guard the effect would fire twice (proves the guard is load-bearing)', async () => {
    const sent: string[] = [];
    const wf = createOutreachWorkflow({
      async send(_a, t) {
        sent.push(t.touchpoint.touchpointId);
        return { ref: 'x' };
      },
      consentGranted: () => true,
      // no idempotency dep
    });
    for (let i = 0; i < 2; i++) {
      const { engine } = createRuntime();
      const handle = engine.start(wf, { memberId: 'm1', input: outreachTask() });
      await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision');
      await approve(engine, handle.workflowId);
      await handle.done;
    }
    expect(sent).toEqual(['tp-1', 'tp-1']); // double-send is what NS-04 fixes
  });
});

function referralTask(): ReferralTask {
  return { referralRef: 'ServiceRequest/ref-12', priority: 'high', knownState: 'open' };
}

async function runReferral(idempotency: ReturnType<typeof createMemoryIdempotencyStore>) {
  const wf = createReferralWorkflow({
    async readState(t) {
      return t.knownState ?? 'open';
    },
    idempotency,
  });
  const { engine } = createRuntime();
  const handle = engine.start(wf, { memberId: 'm1', input: referralTask() });
  await waitFor(() => engine.query(handle.workflowId)?.status === 'waiting-decision', 'suspended');
  await approve(engine, handle.workflowId);
  return handle.done;
}

describe('referral action is not duplicated on republish (NS-04)', () => {
  it('the second delivery of the same referral is deduped', async () => {
    const idempotency = createMemoryIdempotencyStore('t');
    const first = await runReferral(idempotency);
    expect(first.outcome).toBe('executed');

    const second = await runReferral(idempotency);
    expect(second.outcome).toBe('deduped');
    expect(
      await idempotency.isProcessed(IDEMPOTENCY_CONSUMERS.referralAgent, 'ServiceRequest/ref-12')
    ).toBe(true);
  });
});
