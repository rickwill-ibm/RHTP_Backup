import { describe, it, expect } from 'vitest';
import {
  decideTouchpointDisclosure,
  routeBatch,
  routeBatchGated,
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
  type Touchpoint,
} from '@/lib/sde';
import type { ConsentBasis } from '@/lib/agents/disclosure';
import type { OutreachTask } from '@/lib/agents/outreach';
import { createRuntime, approve, flush, seededDisclosure } from './helpers';
import type { AgentTaskEvent } from '@/lib/agentRuntime';

/** A minimal approved (act) disposition + its signal, for a synthetic batch. */
function sig(
  memberId: string,
  signalId: string,
  kind: string,
  refs: Record<string, string>
): Signal {
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
  return {
    signalId,
    memberId,
    action: 'act',
    policyIds: ['r/1'],
    decidedAtMs: 0,
    touchpointId: `tp:${signalId}`,
    channel: 'task',
    priorityScore: 5,
  };
}

/**
 * COMPILE-TIME PROOF (F4) — the only kind available for a brand.
 *
 * `DisclosedTouchpoint` is inert unless `OutreachTask.touchpoint` is typed as it:
 * with a plain `Touchpoint` the assignment below compiles, and the dispatcher's
 * `tp as OutreachTouchpoint` launder was exactly that. `@ts-expect-error` inverts
 * it — if the assignment ever compiles again, `tsc --noEmit` fails on an unused
 * directive, so `npm run check:types` catches a regression no runtime assertion
 * can see.
 */
const UNDECIDED: Touchpoint = {
  touchpointId: 'tp-undecided',
  memberId: 'm0',
  channel: 'portal',
  intents: [{ signalId: 's0', kind: 'care-gap.opened', priorityScore: 1, channel: 'portal' }],
};
const LAUNDERED: OutreachTask = {
  // @ts-expect-error an UNDECIDED Touchpoint must not be assignable to a DisclosedTouchpoint
  touchpoint: UNDECIDED,
  memberContext: { memberId: 'm0' },
  consentScope: 'care-outreach',
  priority: 'high',
};
void LAUNDERED;

/**
 * The refusal a caller actually received, so its `field` can be asserted.
 *
 * PRECISION, NOT RECALL (lens L1). `AgentRoutingError` is thrown by at least four
 * independent guards in this module — the unconditional no-gate guard, the
 * class-floor fail-closed check, the undeclared-capability wiring check and the
 * routing-data parser. `.toThrow(AgentRoutingError)` therefore passes on whichever
 * guard happens to fire first, which is a recall-only assertion: the guard under
 * test can be deleted outright and the assertion still holds because a DIFFERENT
 * guard catches the same input. Asserting the refusal's `field` (and the guard's
 * own message) is what actually pins WHICH control refused.
 */
function refusalFrom(fn: () => unknown): AgentRoutingError {
  try {
    fn();
  } catch (err) {
    if (err instanceof AgentRoutingError) return err;
    throw err;
  }
  throw new Error('expected an AgentRoutingError refusal, but the call returned normally');
}

/** The distinctive text of each guard in this module that throws AgentRoutingError. */
const GUARD = {
  /** `routeBatchGated`'s UNCONDITIONAL no-gate guard — the invariant under test. */
  unconditional: 'routing a signal to an agent IS a disclosure',
  /** `assertNoUngatedPart2` — the class-conditional check, a DIFFERENT control. */
  classConditional: 'dispatch would disclose them undecided',
  /** The gate's undeclared-agent wiring check, reached only once a gate exists. */
  undeclaredAgent: 'no declared data capability',
} as const;

describe('agent dispatcher (route an SDE batch to the right agents, data-driven)', () => {
  it('routes the real seeded SDE demo batch to outreach + referral + PA agents', () => {
    const demo = loadDemoBatch();
    const batch = runRealDemo();
    const tasks = routeBatch({
      batch,
      memberContext: demo.memberContext,
      signals: demo.signals,
      disclosure: seededDisclosure(demo.nowMs),
    });

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
    const input: DispatchInput = {
      batch,
      memberContext: demo.memberContext,
      signals: demo.signals,
      disclosure: seededDisclosure(demo.nowMs),
    };
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
      fairnessDemotion: { staleFields: [], asOfMs: 0 },
    };
    const ctx: MemberContext = { memberId: 'multi' };
    // The gate is a REQUIRED input now: routing a signal to an agent IS a
    // disclosure, so there is no "pure routing" path that skips the plane.
    //
    // THE DISCLOSURE PREMISE IS STATED HERE, not borrowed. This test's subject is
    // per-member ORDERING, and it previously leaned on `seededDisclosure`, whose
    // consent instruments name the DEMO member only — so the moment `decide.ts`
    // began gating on `recipient.kind`, the two `referral.stalled` signals routed
    // to a CBO (`outside-covered-entity`) that 45 CFR 164.506 does not reach, were
    // correctly denied for these synthetic members, and an ordering test started
    // failing on a consent question it does not ask. Supplying the 164.508 release
    // a real referral workflow obtains makes the premise explicit and keeps the
    // subject intact; it weakens no control, and the refusal side is covered in
    // tests/agents/disclosure/part2Dispatch.test.ts.
    const cboRelease = (memberId: string): ConsentBasis => ({
      basisId: `consent/cbo-release/${memberId}`,
      subjectId: memberId,
      dataClasses: ['demographic', 'social-need'],
      purposes: ['social-care-referral'],
      recipientOrgIds: ['org/cbo-food-access'],
      effectiveFromMs: 0,
      expiresAtMs: Date.parse('2030-01-01T00:00:00.000Z'),
    });
    const tasks = routeBatch({
      batch,
      memberContext: ctx,
      signals,
      disclosure: { ...seededDisclosure(0), basesFor: (memberId) => [cboRelease(memberId)] },
    });
    expect(tasks).toHaveLength(4);

    const { engine, eventSink } = createRuntime();
    const handles = runDispatch(engine, tasks);
    for (let i = 0; i < 50; i++) {
      for (const h of handles) {
        if (engine.query(h.workflowId)?.status === 'waiting-decision')
          await approve(engine, h.workflowId);
      }
      await flush();
    }
    await Promise.all(handles.map((h) => h.done));

    // Within each member: every approved is immediately followed by its OWN settle.
    //
    // THIS ASSERTION GOT STRONGER IN W8, AND THAT IS WORTH SAYING. It used to pair `approved`
    // with `executed`, and both were emitted synchronously inside `decide()` — so the test was
    // proving that one function emits two events in a row, which is true by construction and
    // proves nothing about ordering. `settled` is emitted when the workflow BODY finishes, an
    // async hop later. Their remaining adjacency is now real evidence that the member lock
    // serialises across the resumed body rather than merely inside the decision call.
    for (const m of ['m1', 'm2']) {
      const evts = eventSink
        .forMember(m)
        .filter(
          (e) => e.eventType === 'agent.task.approved' || e.eventType === 'agent.task.settled'
        );
      for (let i = 0; i < evts.length; i += 2) {
        const [a, x] = [evts[i], evts[i + 1]] as [AgentTaskEvent, AgentTaskEvent];
        expect(a.eventType).toBe('agent.task.approved');
        expect(x.eventType).toBe('agent.task.settled');
        expect(x.proposalId).toBe(a.proposalId); // settles against its own approval, no interleave
      }
    }
  });

  it('the disclosure gate is not an optional argument (F3)', () => {
    // `if (!gate) return true` was a published, README-documented total bypass of
    // the disclosure plane, exported from the public barrel. There is no longer a
    // shape of this call that omits the gate — the compiler refuses it, and the
    // runtime backstop refuses it too for a caller that arrives untyped.
    const demo = loadDemoBatch();
    const batch = runRealDemo();
    const ungated = { batch, memberContext: demo.memberContext, signals: demo.signals };
    const demoRefusal = refusalFrom(() => routeBatch(ungated as unknown as DispatchInput));
    // It is THE UNCONDITIONAL GUARD that refused, not one of the three other
    // controls in this module that throw the same class on the same input. Delete
    // that guard and the class-conditional check catches this batch instead —
    // `.toThrow(AgentRoutingError)` cannot tell the two apart; `field` + message can.
    expect(demoRefusal.field).toBe('disclosure');
    expect(demoRefusal.message).toContain(GUARD.unconditional);
    expect(demoRefusal.message).not.toContain(GUARD.classConditional);
    expect(demoRefusal.message).not.toContain(GUARD.undeclaredAgent);

    // And for a batch of ENTIRELY benign signals too. The refusal must not depend
    // on the batch happening to contain heightened material: `if (!gate) return
    // true` returned tasks for exactly this input, ungated and unrecorded.
    const benign = sig('m8', 's8', 'referral.stalled', { referral: 'ref/8' });
    const benignBatch: DispositionBatch = {
      memberId: 'm8',
      foldWindowId: 'fw',
      decidedAtMs: 0,
      dispositions: [act('s8', 'm8')],
      touchpoints: [],
      delayBundles: [],
      summary: { approved: 1, suppressed: 0, delayed: 0, touchpoints: 0 },
      fairnessDemotion: { staleFields: [], asOfMs: 0 },
    };
    const benignRefusal = refusalFrom(() =>
      routeBatch({
        batch: benignBatch,
        memberContext: { memberId: 'm8' },
        signals: [benign],
      } as unknown as DispatchInput)
    );
    // The load-bearing half. With the unconditional guard removed, a benign batch
    // passes the class-conditional check, reaches the gate as `undefined`, and the
    // undeclared-capability wiring check throws — still an `AgentRoutingError`, but
    // filed against the wrong field, on a path that already read an undefined gate.
    expect(benignRefusal.field).toBe('disclosure');
    expect(benignRefusal.message).toContain(GUARD.unconditional);
    expect(benignRefusal.message).not.toContain(GUARD.undeclaredAgent);
  });

  it('refuses an outreach touchpoint whose surviving opener names no consent scope (F2)', () => {
    // `consentScope: survivor.consentScope ?? ''` on an OPTIONAL field: the empty
    // string reached a consent gate that read it as a grant and returned BEFORE the
    // opt-out lookup, so an opted-out member was contacted.
    const s = sig('m9', 's9', 'care-gap.opened', { gap: 'CareGap/x' });
    const unscoped: Signal = { ...s, actionability: 'member-outreach', channel: 'portal' };
    const batch: DispositionBatch = {
      memberId: 'm9',
      foldWindowId: 'fw',
      decidedAtMs: 0,
      dispositions: [act('s9', 'm9')],
      touchpoints: [
        {
          touchpointId: 'tp:s9',
          memberId: 'm9',
          channel: 'portal',
          intents: [{ signalId: 's9', kind: unscoped.kind, priorityScore: 5, channel: 'portal' }],
        },
      ],
      delayBundles: [],
      summary: { approved: 1, suppressed: 0, delayed: 0, touchpoints: 1 },
      fairnessDemotion: { staleFields: [], asOfMs: 0 },
    };
    const r = routeBatchGated({
      batch,
      memberContext: { memberId: 'm9' },
      signals: [unscoped],
      disclosure: seededDisclosure(0),
    });
    expect(r.tasks.filter((t) => t.taskKind === 'outreach')).toEqual([]);
    expect(r.refusals.map((x) => x.reason)).toContain('consent-scope-absent');
  });

  it('a disclosed touchpoint carries the SURVIVOR channel, never the refused one', () => {
    // A FIXED DEFECT WITH NO REGRESSION LOCK. `Touchpoint.channel` is a denormalised
    // copy of `intents[0].channel`, so when intents[0] is the intent the gate
    // REFUSED, inheriting the touchpoint channel sends the surviving content on the
    // channel the refused intent asked for — an SMS to a member whose portal-only
    // intent was the one that cleared. `kept[0]?.channel ?? touchpoint.channel` is
    // the fix; it reduces to `touchpoint.channel` with no test noticing, because no
    // fixture ever refused intents[0] while the survivor asked for a DIFFERENT
    // channel. Every existing bundle fixture is single-channel.
    const refused: Signal = {
      ...sig('m7', 's-refused', 'behavioral.window', {}),
      // Part 2 material the shipped outreach agent has not been granted: denied.
      part2Restricted: true,
      actionability: 'member-outreach',
      channel: 'sms',
      consentScope: 'care-outreach',
    };
    const kept: Signal = {
      ...sig('m7', 's-kept', 'care-gap.opened', { gap: 'CareGap/y' }),
      actionability: 'member-outreach',
      channel: 'portal',
      consentScope: 'care-outreach',
    };
    const tp: Touchpoint = {
      touchpointId: 'tp:m7',
      memberId: 'm7',
      // The denormalised copy of intents[0].channel — i.e. of the REFUSED intent.
      channel: 'sms',
      intents: [
        { signalId: 's-refused', kind: refused.kind, priorityScore: 9, channel: 'sms' },
        { signalId: 's-kept', kind: kept.kind, priorityScore: 1, channel: 'portal' },
      ],
    };
    const byId = new Map([
      [refused.signalId, refused],
      [kept.signalId, kept],
    ]);
    const out = decideTouchpointDisclosure(tp, 'outreach-agent', byId, seededDisclosure(0));

    // The premise: intents[0] really was refused and the other really did survive.
    expect(out.refused.map((r) => r.signalId)).toEqual(['s-refused']);
    expect(out.touchpoint?.intents.map((i) => i.signalId)).toEqual(['s-kept']);
    // The lock: the channel is re-derived from the SURVIVOR, not inherited.
    expect(out.touchpoint?.channel).toBe('portal');
    expect(out.touchpoint?.channel).not.toBe(tp.channel);
    // And the id is still preserved — the send-once guard is keyed on it.
    expect(out.touchpoint?.touchpointId).toBe('tp:m7');
  });

  it('malformed routing data refuses loudly', () => {
    expect(() => parseAgentRouting({ version: '1', routes: [{ id: 'x' }] })).toThrow(
      AgentRoutingError
    );
    expect(() =>
      parseAgentRouting({
        version: '1',
        routes: [{ id: 'x', agentId: 'a', taskKind: 'pa', match: { kindPrefix: 'd' } }],
      })
    ).toThrow(/pa/); // a pa route must carry a template
  });
});
