import { describe, it, expect } from 'vitest';
import {
  routeBatch,
  runDispatch,
  parseAgentRouting,
  AgentRoutingError,
  type DispatchInput,
} from '@/lib/agents/dispatch';
import {
  loadDemoBatch,
  runRealDemo,
  type Disposition,
  type DispositionBatch,
  type MemberContext,
  type Signal,
} from '@/lib/sde';
import { createRuntime, waitFor, approve, flush } from './helpers';
import type { AgentTaskEvent } from '@/lib/agentRuntime';

/** A minimal approved (act) disposition + its signal, for a synthetic batch. */
function sig(memberId: string, signalId: string, kind: string, refs: Record<string, string>): Signal {
  return {
    signalId,
    memberId,
    kind,
    sourceEventType: kind,
    occurredAtMs: 0,
    priority: 'high',
    actionability: 'care-team-task',
    foldBehavior: 'immediate',
    dedupeKey: `${kind}:${memberId}:${signalId}`,
    part2Restricted: false,
    refs,
  };
}

function act(signalId: string, memberId: string): Disposition {
  return { signalId, memberId, action: 'act', policyIds: ['r/1'], decidedAtMs: 0, touchpointId: `tp:${signalId}`, channel: 'task', priorityScore: 5 };
}

describe('agent dispatcher (route an SDE batch to the right agents, data-driven)', () => {
  it('routes the real seeded SDE demo batch to outreach + referral + PA agents', () => {
    const demo = loadDemoBatch();
    const batch = runRealDemo();
    const tasks = routeBatch({ batch, memberContext: demo.memberContext, signals: demo.signals });

    const byKind = Object.fromEntries(tasks.map((t) => [t.taskKind, t]));
    expect(byKind.outreach?.agentId).toBe('outreach-agent');
    expect(byKind.referral?.agentId).toBe('referral-coordination-agent');
    expect(byKind.pa?.agentId).toBe('pa-documentation-agent');
    // The PA route applied its data template (non-authoritative appeal advancement).
    expect(byKind.pa?.taskKind === 'pa' && byKind.pa.task.currentState).toBe('Denied');
    expect(byKind.pa?.taskKind === 'pa' && byKind.pa.task.advanceEvent.type).toBe('appeal');
  });

  it('is deterministic and pure: same batch -> identical routing', () => {
    const demo = loadDemoBatch();
    const batch = runRealDemo();
    const input: DispatchInput = { batch, memberContext: demo.memberContext, signals: demo.signals };
    expect(routeBatch(input)).toEqual(routeBatch(input));
  });

  it('preserves per-member ordering across dispatched tasks', async () => {
    const signals = [
      sig('m1', 's1', 'referral.stalled', { referral: 'ref/1' }),
      sig('m1', 's2', 'denial.issued', { claim: 'clm/1' }),
      sig('m2', 's3', 'referral.stalled', { referral: 'ref/2' }),
      sig('m2', 's4', 'denial.issued', { claim: 'clm/2' }),
    ];
    const batch: DispositionBatch = {
      memberId: 'multi',
      foldWindowId: 'fw',
      decidedAtMs: 0,
      dispositions: signals.map((s) => act(s.signalId, s.memberId)),
      touchpoints: [],
      delayBundles: [],
      summary: { approved: 4, suppressed: 0, delayed: 0, touchpoints: 0 },
    };
    const ctx: MemberContext = { memberId: 'multi' };
    const tasks = routeBatch({ batch, memberContext: ctx, signals });
    expect(tasks).toHaveLength(4);

    const { engine, eventSink } = createRuntime();
    const handles = runDispatch(engine, tasks);
    for (let i = 0; i < 50; i++) {
      for (const h of handles) {
        if (engine.query(h.workflowId)?.status === 'waiting-decision') await approve(engine, h.workflowId);
      }
      await flush();
    }
    await Promise.all(handles.map((h) => h.done));

    // Within each member: every approved is immediately followed by its own executed.
    for (const m of ['m1', 'm2']) {
      const evts = eventSink.forMember(m).filter((e) => e.eventType === 'agent.task.approved' || e.eventType === 'agent.task.executed');
      for (let i = 0; i < evts.length; i += 2) {
        const [a, x] = [evts[i], evts[i + 1]] as [AgentTaskEvent, AgentTaskEvent];
        expect(a.eventType).toBe('agent.task.approved');
        expect(x.eventType).toBe('agent.task.executed');
        expect(x.proposalId).toBe(a.proposalId); // executed pairs with its own approval, no interleave
      }
    }
  });

  it('malformed routing data refuses loudly', () => {
    expect(() => parseAgentRouting({ version: '1', routes: [{ id: 'x' }] })).toThrow(AgentRoutingError);
    expect(() =>
      parseAgentRouting({ version: '1', routes: [{ id: 'x', agentId: 'a', taskKind: 'pa', match: { kindPrefix: 'd' } }] }),
    ).toThrow(/pa/); // a pa route must carry a template
  });
});
