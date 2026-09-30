/**
 * Two dispatch properties that the suite asserted nowhere, each found by a gate
 * rather than by reading the code — recorded here so neither can go quiet again.
 *
 * D5 — THE PA PRIORITY PROJECTION. The E13 mutation gate reported a SURVIVING mutant
 * on `dispatchTasks.ts`: inverting `sig.priority === 'urgent'` to `!==` in
 * `paContextFor` left the whole suite green. So nothing distinguished an EXPEDITED
 * prior-authorisation task from a STANDARD one. The consequence is not cosmetic —
 * `slaHoursFor` (tests/pa/validityResilience.test.ts) puts expedited at 72h and
 * standard at 168h, so with the operator inverted every urgent denial is worked to a
 * 168h clock and every routine one to 72h. A decision clock that is wrong in both
 * directions at once is worse than no clock, because the screens still show one.
 *
 * D6 — THE LOST TOUCHPOINT. `dispatcher.ts` asserted as an INVARIANT that the
 * `continue`s left in `routeTouchpoints` "lose nothing: they hand the signal to the
 * OTHER loop (its route is of the other kind)". `routeDispositions` iterates
 * `batch.dispositions`, so that handoff only happens for an opener carrying an
 * APPROVED disposition — which nothing guarantees. Measured before the fix, on one
 * touchpoint whose opener routes to referral with no dispositions at all:
 * `tasks=0 refusals=[]`. SDE had decided to contact the member and dispatch produced
 * no task, no refusal, and no trace of either fact.
 *
 * PRECISION, NOT RECALL (the house standard in dispatchTotality.test.ts): each
 * assertion pins the projected VALUE or the refusal's `reason` code, never merely
 * that something was refused.
 */
import { describe, expect, it } from 'vitest';
import { routeBatchGated } from '@/lib/agents/dispatch';
import type { Disposition, DispositionBatch, Priority, Signal, Touchpoint } from '@/lib/sde';
import type { ConsentBasis } from '@/lib/agents/disclosure';
import { seededDisclosure } from './helpers';

const MEMBER = 'm1';

/** The release a referral workflow obtains; the subject here is routing, not consent. */
const RELEASE: ConsentBasis = {
  basisId: 'consent/cbo-release/m1',
  subjectId: MEMBER,
  dataClasses: ['demographic', 'social-need'],
  purposes: ['social-care-referral'],
  recipientOrgIds: ['org/cbo-food-access'],
  effectiveFromMs: 0,
  expiresAtMs: Date.parse('2030-01-01T00:00:00.000Z'),
};

function sig(signalId: string, kind: string, over: Partial<Signal> = {}): Signal {
  return {
    signalId,
    memberId: MEMBER,
    kind,
    sourceEventType: kind,
    occurredAtMs: 0,
    priority: 'high',
    actionability: 'care-team-task',
    foldBehavior: 'immediate',
    dedupeKey: `${kind}:${signalId}`,
    part2Restricted: false,
    refs: {},
    ...over,
  };
}

function act(s: Signal): Disposition {
  return {
    signalId: s.signalId,
    memberId: s.memberId,
    action: 'act',
    policyIds: ['r/1'],
    decidedAtMs: 0,
    touchpointId: `tp:${s.signalId}`,
    channel: 'task',
    priorityScore: 5,
  };
}

function tpFor(s: Signal): Touchpoint {
  return {
    touchpointId: `tp:${s.signalId}`,
    memberId: s.memberId,
    channel: 'task',
    intents: [{ signalId: s.signalId, kind: s.kind, priorityScore: 5, channel: 'task' }],
  };
}

function route(
  signals: Signal[],
  opts: { approve?: boolean; touchpoints?: Touchpoint[]; dispositions?: Disposition[] } = {}
) {
  const batch: DispositionBatch = {
    memberId: MEMBER,
    foldWindowId: 'fw',
    decidedAtMs: 0,
    // `dispositions` is an explicit third lever, and it is the ONLY one that can reach
    // the `&& isApproved(d)` conjunct in `routeTouchpoints`. With just all-approved and
    // none-at-all, `.some()` on `[]` is false regardless of the predicate, so the
    // conjunct was uncovered and mutating `&&` to `||` left every test green.
    dispositions: opts.dispositions ?? (opts.approve === false ? [] : signals.map(act)),
    touchpoints: opts.touchpoints ?? [],
    delayBundles: [],
    summary: { approved: signals.length, suppressed: 0, delayed: 0, touchpoints: 0 },
    fairnessDemotion: { staleFields: [], asOfMs: 0 },
  };
  return routeBatchGated({
    batch,
    memberContext: { memberId: MEMBER },
    signals,
    disclosure: { ...seededDisclosure(0), basesFor: () => [RELEASE] },
  });
}

/** The `paContext.priority` a denial of this signal priority is projected to. */
function paPriorityFor(priority: Priority): string | undefined {
  const r = route([
    sig(`s-${priority}`, 'denial.issued', { priority, refs: { claim: 'Claim/c' } }),
  ]);
  const task = r.tasks.find((t) => t.taskKind === 'pa');
  return task?.taskKind === 'pa' ? task.task.paContext.priority : undefined;
}

describe('D5 — the PA priority projection is not a coin flip', () => {
  it("projects an URGENT denial to 'expedited'", () => {
    expect(paPriorityFor('urgent')).toBe('expedited');
  });

  it("projects a ROUTINE denial to 'standard'", () => {
    expect(paPriorityFor('routine')).toBe('standard');
  });

  it("projects a HIGH denial to 'standard' — only 'urgent' is expedited", () => {
    // The third value is what makes this a mapping rather than a negation: a test of
    // urgent alone passes under `!==` as long as nothing else is ever checked, which
    // is exactly how the surviving mutant hid.
    expect(paPriorityFor('high')).toBe('standard');
  });

  it('and the two directions DIFFER — the property the surviving mutant broke', () => {
    expect(paPriorityFor('urgent')).not.toBe(paPriorityFor('routine'));
  });
});

describe('D6 — an SDE-composed touchpoint is never dispatched by nobody', () => {
  it('REFUSES a non-outreach touchpoint opener that no approved disposition will reach', () => {
    const opener = sig('s-lost', 'referral.stalled', { refs: { referral: 'ServiceRequest/r-1' } });

    const r = route([opener], { approve: false, touchpoints: [tpFor(opener)] });

    // Before the fix this was `tasks=0 refusals=[]` — the whole point.
    expect(r.tasks).toHaveLength(0);
    const refusal = r.refusals.find((x) => x.signalId === 's-lost');
    expect(refusal?.reason).toBe('touchpoint-route-not-outreach');
    // The refusal names the agent the route WOULD have selected, not `agent/none`:
    // a reviewer needs to see which agent was on the other end of the lost handoff.
    expect(refusal?.agentId).toBe('referral-coordination-agent');
  });

  it('REFUSES when a disposition names the opener but is SUPPRESSED, not approved', () => {
    // The case that makes `&& isApproved(d)` load-bearing, and the one the first cut of
    // this suite could not construct. `routeDispositions` does `if (!isApproved(d))
    // continue`, so a suppressed disposition reaches nothing — a membership test on
    // signalId alone would read this as "handled elsewhere" and go quiet, restoring
    // exactly the `tasks=0 refusals=[]` this describe block exists to prevent.
    const opener = sig('s-suppressed', 'referral.stalled', {
      refs: { referral: 'ServiceRequest/r-3' },
    });

    const r = route([opener], {
      // `SuppressDisposition` requires its own `reasonCode` — the discriminated union
      // will not let a suppression be recorded without saying why.
      dispositions: [{ ...act(opener), action: 'suppress', reasonCode: 'consent-absent' }],
      touchpoints: [tpFor(opener)],
    });

    expect(r.tasks).toHaveLength(0);
    expect(r.refusals.find((x) => x.signalId === 's-suppressed')?.reason).toBe(
      'touchpoint-route-not-outreach'
    );
  });

  it('stays SILENT when an approved disposition genuinely does pick the opener up', () => {
    // The other half of the property. A refusal here would be a false alarm on the
    // ordinary path, which is how a loud guard gets deleted six months later.
    const opener = sig('s-kept', 'referral.stalled', { refs: { referral: 'ServiceRequest/r-2' } });

    const r = route([opener], { touchpoints: [tpFor(opener)] });

    expect(r.refusals.map((x) => x.reason)).not.toContain('touchpoint-route-not-outreach');
    expect(r.tasks.some((t) => t.taskKind === 'referral')).toBe(true);
  });
});
