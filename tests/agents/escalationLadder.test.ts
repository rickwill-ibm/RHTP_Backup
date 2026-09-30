/**
 * THE LADDER AND THE TIMER WHEEL, TESTED DIRECTLY.
 *
 * `tests/agents/escalation.test.ts` drives these two modules through the whole engine, which proves
 * the wired path but cannot reach the properties that only fail under contention or on a rejected
 * predecessor. These are the unit-level pins for the two invariants each module owns.
 */
import { describe, it, expect } from 'vitest';
import { createManualClock } from '@/lib/agentRuntime';
import { MemberTimers } from '@/lib/agentRuntime/memberTimers';
import { abandon, scheduleEscalation, type LadderPort } from '@/lib/agentRuntime/escalationLadder';
import { buildProposalWorkItem } from '@/lib/agentRuntime/inbox';
import type { PendingRecord } from '@/lib/agentRuntime/engineSupport';
import { getEscalationTier, loadEscalationPolicies } from '@/lib/agentRuntime';
import { START_MS, HOUR } from './helpers';

function record(): PendingRecord {
  const action = { actionType: 'send-outreach', priority: 'urgent' } as const;
  return {
    proposalId: 'p0',
    humanRequired: true,
    determinationClass: 'administrative',
    needDomain: 'medical',
    workflowId: 'wf0',
    memberId: 'm1',
    agentId: 'outreach-agent',
    action,
    correlationId: 'corr::wf0',
    tier: getEscalationTier(loadEscalationPolicies(), 'default', 'urgent'),
    hopsSoFar: 0,
    item: buildProposalWorkItem({
      proposalId: 'p0',
      memberId: 'm1',
      action,
      submittedAtMs: START_MS,
    }),
    resolve: () => {
      throw new Error('the ladder must NEVER resolve a proposal — that would resume a dead body');
    },
  };
}

/** A port that records what the ladder did, and nothing else. It cannot resolve anything. */
function spyPort(timers: MemberTimers, current = () => true) {
  const emitted: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const enqueued: string[] = [];
  const terminated: string[] = [];
  const port: LadderPort = {
    isCurrent: current,
    now: () => START_MS,
    scheduleTimer: (memberId, delayMs, fire) => timers.schedule(memberId, delayMs, fire),
    enqueue: async (rec) => void enqueued.push(rec.item.queue),
    emit: async (_rec, eventType, _now, payload) => void emitted.push({ type: eventType, payload }),
    terminate: (workflowId) => void terminated.push(workflowId),
  };
  return { port, emitted, enqueued, terminated };
}

describe('escalation ladder (the terminal, in isolation)', () => {
  it('walks the hierarchy one SLA window at a time, then abandons — never a fourth hop', async () => {
    const timers = new MemberTimers(createManualClock(START_MS));
    const { port, emitted, enqueued, terminated } = spyPort(timers);
    const rec = record();

    scheduleEscalation(port, rec);
    for (let i = 0; i < 4; i++) await timers.advance(4 * HOUR);

    expect(emitted.map((e) => e.type)).toEqual([
      'agent.task.escalated',
      'agent.task.escalated',
      'agent.task.escalated',
      'agent.task.abandoned',
    ]);
    expect(emitted.slice(0, 3).map((e) => e.payload.target)).toEqual([
      'assigned-reviewer',
      'care-team-lead',
      'clinical-supervisor',
    ]);
    // The queue the item sat in at each step. The terminal MOVES it; a reviewer scanning
    // `escalated` sees live work and a reviewer scanning `parked` sees abandoned work.
    expect(enqueued).toEqual(['escalated', 'escalated', 'escalated', 'parked']);
    expect(terminated).toEqual(['wf0']);
  });

  it('a decided proposal cancels the hop: nothing is emitted, nothing is terminated', async () => {
    const timers = new MemberTimers(createManualClock(START_MS));
    const { port, emitted, terminated } = spyPort(timers, () => false);
    scheduleEscalation(port, record());
    await timers.advance(4 * HOUR);
    expect(emitted).toEqual([]);
    expect(terminated).toEqual([]);
  });

  it('abandon copies auditedHops rather than aliasing the tier hierarchy', async () => {
    const timers = new MemberTimers(createManualClock(START_MS));
    const { port, emitted } = spyPort(timers);
    const hops = ['assigned-reviewer', 'care-team-lead'];
    await abandon(port, record(), hops, START_MS);
    const payload = emitted[0].payload.auditedHops as string[];
    expect(payload).toEqual(hops);
    hops.push('mutated');
    expect(payload).toEqual(['assigned-reviewer', 'care-team-lead']); // the audit record is frozen
  });
});

describe('MemberTimers (determinism + per-member ordering)', () => {
  it('fires in (dueAt, insertion) order, including a timer armed by a timer', async () => {
    const timers = new MemberTimers(createManualClock(START_MS));
    const fired: string[] = [];
    timers.schedule('m1', 2 * HOUR, async () => void fired.push('late'));
    timers.schedule('m1', HOUR, async () => {
      fired.push('early');
      // Armed DURING the advance, at the advance target (the clock has already moved). It is
      // therefore due inside this same window and still fires — which a single pre-sorted pass
      // would miss entirely — but it sorts by its dueAt, AFTER `late` at +2h, not by discovery
      // order. Virtual-time order, not arrival order, is the determinism property.
      timers.schedule('m1', 0, async () => void fired.push('nested'));
    });
    await timers.advance(3 * HOUR);
    expect(fired).toEqual(['early', 'late', 'nested']);
  });

  it('a cancelled timer never fires', async () => {
    const timers = new MemberTimers(createManualClock(START_MS));
    const fired: string[] = [];
    const id = timers.schedule('m1', HOUR, async () => void fired.push('x'));
    timers.cancel(id);
    await timers.advance(10 * HOUR);
    expect(fired).toEqual([]);
  });

  it('serialises per member, and a THROWN predecessor does not wedge the member', async () => {
    // `assertSignalDecider` throws on a refused resolution. If the member chain propagated that
    // rejection, one refused signal would silently stop every later decision for that member — a
    // fail-closed that closes far more than the thing it refused.
    const timers = new MemberTimers(createManualClock(START_MS));
    const order: string[] = [];
    const boom = timers.runOnMember('m1', async () => {
      order.push('boom');
      throw new Error('refused');
    });
    const after = timers.runOnMember('m1', async () => void order.push('after'));
    await expect(boom).rejects.toThrow('refused'); // the CALLER still sees it
    await after;
    expect(order).toEqual(['boom', 'after']);
  });

  it('different members do not serialise against each other', async () => {
    const timers = new MemberTimers(createManualClock(START_MS));
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = timers.runOnMember('m1', async () => {
      await gate;
      order.push('m1');
    });
    await timers.runOnMember('m2', async () => void order.push('m2'));
    release();
    await slow;
    expect(order).toEqual(['m2', 'm1']); // m2 finished while m1 was still held
  });
});
