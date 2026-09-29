/**
 * Internal support types + the autonomy behavior table for the in-memory engine.
 * Split out of engine.ts to keep each file under the size cap; not part of the
 * public surface (index.ts re-exports only RuntimeDeps).
 */
import { isAdverseCoverageAction, isNonAutomatedDecider } from '@/lib/agents/governance';
import { isMintedProof, proofCovers, type NeedDomain } from '@/lib/authz/credentialing';
import type { WorkflowSignal } from './types';
import type { AgentManifestRegistry, AutonomyTier } from '@/lib/agents/manifest';
import type { WorkItem } from '@/lib/goldenThread/workQueue';
import type { ManualClock } from './clock';
import type { EscalationPolicies, EscalationTier } from './escalation';
import type { AgentEventSink, HumanDecision, ProposedAction, WorkflowSnapshot } from './types';
import type { ProposalInbox } from './inbox';

/** Decision behavior per autonomy tier — DATA, not a branch (§10.5). */
export type AutoApprove = 'never' | 'immediate' | 'after-sla';
export const AUTONOMY_BEHAVIOR: Record<AutonomyTier, { autoApprove: AutoApprove }> = {
  HITL: { autoApprove: 'never' }, //        a human must approve every action
  HOTL: { autoApprove: 'after-sla' }, //    auto-approve after the review window unless rejected
  autonomous: { autoApprove: 'immediate' }, // auto-approve immediately
};

/** Everything the in-memory engine needs injected (determinism via ManualClock). */
export interface RuntimeDeps {
  clock: ManualClock;
  eventSink: AgentEventSink;
  inbox: ProposalInbox;
  registry: AgentManifestRegistry;
  escalationPolicies: EscalationPolicies;
}

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
  settled: boolean;
}

export function defer<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject, settled: false };
}

/** A suspended HITL proposal awaiting a decision (or escalating toward a park). */
export interface PendingRecord {
  proposalId: string;
  /**
   * This proposal took the HUMAN-REQUIRED path — an adverse coverage action, or a HITL tier. A
   * signal resolving it must carry a `QualifiedReviewer` proof, not merely a decider string.
   */
  humanRequired: boolean;
  /**
   * WHAT KIND of human. Derived from `isAdverseCoverageAction`, NOT from the autonomy tier.
   *
   * These are two independent questions and conflating them broke the control in both directions.
   * Every HITL proposal is human-required, so keying the clinical bar on `humanRequired` demanded a
   * credentialed clinical peer to approve an outreach phone call — work a care-management
   * coordinator does, with no clinical-peer requirement in any statute. Meanwhile an administrative
   * proof (which skips the licence and attestation checks) would have resolved an adverse coverage
   * action, because nothing compared the classes at all.
   */
  determinationClass: 'clinical' | 'administrative';
  /** Which of 438.210(b)(3)'s three need domains this determination addresses. */
  needDomain: NeedDomain;
  workflowId: string;
  memberId: string;
  agentId: string;
  action: ProposedAction;
  correlationId: string;
  tier: EscalationTier;
  hopsSoFar: number;
  item: WorkItem;
  resolve: (d: HumanDecision) => void;
  timerId?: string;
}

/**
 * A decision arrived for a proposal whose WORKFLOW has already reached a terminal state.
 *
 * WHY THIS IS LOUD AND NOT A SILENT NO-OP, and why it exists at all. The abandonment terminal leaves
 * the pending record in place so the parked row stays actionable-looking to a reviewer. The first cut
 * of that design claimed the row was therefore "re-activatable". It was worse than that: the workflow
 * body is still suspended on `decided.promise`, so resolving the record would have RESUMED IT — the
 * body would have run its `useTool` effect (an outreach send, a referral write) after the runtime had
 * already declared the work abandoned, and `settle()` would then early-return on the
 * already-settled instance, so the effect would never reach the event stream at all. A side effect
 * invisible to the audit record is the exact failure this wave exists to remove.
 *
 * So the record survives for VISIBILITY, not for resumption: a reviewer who acts on a parked row gets
 * an explicit refusal naming the terminal state, instead of a silent return that looks like success.
 * Re-activation is a human act — re-file the work — not a mechanism this runtime provides.
 */
export class WorkflowTerminatedError extends Error {
  constructor(
    readonly proposalId: string,
    readonly status: string
  ) {
    super(
      `proposal ${proposalId}: the workflow is already ${status}; a decision cannot resume it. ` +
        'Re-file the work item — the runtime provides no re-activation path.'
    );
    this.name = 'WorkflowTerminatedError';
  }
}

export interface TimerEntry {
  id: string;
  memberId: string;
  dueAtMs: number;
  seq: number;
  cancelled: boolean;
  fire: () => Promise<void>;
}

export interface Instance {
  snapshot: WorkflowSnapshot;
  done: Deferred<unknown>;
  /** Join key back to the approval. `decide()` deletes the pending record before the body resumes,
   *  so without this the settle event has no way to reference the proposal it settles. */
  agentId: string;
  memberId: string;
  correlationId: string;
  lastProposalId?: string;
}

/**
 * THE CLOSED OUTCOME VOCABULARY a settle event may carry.
 *
 * WHY A MEMBERSHIP TEST AND NOT A VERBATIM COPY. The first cut returned any string the workflow
 * handed back, and its own docstring claimed this was "the same negative-sink discipline
 * `parseDemoOutcome` uses". It was the inverse: `parseDemoOutcome` tests membership against a closed
 * set and sinks everything else to `'unknown'`; this copied anything. `AgentTaskEvent`'s payload is
 * declared "PHI-safe: refs + codes only, never free-text member payload" — so a body returning
 * `not-advanced: member Jane Q refused, PCP Dr. Alvarez` (the natural shape, given `PaResult`
 * already carries free-text reasons) wrote that string verbatim into a durable C2 event, past the
 * type system, past every gate. A comment claiming a control that its own function did not perform
 * is this programme's recurring defect, asserted on the one function the wave's honesty rests on.
 *
 * The set is the UNION of the three agent result vocabularies plus the runtime's own terminals. The
 * engine still parses nothing and understands nothing — it recognises a code or it does not, which
 * is what keeps domain semantics out of the runtime while keeping free text out of the stream.
 */
export const SETTLED_OUTCOMES = [
  'executed',
  'not-advanced',
  'rejected',
  'suppressed',
  'deduped',
  'resolved-no-action',
  'abandoned',
  /** The workflow settled and reported nothing recognisable. Explicitly negative, never affirmative. */
  'unreported',
  /** The workflow threw. Carries no error text — the message may name a member. */
  'errored',
] as const;

export type SettledOutcome = (typeof SETTLED_OUTCOMES)[number];

const OUTCOME_SET = new Set<string>(SETTLED_OUTCOMES);

/**
 * The outcome code a settle event carries.
 *
 * A workflow that reports nothing, or reports something outside the vocabulary, yields
 * `'unreported'` — an explicitly NEGATIVE record rather than silence or a false affirmative. A body
 * that forgets, or that invents a new terminal without adding it here, cannot default to "it worked".
 */
export function settledOutcome(result: unknown): SettledOutcome {
  const raw =
    typeof result === 'string'
      ? result
      : result && typeof result === 'object' && 'outcome' in result
        ? (result as { outcome: unknown }).outcome
        : undefined;
  return typeof raw === 'string' && OUTCOME_SET.has(raw) ? (raw as SettledOutcome) : 'unreported';
}

/** Why a resolution signal was refused. Typed so a caller can tell the three apart. */
export type SignalRefusalCode =
  | 'reviewer-proof-absent'
  | 'proof-not-minted'
  | 'decider-mismatch'
  | 'proof-scope-mismatch'
  | 'automated-decider';

/**
 * A resolution signal the engine refused to act on.
 *
 * PHI-safe: the proposal id and a code, nothing about the member or the reviewer's credentials.
 */
export class UnqualifiedSignalError extends Error {
  constructor(
    readonly code: SignalRefusalCode,
    readonly proposalId: string
  ) {
    super(`resolution signal refused (${code}) for proposal ${proposalId}`);
    this.name = 'UnqualifiedSignalError';
  }
}

/**
 * THE GATE ON THE ENGINE'S RESOLUTION PATH (register G-045).
 *
 * WHAT WAS WRONG. `signal()` read `signal.decidedBy` and handed it straight to `decide()`. Nothing
 * validated it — not `isNonAutomatedDecider`, which is never called on this path, not anything.
 * `isAutoApprovable` correctly refuses to auto-approve an adverse coverage action and routes it to
 * `'human-required'`, and then ANY string resolved it: `''`, `'system'`, even
 * `'autonomy:autonomous'`. And it was reachable over HTTP — `agents/demo/index.ts` signalled with the
 * literal `'demo-reviewer'`, from a function `/api/ops/agents/actions` calls whenever the agent
 * runtime is in production mode. The tier-independent invariant the decision gate declares was
 * enforced by `isAutoApprovable` refusing to auto-approve, and by nothing at all validating the human
 * signal that replaced it.
 *
 * WHY IT BINDS HERE AND NOT AT A ROUTE. Eight paths can reach a resolution; only one is
 * `/api/pa/decision`. Wiring the route alone is the G-035 defect with the polarity flipped — there,
 * the control existed and only a self-test called it; here, it would exist at a route the engine does
 * not go through. Routes are now defence in depth.
 *
 * The proof cannot be forged: `QualifiedReviewer` carries an unexported brand symbol, so the only
 * way to obtain one is `assertReviewerQualified`, which resolves the credentialing record itself.
 */
export function assertSignalDecider(
  rec: Pick<PendingRecord, 'proposalId' | 'humanRequired' | 'determinationClass' | 'needDomain'>,
  signal: Pick<WorkflowSignal, 'decidedBy' | 'reviewer'>
): void {
  if (rec.humanRequired) {
    if (!signal.reviewer) throw new UnqualifiedSignalError('reviewer-proof-absent', rec.proposalId);
    // THE RUNTIME CHECK, and it is the one that survives a cast. The brand on `QualifiedReviewer` is
    // erased at compile time, so at runtime a proof is an ordinary object: an `as` cast, a spread of
    // a real proof, or an object parsed from JSON at a future HTTP boundary all satisfy the type.
    // `isMintedProof` asks the minting module whether it actually made this object.
    if (!isMintedProof(signal.reviewer))
      throw new UnqualifiedSignalError('proof-not-minted', rec.proposalId);
    // `decidedBy` is what the audit record will carry. If it disagrees with the proof, the record
    // would attribute the decision to someone the proof does not cover.
    if (signal.reviewer.reviewerRef !== signal.decidedBy)
      throw new UnqualifiedSignalError('decider-mismatch', rec.proposalId);
    // AND THE PROOF MUST COVER THIS DETERMINATION. Without this the proof's entire payload —
    // determination class, need domain, licence verdict — is decorative at the only point that
    // matters: an `administrative` proof, minted with no licence and no attestation check, resolved
    // a clinical adverse determination, and a `medical` proof resolved a behavioral-health one.
    if (
      !proofCovers(signal.reviewer, {
        determinationClass: rec.determinationClass,
        needDomain: rec.needDomain,
      })
    )
      throw new UnqualifiedSignalError('proof-scope-mismatch', rec.proposalId);
    return;
  }
  // Not human-required: still an external resolution, so it must at least not be an autonomy actor
  // or a placeholder identity.
  if (!isNonAutomatedDecider(signal.decidedBy))
    throw new UnqualifiedSignalError('automated-decider', rec.proposalId);
}

/**
 * Autonomy tier -> decision behavior, via DATA lookup (never a branch on agentId).
 *
 * HW-AI / I16 (C-DEC), the tier-independent invariant: an adverse coverage-affecting action (a
 * denial, termination or reduction) can NEVER auto-resolve, regardless of HITL / HOTL / autonomous —
 * it is forced onto the human path. That kills both the HOTL SLA-timeout auto-approve and the
 * autonomous-tier flip for adverse determinations, which qualified humans must make.
 *
 * Extracted from `engine.propose` so the engine stays inside its size baseline, and so the one place
 * that decides "does this need a human" sits beside the one place that enforces it
 * (`assertSignalDecider`).
 */
export function decisionBehavior(
  autoApprovable: boolean,
  tierBehavior: AutoApprove
): 'immediate' | 'after-sla' | 'human-required' {
  // A tier whose own auto-approve is 'never' (HITL) lands on the human path too — the two reasons an
  // action needs a human are independent, and either one alone is sufficient.
  if (!autoApprovable || tierBehavior === 'never') return 'human-required';
  return tierBehavior;
}

/**
 * WHAT KIND of determination this action is, and for which need domain.
 *
 * Derived from `isAdverseCoverageAction`, NOT from the autonomy tier. Every HITL proposal is
 * human-required, so keying the clinical bar on that demanded a credentialed clinical peer to
 * approve an outreach phone call — work a care-management coordinator does, with no clinical-peer
 * requirement in any statute — while an administrative proof still resolved an adverse coverage
 * action because nothing compared the classes. Two independent questions, answered separately.
 *
 * REFUSES an adverse action that declares no need domain, rather than defaulting one. A reviewer
 * attested for `medical` is not thereby attested for behavioral health or LTSS, and a default here
 * would let a medical attestation satisfy a behavioral-health denial in every such proposal.
 */
export function determinationScope(action: ProposedAction): {
  determinationClass: 'clinical' | 'administrative';
  needDomain: NeedDomain;
} {
  if (!isAdverseCoverageAction(action))
    return { determinationClass: 'administrative', needDomain: action.needDomain ?? 'medical' };
  if (!action.needDomain)
    throw new Error(
      `propose: adverse action "${action.actionType}" must declare needDomain ` +
        '(medical | behavioral-health | ltss) — a reviewer attested for one is not attested for another'
    );
  return { determinationClass: 'clinical', needDomain: action.needDomain };
}

/**
 * Publish (or clear) what a snapshot is awaiting: the proposal id and the SCOPE a proof must cover.
 *
 * The scope is published so a driver can mint the RIGHT proof rather than guessing. Without it the
 * demo driver minted one `clinical`/`medical` proof for the whole batch and reused it on every
 * proposal — safe only by accident of today's seed being all-medical.
 */
export function setAwaiting(
  snapshot: WorkflowSnapshot,
  proposalId?: string,
  scope?: WorkflowSnapshot['awaitingScope']
): void {
  if (proposalId) snapshot.awaitingProposalId = proposalId;
  else delete snapshot.awaitingProposalId;
  if (scope) snapshot.awaitingScope = scope;
  else delete snapshot.awaitingScope;
}
