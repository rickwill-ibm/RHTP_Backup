/**
 * DISPATCH IS TOTAL — no unrecognised task kind reaches a workflow, and no
 * unrouted signal leaves the dispatcher without a record.
 *
 * THE DEFECT THESE LOCK (D1). `runDispatch` was three `if`s and a bare
 * `return engine.start(workflows.pa, …)`, so EVERY taskKind that was not
 * `outreach` or `referral` ran as the PRIOR-AUTHORISATION agent. Adding any routed
 * agent with a new taskKind therefore silently made it the PA agent. That is why
 * `bh-screening-triage-agent` shipped with `routes: []`: routing it would have put a
 * behavioural-health screen on the PA workflow, which is worse than not routing it at
 * all. (An earlier version of this header said PA was "WITHDRAWN by a standing scope
 * decision". It is not — the `pa` route is live and dispatches on every demo run. The
 * defect is that a default sent the WRONG kind to it, which is what these tests pin.)
 *
 * THE SECOND DEFECT (D2). `firstMatch` returning `undefined` led to a bare
 * `continue` with nothing pushed to `refusals`. The seeded demo batch carries two
 * such signals — `adt.discharge` (sig-2) and `screening.result` (sig-3) — and both
 * vanished, so no surface could show that the platform received them and did
 * nothing. The module's own standard: a refusal a caller cannot see is a refusal
 * nobody can evidence.
 *
 * THE THIRD DEFECT (D3). `sig.refs?.referral ?? sig.signalId` and
 * `sig.refs?.claim ?? sig.refs?.thread ?? sig.signalId` handed an agent a SIGNAL
 * id where a FHIR resource reference is expected, so the agent acted on — and the
 * ledger cited — a reference that resolves to nothing.
 *
 * PRECISION, NOT RECALL. `.toThrow(AgentRoutingError)` proves nothing in this
 * module: at least five independent guards throw that same class. Every assertion
 * below pins the refusal's `field`/`reason` code, and the D1 case additionally
 * proves NO workflow was started — because "it threw" and "it did not run as the
 * PA agent" are two different claims.
 */
import { describe, expect, it } from 'vitest';
import {
  AgentRoutingError,
  NO_AGENT,
  defaultAgentWorkflows,
  routeBatchGated,
  runDispatch,
  type AgentTaskKind,
  type DispatchedTask,
} from '@/lib/agents/dispatch';
import type { StartOptions, WorkflowDefinition, WorkflowEngine } from '@/lib/agentRuntime';
import {
  isApproved,
  loadDemoBatch,
  runRealDemo,
  type Disposition,
  type DispositionBatch,
  type Signal,
} from '@/lib/sde';
import type { ConsentBasis } from '@/lib/agents/disclosure';
import { seededDisclosure } from './helpers';

/** The workflow name each kind MUST run under; the PA one is what must not be reached. */
const PA_WORKFLOW = 'pa-documentation-journey';
const REFERRAL_WORKFLOW = 'referral-journey';

/** An engine that records which workflow definition was started, and starts nothing. */
function recordingEngine(): { engine: WorkflowEngine; started: string[] } {
  const started: string[] = [];
  const engine = {
    start<I, O>(def: WorkflowDefinition<I, O>, opts: StartOptions<I>) {
      started.push(def.name);
      return { workflowId: `wf:${def.name}`, memberId: opts.memberId, done: Promise.resolve() };
    },
    signal: async () => undefined,
    query: () => undefined,
  } as unknown as WorkflowEngine;
  return { engine, started };
}

/** A referral task, to prove the recorder sees a workflow when one really starts. */
const REFERRAL_TASK: DispatchedTask = {
  agentId: 'referral-coordination-agent',
  taskKind: 'referral',
  memberId: 'm1',
  routeId: 'referral-coordination',
  task: { referralRef: 'ServiceRequest/ref-1', priority: 'high', knownState: 'stalled' },
};

/**
 * The next wave's shape: a routed agent with a taskKind no workflow is declared
 * for. Built by cast because the point is precisely that the type system used to
 * be the ONLY thing holding this back, while the runtime silently substituted PA.
 */
const NOVEL_TASK = {
  agentId: 'bh-screening-triage-agent',
  taskKind: 'bh-triage',
  memberId: 'm1',
  routeId: 'bh-screening-triage',
  task: { instrumentRef: 'QuestionnaireResponse/epds-1' },
} as unknown as DispatchedTask;

// ── Synthetic batches for the ref-absence cases (D3) ────────────────────────────

function sig(signalId: string, kind: string, refs: Record<string, string>): Signal {
  return {
    signalId,
    memberId: 'm1',
    kind,
    sourceEventType: kind,
    occurredAtMs: 0,
    priority: 'high',
    actionability: 'care-team-task',
    foldBehavior: 'immediate',
    dedupeKey: `${kind}:${signalId}`,
    part2Restricted: false,
    refs,
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

function batchOf(signals: Signal[]): DispositionBatch {
  return {
    memberId: 'm1',
    foldWindowId: 'fw',
    decidedAtMs: 0,
    dispositions: signals.map(act),
    touchpoints: [],
    delayBundles: [],
    summary: { approved: signals.length, suppressed: 0, delayed: 0, touchpoints: 0 },
    fairnessDemotion: { staleFields: [], asOfMs: 0 },
  };
}

/**
 * The 45 CFR 164.508 release a real referral workflow obtains. Stated here rather
 * than borrowed: `seededDisclosure`'s instruments name the DEMO member only, and
 * these tests' subject is the REFERENCE shape, not the consent question.
 */
const RELEASE: ConsentBasis = {
  basisId: 'consent/cbo-release/m1',
  subjectId: 'm1',
  dataClasses: ['demographic', 'social-need'],
  purposes: ['social-care-referral'],
  recipientOrgIds: ['org/cbo-food-access'],
  effectiveFromMs: 0,
  expiresAtMs: Date.parse('2030-01-01T00:00:00.000Z'),
};

function route(signals: Signal[]) {
  return routeBatchGated({
    batch: batchOf(signals),
    memberContext: { memberId: 'm1' },
    signals,
    disclosure: { ...seededDisclosure(0), basesFor: () => [RELEASE] },
  });
}

/** The AgentRoutingError a call refused with, so its `field` can be asserted. */
function refusalFrom(fn: () => unknown): AgentRoutingError {
  try {
    fn();
  } catch (err) {
    if (err instanceof AgentRoutingError) return err;
    throw err;
  }
  throw new Error('expected an AgentRoutingError refusal, but the call returned normally');
}

describe('D1 — an unrecognised taskKind refuses and never reaches the PA workflow', () => {
  it('the recorder really does see a workflow start (the positive control)', () => {
    const { engine, started } = recordingEngine();
    runDispatch(engine, [REFERRAL_TASK], defaultAgentWorkflows());
    expect(started).toEqual([REFERRAL_WORKFLOW]);
  });

  it('refuses a novel taskKind with a coded error naming the taskKind field', () => {
    const { engine } = recordingEngine();
    const refusal = refusalFrom(() => runDispatch(engine, [NOVEL_TASK], defaultAgentWorkflows()));
    // Not `.toThrow(AgentRoutingError)`: five guards in this module throw that
    // class. The field is what pins WHICH control refused.
    expect(refusal.field).toBe('routes.bh-screening-triage.taskKind');
    expect(refusal.message).toContain('bh-triage');
    expect(refusal.message).toContain('no declared workflow');
  });

  it('STARTS NOTHING — the PA agent is not reached by an unknown kind', () => {
    const { engine, started } = recordingEngine();
    expect(() => runDispatch(engine, [NOVEL_TASK], defaultAgentWorkflows())).toThrow();
    // The load-bearing assertion. With the old `return engine.start(workflows.pa, …)`
    // default this array holds the PA journey and nothing throws at all.
    expect(started).not.toContain(PA_WORKFLOW);
    expect(started).toEqual([]);
  });

  it('the ROUTING loop refuses a novel taskKind too, and builds no PA task', () => {
    // THE SECOND INSTANCE of the same shape, in `routeBatchGated` rather than
    // `runDispatch`: `route.taskKind === 'referral' ? referralTaskFor(…) :
    // paTaskFor(…)` built a PRIOR-AUTHORISATION task for every other kind. A
    // routing table handed in-process never passes `parseAgentRouting`, so the
    // taskKind allow-list there does not stand between this and a PA task.
    const s = sig('s-novel', 'referral.stalled', { referral: 'ServiceRequest/ref-n' });
    const refusal = refusalFrom(() =>
      routeBatchGated({
        batch: batchOf([s]),
        memberContext: { memberId: 'm1' },
        signals: [s],
        disclosure: { ...seededDisclosure(0), basesFor: () => [RELEASE] },
        routing: {
          version: 'test',
          routes: [
            {
              id: 'bh-screening-triage',
              // Display-only for the gate, and a real capability, so the
              // disclosure plane PERMITS and the build is genuinely reached.
              agentId: 'referral-coordination-agent',
              taskKind: 'bh-triage' as unknown as AgentTaskKind,
              match: { kindPrefix: 'referral' },
              // A PA template the next wave would plausibly copy from the PA
              // route. It is what makes this mutation-proof: restore the ternary
              // and `paTaskFor` SUCCEEDS, so the call returns a PA task normally
              // instead of failing on a missing template. Without this field the
              // old code still threw — just from a different guard.
              pa: { currentState: 'Denied', advanceEvent: { type: 'appeal' } },
            },
          ],
        },
      })
    );
    expect(refusal.field).toBe('routes.bh-screening-triage.taskKind');
    expect(refusal.message).toContain('bh-triage');
    expect(refusal.message).toContain('no task builder');
  });

  it('refuses before any earlier task in the same batch runs as PA', () => {
    // A novel kind in the middle of a batch must not leave a PA workflow behind it.
    const { engine, started } = recordingEngine();
    expect(() => runDispatch(engine, [REFERRAL_TASK, NOVEL_TASK], defaultAgentWorkflows())).toThrow(
      AgentRoutingError
    );
    expect(started).toEqual([REFERRAL_WORKFLOW]);
    expect(started).not.toContain(PA_WORKFLOW);
  });
});

describe('D2 — the seeded unrouted signals are visible refusals, not silence', () => {
  const run = () => {
    const demo = loadDemoBatch();
    const batch = runRealDemo();
    return {
      demo,
      batch,
      result: routeBatchGated({
        batch,
        memberContext: demo.memberContext,
        signals: demo.signals,
        disclosure: seededDisclosure(demo.nowMs),
      }),
    };
  };

  it('the premise: sig-2 and sig-3 are approved and match no routing rule', () => {
    const { demo, batch } = run();
    const approved = batch.dispositions.filter(isApproved).map((d) => d.signalId);
    expect(approved).toContain('sig-2');
    expect(approved).toContain('sig-3');
    const byId = new Map(demo.signals.map((s) => [s.signalId, s]));
    // `care-team-task`, so neither `member-outreach` actionability nor a
    // `referral`/`denial` kind prefix — no rule in the shipped table matches.
    expect(byId.get('sig-2')?.kind).toBe('adt.discharge');
    expect(byId.get('sig-2')?.actionability).toBe('care-team-task');
    expect(byId.get('sig-3')?.kind).toBe('screening.result');
    expect(byId.get('sig-3')?.actionability).toBe('care-team-task');
  });

  it('the CARE-TEAM-TASK path is what is dropped, not the member touchpoint', () => {
    // Precision about what vanished. Both signals are also bundled INTO the
    // approved coordinated touchpoint, so the MEMBER is still contacted. What
    // produced nothing and recorded nothing is their `care-team-task` disposition:
    // the platform was told to raise a care-team task and silently raised none.
    const { result } = run();
    const outreach = result.tasks.find((t) => t.taskKind === 'outreach');
    const intents =
      outreach?.taskKind === 'outreach'
        ? outreach.task.touchpoint.intents.map((i) => i.signalId)
        : [];
    expect(intents).toContain('sig-2');
    expect(intents).toContain('sig-3');
    // And no task was produced for either disposition.
    expect(result.tasks.some((t) => t.routeId === '')).toBe(false);
    expect(result.tasks).toHaveLength(3);
  });

  it('surfaces both as `no-route` refusals the caller can render', () => {
    const { result } = run();
    const unrouted = result.refusals.filter((r) => r.reason === 'no-route');
    expect(unrouted.map((r) => r.signalId).sort()).toEqual(['sig-2', 'sig-3']);
    // No agent was ever selected, so the record says so by name rather than by
    // an empty string that reads as a missing field.
    expect(unrouted.every((r) => r.agentId === NO_AGENT)).toBe(true);
    expect(unrouted.every((r) => r.decision === undefined)).toBe(true);
  });

  it('records each unrouted signal exactly once', () => {
    // A signal can be BOTH a touchpoint opener and an approved disposition, and
    // the route question is asked in both loops.
    const { result } = run();
    const ids = result.refusals.filter((r) => r.reason === 'no-route').map((r) => r.signalId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not refuse the signals that DO route — the fix is not a blanket refusal', () => {
    const { result } = run();
    const unrouted = new Set(
      result.refusals.filter((r) => r.reason === 'no-route').map((r) => r.signalId)
    );
    for (const id of ['sig-4', 'sig-5']) expect(unrouted.has(id)).toBe(false);
    expect(result.tasks.map((t) => t.taskKind).sort()).toEqual(['outreach', 'pa', 'referral']);
  });
});

describe('D2 — the adjacent silent drops in the same two loops', () => {
  it('surfaces an APPROVED disposition whose signal the batch does not carry', () => {
    // `if (!sig) continue` — the decision was made by SDE and then lost.
    const present = sig('s-here', 'referral.stalled', { referral: 'ServiceRequest/ref-h' });
    const ghost = sig('s-ghost', 'referral.stalled', { referral: 'ServiceRequest/ref-g' });
    const r = routeBatchGated({
      batch: batchOf([present, ghost]),
      memberContext: { memberId: 'm1' },
      signals: [present], // the ghost's disposition is approved; its signal is absent
      disclosure: { ...seededDisclosure(0), basesFor: () => [RELEASE] },
    });
    const refusal = r.refusals.find((x) => x.signalId === 's-ghost');
    expect(refusal?.reason).toBe('signal-unreadable');
    expect(refusal?.agentId).toBe(NO_AGENT);
    expect(r.tasks).toHaveLength(1);
  });

  it('surfaces a composed touchpoint whose OPENER is unreadable', () => {
    // gateWiring.test.ts covers a ghost at intents[1]; intents[0] took the other
    // branch — `if (!opener) continue` — and dropped the whole touchpoint silently.
    const r = routeBatchGated({
      batch: {
        memberId: 'm1',
        foldWindowId: 'fw',
        decidedAtMs: 0,
        dispositions: [],
        touchpoints: [
          {
            touchpointId: 'tp:ghost-opener',
            memberId: 'm1',
            channel: 'portal',
            intents: [
              {
                signalId: 's-absent',
                kind: 'care-gap.opened',
                priorityScore: 5,
                channel: 'portal',
              },
            ],
          },
        ],
        delayBundles: [],
        summary: { approved: 0, suppressed: 0, delayed: 0, touchpoints: 1 },
        fairnessDemotion: { staleFields: [], asOfMs: 0 },
      },
      memberContext: { memberId: 'm1' },
      signals: [],
      disclosure: seededDisclosure(0),
    });
    expect(r.tasks).toEqual([]);
    const refusal = r.refusals.find((x) => x.signalId === 's-absent');
    expect(refusal?.reason).toBe('signal-unreadable');
    expect(refusal?.agentId).toBe(NO_AGENT);
  });
});

describe('D3 — a missing resource reference refuses; no signal id is substituted', () => {
  it('refuses a referral route whose signal carries no referral reference', () => {
    const s = sig('s-noref', 'referral.stalled', {});
    const r = route([s]);
    expect(r.tasks).toEqual([]);
    const refusal = r.refusals.find((x) => x.signalId === 's-noref');
    expect(refusal?.reason).toBe('referral-ref-absent');
    expect(refusal?.agentId).toBe('referral-coordination-agent');
  });

  it('builds the referral task when the reference IS present (the control)', () => {
    const r = route([sig('s-ref', 'referral.stalled', { referral: 'ServiceRequest/ref-9' })]);
    const task = r.tasks.find((t) => t.taskKind === 'referral');
    expect(task?.taskKind === 'referral' && task.task.referralRef).toBe('ServiceRequest/ref-9');
    expect(r.refusals.map((x) => x.reason)).not.toContain('referral-ref-absent');
  });

  it('refuses a PA route whose signal carries neither a claim nor a thread reference', () => {
    const s = sig('s-nothread', 'denial.issued', {});
    const r = route([s]);
    expect(r.tasks).toEqual([]);
    const refusal = r.refusals.find((x) => x.signalId === 's-nothread');
    expect(refusal?.reason).toBe('thread-ref-absent');
    expect(refusal?.agentId).toBe('pa-documentation-agent');
  });

  it('still accepts a thread reference when there is no claim (the chain survives)', () => {
    const r = route([sig('s-thread', 'denial.issued', { thread: 'Communication/th-3' })]);
    const task = r.tasks.find((t) => t.taskKind === 'pa');
    expect(task?.taskKind === 'pa' && task.task.threadRef).toBe('Communication/th-3');
  });

  it('prefers the claim reference over the thread reference, as before', () => {
    const r = route([
      sig('s-both', 'denial.issued', { claim: 'Claim/c-4', thread: 'Communication/th-4' }),
    ]);
    const task = r.tasks.find((t) => t.taskKind === 'pa');
    expect(task?.taskKind === 'pa' && task.task.threadRef).toBe('Claim/c-4');
  });

  it('never hands an agent the signal id as a resource reference', () => {
    // The shape of the defect, asserted directly: for EVERY built task, no
    // reference field equals the signal id it was built from.
    const signals = [
      sig('s-a', 'referral.stalled', { referral: 'ServiceRequest/ref-a' }),
      sig('s-b', 'denial.issued', { claim: 'Claim/c-b' }),
      sig('s-c', 'referral.stalled', {}),
      sig('s-d', 'denial.issued', {}),
    ];
    const r = route(signals);
    const refs = r.tasks.flatMap((t) =>
      t.taskKind === 'referral'
        ? [t.task.referralRef]
        : t.taskKind === 'pa'
          ? [t.task.threadRef]
          : []
    );
    for (const id of signals.map((s) => s.signalId)) expect(refs).not.toContain(id);
    expect(r.refusals.map((x) => x.reason).sort()).toEqual([
      'referral-ref-absent',
      'thread-ref-absent',
    ]);
  });
});
