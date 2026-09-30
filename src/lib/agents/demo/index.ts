// SEAM: agentRuntime  (dataMode)
/**
 * Agent demo seam. Mirrors the SDE demo seam: in mock mode `getAgentDemoActions()`
 * returns the demo's AUTHORED agent actions (the hardcoded page stays green); in
 * production mode it runs the REAL agents via the runtime over the seeded SDE demo
 * batch (SDE dispositions -> dispatcher -> agents -> HITL auto-approved -> executed),
 * projecting the resulting executed/rejected/suppressed actions into the same shape.
 *
 * The action shape is EMERGENT from the runtime in production mode, never authored.
 */
import { assertReviewerQualified, SEED_EPOCH_MS } from '@/lib/authz/credentialing';

/** The seeded reviewer of record the demo resolves. A reference, never an invented name. */
const DEMO_REVIEWER_REF = 'Practitioner/dev';

import {
  agentRuntimeMode,
  createRuntime,
  isTerminalStatus,
  type WorkflowHandle,
} from '@/lib/agentRuntime';
import { loadDemoBatch, runRealDemo, taxonomyClassFloor } from '@/lib/sde';
import {
  routeBatchGated,
  runDispatch,
  type DispatchedTask,
  type RefusedDispatch,
} from '@/lib/agents/dispatch';
import { agentCapabilities } from '@/lib/agents/manifest';
import { createDisclosureLedger, type DisclosureDecision } from '@/lib/agents/disclosure';
import { loadConsentBases, recipientForAgent } from './disclosureSources';
import authoredJson from './authored-agent-actions.json';

/**
 * One run's disclosure record: what was decided, and what was refused.
 *
 * RETURNED, NOT STORED. This was a pair of module-level `let`s holding "the last
 * run's" ledger and refusals. In a Next server the module is per-PROCESS and
 * shared across concurrent requests, so one member's request could read another
 * member's disclosure rows — rows that carry `subjectId`. A cross-member PHI leak
 * through a convenience accessor. The run now hands its record back to its own
 * caller and keeps nothing.
 */
export interface DemoDisclosureRecord {
  decisions: readonly DisclosureDecision[];
  refusals: readonly RefusedDispatch[];
}

/** Everything one real-agent demo run produced. */
export interface RealAgentDemoRun {
  actions: AgentDemoAction[];
  disclosures: DemoDisclosureRecord;
}

/**
 * Read the disclosure record of a demo run. Takes the run: there is no "last
 * run" to ask about, by construction.
 */
export function demoDisclosures(run: RealAgentDemoRun): DemoDisclosureRecord {
  return run.disclosures;
}

/**
 * Every terminal outcome this projection can report.
 *
 * DERIVED FROM THE SHIPPED RESULT UNIONS, not invented here: outreach returns
 * executed | rejected | suppressed | deduped, referral returns executed |
 * rejected | resolved-no-action | deduped, pa returns executed | not-advanced |
 * rejected.
 *
 * This sentence said `pa returns executed | rejected` AFTER `not-advanced` was added to
 * `PaResult` and to the list below — a stale derivation claim in the docstring the whole
 * union's legitimacy rests on, and the fourth comment in this wave that outran its code.
 * Corrected, and the mismatch is now gated: `demoSeam.test.ts` asserts this union equals
 * the actual union of the three shipped result types, so the claim cannot go stale again
 * without a red test.
 *
 * NOTE ON BREADTH, recorded as a live disagreement rather than settled: an adversarial
 * seat argued `not-advanced` does not belong in a CROSS-AGENT vocabulary because it names
 * a PA state-machine event, and that a `not-advanced` referral row is unrepresentable in
 * the domain while perfectly representable in this type — recommending it be projected as
 * `unknown` with the specificity moved to a per-kind field. The counter-argument, taken
 * here: `unknown` means "this projection CANNOT say", and folding a KNOWN terminal into it
 * loses information on a surface an auditor reads. Per-kind outcome vocabularies are the
 * better end state and are a typed-projection change, not a member deletion.
 * `unknown` is the NEGATIVE SINK for anything this projection has not been
 * taught — see `parseDemoOutcome`.
 *
 * `failed` is deliberately absent. A workflow that fails REJECTS its `done`
 * promise (agentRuntime/engine.ts `fail()`), so `Promise.all` rejects and
 * `runRealAgentDemo` throws before any projection happens; a `failed` member
 * would be a union case nothing can produce.
 */
export const AGENT_DEMO_OUTCOMES = [
  'executed',
  // A settled workflow whose advancement was REFUSED by its own state machine. It is a
  // distinct member and not folded into `executed`, because the difference between
  // "the thread advanced" and "the thread did not" is the whole content of the record.
  'not-advanced',
  'rejected',
  'suppressed',
  'deduped',
  'resolved-no-action',
  // The escalation ladder gave up and the runtime terminated the workflow (G-001). A distinct
  // member, NOT folded into `unknown`: `unknown` means this projection cannot say, and here the
  // runtime knows exactly what happened. Projecting a named terminal as "cannot say" would be the
  // demo layer discarding the precision the audit layer was just given.
  'abandoned',
  'unknown',
] as const;

/** One terminal outcome of a dispatched agent workflow, as projected. */
export type AgentDemoOutcome = (typeof AGENT_DEMO_OUTCOMES)[number];

/** One PHI-safe agent action row for the demo screen. */
export interface AgentDemoAction {
  agentId: string;
  taskKind: string;
  actionType: string;
  memberId: string;
  outcome: AgentDemoOutcome;
  refs: Record<string, string>;
}

/** Everything the seam's ONE public accessor reports about a run. */
export interface AgentDemoRunView {
  actions: AgentDemoAction[];
  mode: string;
  /** Derived, never asserted — see `isEmergent`. */
  emergent: boolean;
  /** The run's own ledger; `null` for authored actions, which disclosed nothing. */
  disclosures: DemoDisclosureRecord | null;
}

/** The authored demo actions (mock mode) — the reference the demo screen renders. */
export function authoredAgentActions(): AgentDemoAction[] {
  return (authoredJson as unknown as { actions: AgentDemoAction[] }).actions;
}

/**
 * Is this run EMERGENT — produced by the live runtime rather than authored?
 *
 * DERIVED FROM THE RUN, never asserted by the branch that produced it. Two
 * independent facts must both hold: the run carries a disclosure ledger (only a
 * real dispatch writes one), and the actions are not the authored module
 * singleton (the check the governance prober already makes). Deriving it from
 * the SAME value the caller reports as `disclosures` is what makes
 * `emergent: true` with no ledger — and a real run reported `emergent: false`
 * while its ledger, including any deny, is dropped — unrepresentable.
 */
export function isEmergent(
  actions: readonly AgentDemoAction[],
  disclosures: DemoDisclosureRecord | null
): boolean {
  return disclosures !== null && actions !== authoredAgentActions();
}

/**
 * The `agentRuntime` dataMode seam — THE ONE DOOR.
 *
 * Returns the actions, the mode, the derived `emergent` label and the disclosure
 * record of the SAME run. It returned only `{ actions, mode }`, so the
 * production caller could not use it without re-running for the ledger; it
 * called the runtime directly instead and the resolver this seam's own
 * disposition manifest declares was reached by a test and nothing else.
 *
 * INVARIANT: the seam mode is resolved EXACTLY ONCE per call. `agentRuntimeMode()`
 *            reads a mutable process-global written by a live UI toggle, so a
 *            second read can disagree with the first and report a real run as
 *            mock.
 */
export async function getAgentDemoActions(): Promise<AgentDemoRunView> {
  const mode = agentRuntimeMode();
  if (mode !== 'production') {
    const actions = authoredAgentActions();
    return { actions, mode, emergent: isEmergent(actions, null), disclosures: null };
  }
  const run = await runRealAgentDemo();
  return {
    actions: run.actions,
    mode,
    emergent: isEmergent(run.actions, run.disclosures),
    disclosures: run.disclosures,
  };
}

/**
 * Approve every pending proposal until all workflows settle (demo driver).
 *
 * THE DECIDER USED TO BE THE LITERAL `'demo-reviewer'` (register G-045). That string satisfied the
 * only check there was, and this function is reached from `runRealAgentDemo()`, which
 * `/api/ops/agents/actions` calls whenever the agent runtime is in production mode — so an HTTP GET
 * drove the real engine and resolved every adverse proposal in the seeded batch on an invented name.
 *
 * It now resolves a REAL reviewer through the credentialing seam, which is the point of that seam
 * existing: the demo exercises the production qualification path against seeded data rather than
 * stepping around it. In production mode with no credentialing source wired this THROWS, which is
 * the correct answer to "drive a demo batch against a system that cannot name its reviewers".
 */
async function driveAutoApprove(
  engine: ReturnType<typeof createRuntime>['engine'],
  handles: WorkflowHandle[],
  nowMs: number
): Promise<void> {
  for (let i = 0; i < 1000; i++) {
    let acted = false;
    for (const h of handles) {
      const snap = engine.query(h.workflowId);
      if (snap?.status === 'waiting-decision' && snap.awaitingProposalId) {
        // A PROOF PER PROPOSAL, minted against THAT proposal's own requirement.
        //
        // This minted ONE proof before the loop — `clinical` / `medical` — and reused it to resolve
        // every pending proposal across every agent in the batch, none of which had been evaluated
        // against it. Today's batch happens to be all-medical, so nothing was wrong yet; add one
        // behavioral-health or LTSS action and a medical-only attestation silently resolved it,
        // which is exactly the substitution this plane exists to prevent. `engine.signal` now
        // refuses a proof that does not cover the determination, so a mis-scoped proof would fail
        // loudly — but minting it correctly is the fix, not relying on the catch.
        const scope = snap.awaitingScope ?? {
          determinationClass: 'administrative' as const,
          needDomain: 'medical' as const,
        };
        await engine.signal(h.workflowId, {
          name: 'agent.task.approved',
          proposalId: snap.awaitingProposalId,
          decidedBy: DEMO_REVIEWER_REF,
          reviewer: assertReviewerQualified(
            DEMO_REVIEWER_REF,
            {
              kind: 'initial-determination',
              determinationClass: scope.determinationClass,
              needDomain: scope.needDomain,
              licenceJurisdiction: 'NY',
            },
            // THE RUNTIME'S OWN CLOCK, not a literal. This passed `SEED_EPOCH_MS`, so on the one
            // path the wave calls out as reachable over HTTP, licence expiry, restriction and
            // record staleness were evaluated against a frozen 2026-06-01 forever — the demo
            // looking healthy while the routes, which pass `now()`, would have 403'd.
            nowMs
          ),
        });
        acted = true;
      }
    }
    await Promise.resolve();
    // `isTerminalStatus`, not a hand-written member list. The list was `completed | failed`, so
    // when W8 added `abandoned` an abandoned workflow was never `allSettled` and this loop spun its
    // whole iteration budget before falling out — no compile error, no test, just a slow silence.
    const allSettled = handles.every((h) => isTerminalStatus(engine.query(h.workflowId)?.status));
    if (!acted && allSettled) break;
  }
}

/**
 * PARSE a settled workflow result's outcome. Never cast, never default to the
 * affirmative.
 *
 * This was a cast that defaulted anything unrecognised to `'executed'`, and three
 * shapes reach it: a positional zip that came up short (`results[i]` undefined),
 * a result object carrying no `outcome`, and an outcome this projection has not
 * been taught. The last one is live today — `deduped` is returned when an
 * idempotency claim is not first, and the default store is a process-wide
 * singleton, so the SECOND run in a process reported a deduped outreach as
 * `executed`. `resolved-no-action` (referral) defaulted the same way. Now that
 * this feeds an audited ops attestation, that told an auditor an outreach was
 * sent to a member when nothing was sent.
 *
 * Unrecognised maps to `'unknown'` — a NEGATIVE value, matching every other gate
 * in this tranche. It is preferred to `'rejected'` or `'suppressed'` because
 * those are claims about what the runtime DECIDED; `'unknown'` is the honest
 * statement that this projection cannot say, and it cannot be read as an action
 * having been taken.
 */
export function parseDemoOutcome(result: unknown): AgentDemoOutcome {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) return 'unknown';
  const raw = (result as { outcome?: unknown }).outcome;
  if (typeof raw !== 'string') return 'unknown';
  // An exact, case-sensitive membership test — the same discipline the authority
  // codes use, for the same reason: a near-miss must fail, not approximate.
  return (AGENT_DEMO_OUTCOMES as readonly string[]).includes(raw)
    ? (raw as AgentDemoOutcome)
    : 'unknown';
}

/**
 * Project a settled task result into the PHI-safe demo-action shape.
 *
 * INVARIANT: projection is TOTAL over `AgentTaskKind`. The `const unhandled: never`
 * below fails `tsc --noEmit` the moment a kind is added without a case here.
 *
 * WHAT MAKES THAT TRUE, because it was not true when it was first written. This comment
 * originally claimed the `never` fires for any addition to `AgentTaskKind`, while
 * `DispatchedTask` RESTATED the three kinds as inline literals — so a union addition left
 * `DispatchedTask` unchanged and this switch still compiled. The guard guarded the
 * restatement. `DispatchedTask` is now MAPPED over `AgentTaskKind` (dispatch/types.ts), so
 * the union really is the single source and the `never` really does fire.
 *
 * WHY A SWITCH AND NOT THE TERNARIES IT REPLACED. This was two nested ternaries whose
 * final `else` was PA — so a fourth kind was labelled `advance-pa-documentation` and
 * given `{ thread, event }` refs read off a task that has neither, silently, with no
 * type error. On a governance surface that is not a cosmetic mislabel: the demo screen
 * would show a behavioural-health triage task as a prior-authorisation advancement,
 * and `refs` — the ONLY thing tying a row back to a record — would be `undefined`.
 * `dispatchTasks.ts` and `dispatcher.ts` were converted for the same reason; this was
 * the third PA-defaulting ternary in the dispatch path and the last one.
 */
function projectResult(task: DispatchedTask, result: unknown): AgentDemoAction {
  const outcome = parseDemoOutcome(result);
  const head = { agentId: task.agentId, memberId: task.memberId, outcome };
  switch (task.taskKind) {
    case 'outreach':
      return {
        ...head,
        taskKind: 'outreach',
        actionType: 'send-outreach',
        refs: {
          touchpoint: task.task.touchpoint.touchpointId,
          channel: task.task.touchpoint.channel,
        },
      };
    case 'referral':
      return {
        ...head,
        taskKind: 'referral',
        actionType: 'referral-followup',
        refs: { referral: task.task.referralRef },
      };
    case 'pa':
      return {
        ...head,
        taskKind: 'pa',
        actionType: 'advance-pa-documentation',
        refs: { thread: task.task.threadRef, event: task.task.advanceEvent.type },
      };
    default: {
      // Unreachable while the union is covered. `never` is the assertion: adding a
      // kind to `AgentTaskKind` makes THIS LINE the compile error, at the place that
      // needs a decision, rather than a wrong row on a screen at runtime.
      const unhandled: never = task;
      throw new Error(
        `projectResult: unhandled task kind ${String((unhandled as DispatchedTask).taskKind)}`
      );
    }
  }
}

/** Run the real agents over the seeded SDE demo batch and return the emergent actions. */
export async function runRealAgentDemo(): Promise<RealAgentDemoRun> {
  const demo = loadDemoBatch();
  const batch = runRealDemo();
  // THE GATE IS WIRED HERE, on the only composition root that dispatches. Before
  // this, the demo called the ungated path and every signal in the seeded batch
  // carried `part2Restricted: false` — so the fail-closed assertion never fired,
  // the plane was never exercised, and the demo was green for the wrong reason.
  //
  // AND THE CLASS FLOOR IS WIRED HERE TOO. `classFloorFor` was optional and this
  // root omitted it, so the gate substituted `demographic` for every signal and
  // decided NY MHL §33.13 / PHL Art 27-F material under the baseline HIPAA
  // treatment/payment/operations basis with no consent lookup at all. It binds the
  // ONE supplier over the shipped taxonomy — not a lambda written here, which is
  // how two call sites end up with two different answers.
  const ledger = createDisclosureLedger();
  const { tasks, refusals } = routeBatchGated({
    batch,
    memberContext: demo.memberContext,
    signals: demo.signals,
    disclosure: {
      classFloorFor: taxonomyClassFloor(),
      capabilities: agentCapabilities(),
      basesFor: (memberId) => loadConsentBases(memberId),
      recipientFor: (agentId) => recipientForAgent(agentId),
      ledger,
      nowMs: demo.nowMs,
    },
  });
  const { engine } = createRuntime();
  const handles = runDispatch(engine, tasks);
  await driveAutoApprove(engine, handles, demo.nowMs);
  const results = await Promise.all(handles.map((h) => h.done));
  return {
    actions: tasks.map((t, i) => projectResult(t, results[i])),
    disclosures: { decisions: ledger.all(), refusals },
  };
}
