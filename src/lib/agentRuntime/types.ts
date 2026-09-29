// CONTRACT: C2  // SEAM: workflow-engine
/**
 * Agent runtime (journey lane, G4) — domain types.
 *
 * A minimal WorkflowEngine behind which a Temporal-class engine drops in (ADR-002).
 * The runtime is deterministic (clock injected), per-member ordered (memberId is
 * the partition key), and its ONE way to act is the HITL primitive `proposeAndWait`:
 * a workflow proposes an action, the runtime emits `agent.task.proposed`, creates
 * an `agent-proposal` work-queue item, and SUSPENDS until a human decision signal
 * (`agent.task.approved` / `agent.task.rejected`) resumes it. Autonomy tier is READ
 * from the manifest and mapped to decision behavior by a data lookup, never a branch.
 *
 * Nothing here keys on a persona: workflows, actions, timers, and escalation are
 * typed data driven by a generic engine (plan §1.2).
 */
import type { AutonomyTier } from '@/lib/agents/manifest';
import type { NeedDomain, ProofScope, QualifiedReviewer } from '@/lib/authz/credentialing';

/** The pre-allocated C2 agent-task event types (the ONLY types this lane emits). */
export const AGENT_C2_EVENT_TYPES = [
  'agent.task.proposed',
  'agent.task.approved',
  'agent.task.rejected',
  /**
   * The workflow SETTLED, carrying the outcome it reported.
   *
   * THIS REPLACED AN `agent.task.executed` EMITTED AT APPROVAL TIME (register G-002) — before
   * `rec.resolve()` let the body resume, and therefore before the body attempted its state
   * transition. The durable C2 record asserted that a thread executed when it may not have advanced,
   * and `PaResult`'s honest `not-advanced` terminal reached only a demo projection, never the stream
   * an auditor reads. The honesty had landed in the shallowest layer and was absent in the deepest.
   *
   * AND THE ENGINE WAS ASSERTING SOMETHING IT COULD NOT KNOW. It performs no effects — `useTool`
   * does. `executed` at approval time was the engine claiming an effect it neither performed nor
   * observed. So it no longer claims one: it records that the workflow settled and copies, verbatim,
   * the outcome string the workflow reported. It parses nothing and understands nothing, which is
   * what keeps domain semantics out of the runtime.
   *
   * A workflow that reports no outcome yields `'unreported'` — an explicitly NEGATIVE record rather
   * than silence or a false affirmative. That is the same negative-sink discipline
   * `parseDemoOutcome` uses, and it is why a body that forgets cannot default to "it worked".
   */
  'agent.task.settled',
  'agent.task.escalated',
  /**
   * The escalation ladder is exhausted and the work item was ABANDONED by the runtime (G-001).
   *
   * Distinct from `escalated` because a parked proposal used to be emitted as one more `escalated`
   * with `hop: 'park'`, on a work item still sitting at `queue: 'escalated'` and `status: 'pending'`
   * — visible, but INDISTINGUISHABLE from a proposal still actively escalating. The defect was
   * mislabelling, not invisibility, and a reviewer scanning the escalated queue had no way to tell a
   * live item from a dead one.
   */
  'agent.task.abandoned',
] as const;
export type AgentC2EventType = (typeof AGENT_C2_EVENT_TYPES)[number];

/**
 * The statuses from which a workflow never moves again.
 *
 * WHY THIS EXISTS AS A CONST AND NOT AS `=== 'completed' || === 'failed'` AT EACH SITE. W8 added
 * `'abandoned'` to `WorkflowSnapshot['status']`. This file argues at length (see `HumanDecision`)
 * that abandonment must NOT be a widened `HumanDecision`, because every consumer tests for
 * `'rejected'` and treats everything else as approval, so the widening would compile clean. The
 * same trap was then walked into one union over: two sites tested for specific terminal members and
 * treated everything else as "keep waiting", and neither produced a compile error.
 *
 *   - `driveAutoApprove` accepted only completed|failed, so an abandoned workflow was never
 *     `allSettled` and the loop spun its full iteration budget before falling out.
 *   - `awaitSuspension` tested waiting-decision|failed, so an abandoned workflow fell through its
 *     turn cap and threw "never suspended within N turns" — a wrong diagnosis on a fail-closed path
 *     that a route maps to a 500.
 *
 * One const, one predicate, and a `satisfies` that makes the next added status a compile error at
 * the definition rather than a silent behaviour change at two call sites.
 */
export const TERMINAL_STATUSES = ['completed', 'failed', 'abandoned'] as const;

export function isTerminalStatus(s: WorkflowSnapshot['status'] | undefined): boolean {
  return s !== undefined && (TERMINAL_STATUSES as readonly string[]).includes(s);
}

/** A PHI-safe agent-task event (C2 envelope subset; partitionKey = memberId). */
export interface AgentTaskEvent {
  eventType: AgentC2EventType;
  memberId: string;
  /** Partition key — always the memberId (per-member ordering, C6). */
  partitionKey: string;
  workflowId: string;
  proposalId?: string;
  agentId: string;
  occurredAtMs: number;
  correlationId: string;
  causationId?: string;
  /** PHI-safe: refs + codes only, never free-text member payload. */
  payload: Record<string, unknown>;
}

/** Where agent-task events are published. In-memory for tests; outbox in prod. */
export interface AgentEventSink {
  emit(event: AgentTaskEvent): Promise<void>;
}

/**
 * Escalation priority tier (drives the SLA + hierarchy walk).
 *
 * C6: `deadline-unknown` is a DISTINCT recovery sentinel — a recovery whose payer
 * appeal-window deadline could not be parsed, so it needs human triage. It is NOT the
 * genuine `high` band (propensity `high`, a reconciliation escalation), which is why the
 * two are no longer conflated. Escalation SLA lookup normalizes `deadline-unknown` to the
 * `high` tier (`getEscalationTier`), so a deadline-unknown recovery keeps the high-urgency
 * triage SLA the old overloaded `high` fallback gave it — without overloading the band name.
 */
export type EscalationPriority = 'urgent' | 'high' | 'routine' | 'deadline-unknown';

/**
 * An action a workflow proposes for a human decision (HITL). PHI-safe: it names
 * the action kind + references + codes; it carries no free-text member payload.
 */
export interface ProposedAction {
  /** What kind of action (e.g. 'send-outreach', 'submit-pa'). Code, not prose. */
  actionType: string;
  /** Escalation priority tier for the SLA + hierarchy walk. */
  priority: EscalationPriority;
  /** PHI-safe references (resource ids, codes) explaining the proposal. */
  refs?: Record<string, string>;
  /** A short, code-level summary for the reviewer (no free-text PHI). */
  summary?: string;
  /**
   * Which of 42 CFR 438.210(b)(3)'s three need domains this action addresses — medical, behavioral
   * health, or LTSS.
   *
   * DELIBERATELY UNDEFAULTED for an adverse action: a reviewer attested for `medical` is not thereby
   * attested for behavioral health or LTSS, and silently defaulting would let a medical attestation
   * satisfy a behavioral-health denial — precisely the substitution the rule exists to prevent, and
   * the shape of the error this programme already retracted once ("qualified physician decider").
   * A NON-adverse action does not need one; `engine.propose` refuses an adverse one that omits it.
   */
  needDomain?: NeedDomain;
  /**
   * Wave-3 MED-3 (additive, optional): true when this action is a payer-facing
   * SUBMISSION (transmit/rebill/appeal-submit). A submission ALWAYS requires a
   * qualified human regardless of autonomy tier — the runtime auto-approve gate
   * (`isAutoApprovable`) refuses it even at HOTL/autonomous. Existing actions omit
   * the field → unchanged behavior. This mirrors the workflow-level `isSubmission`
   * on the twin-ladder interlock so the DURABLE runtime gate carries the same
   * guarantee the workflow asserts.
   */
  isSubmission?: boolean;
}

/** The outcome of a human (or auto, for non-HITL tiers) decision on a proposal. */
export interface HumanDecision {
  decision: 'approved' | 'rejected';
  /** Who decided (attributed). For auto-approval this is the manifest tier actor. */
  decidedBy: string;
  proposalId: string;
  decidedAtMs: number;
}

/** A deterministic timer request (fires via the injected clock, never wall time). */
export interface TimerSpec {
  /** Delay from now, in milliseconds. */
  delayMs: number;
  /** Opaque reason tag for audit (e.g. 'escalation:urgent'). */
  reason: string;
}

/** A running workflow's observable state (visibility / query). */
export interface WorkflowSnapshot {
  workflowId: string;
  memberId: string;
  agentId: string;
  /**
   * `abandoned` is a GOVERNANCE TERMINAL, not a crash and not a decision.
   *
   * The escalation ladder exhausted without a human. The instance is TERMINATED from the engine side
   * — the body's `await` is left dangling, which is the honest representation because the body
   * genuinely never ran further. It is deliberately NOT modelled by resolving the proposal with a
   * synthesised `HumanDecision`: `decision` is `'approved' | 'rejected'`, every consumer tests for
   * `'rejected'` and treats everything else as approval (`paAgent.ts:76`, `referralAgent.ts:65`,
   * `governedAction.ts:299`), so widening that union would have compiled clean and routed an
   * abandoned proposal straight into the execution branch. And `'rejected'` would be worse still: a
   * timer-manufactured adverse benefit determination carrying 42 CFR 438.404 notice and appeal
   * duties that nothing discharges.
   */
  status: 'running' | 'waiting-decision' | 'completed' | 'failed' | 'abandoned';
  /** The proposalId currently awaiting a decision, if any. */
  awaitingProposalId?: string;
  /**
   * What a proof resolving that proposal must cover: the determination class and the need domain.
   *
   * Published so a caller can mint the RIGHT proof rather than guessing. Without it a driver mints
   * one proof for the whole batch and hopes every proposal happens to match — which is what the demo
   * driver did, safely only by accident of today's seed being all-medical.
   */
  awaitingScope?: ProofScope;
  startedAtMs: number;
  updatedAtMs: number;
  result?: unknown;
  error?: string;
}

/** The context a workflow body runs against (delegates to the engine). */
export interface WorkflowContext {
  readonly workflowId: string;
  readonly memberId: string;
  readonly agentId: string;
  readonly correlationId: string;
  /** Deterministic now (the injected clock). */
  now(): number;
  /**
   * HITL primitive: propose an action and WAIT for a human decision. Emits
   * `agent.task.proposed`, creates an `agent-proposal` work-queue item, registers
   * escalation timers, then suspends. Resolves on `agent.task.approved` (carrying
   * `effectPending: true` — the effect has NOT happened yet) or `agent.task.rejected`.
   * Autonomy tier (read from the manifest) decides whether a human signal is required.
   * If the escalation ladder is exhausted first the workflow is ABANDONED and this
   * promise never resolves; a decision arriving afterwards is refused loudly.
   */
  proposeAndWait(action: ProposedAction): Promise<HumanDecision>;
  /**
   * Invoke a tool by id. Enforced against the agent's manifest allowlist BEFORE
   * the effect runs (least privilege, §10.3); throws ToolNotAllowedError otherwise.
   */
  useTool<T>(tool: string, fn: () => T | Promise<T>): Promise<T>;
  /** Schedule a deterministic timer for this workflow. Returns a timer id. */
  setTimer(spec: TimerSpec): string;
  /** The governing manifest (autonomy tier is READ here, never branched by the engine). */
  autonomyTier(): AutonomyTier;
}

/** A workflow definition: a named body governed by an agent manifest. */
export interface WorkflowDefinition<I = unknown, O = unknown> {
  name: string;
  /** The agent id whose manifest governs this workflow (authority source). */
  agentId: string;
  run(ctx: WorkflowContext, input: I): Promise<O>;
}

/** Options to start a workflow. `workflowId` is derived deterministically if absent. */
export interface StartOptions<I = unknown> {
  memberId: string;
  input: I;
  /** Explicit workflow id (else derived from agentId+memberId+seq, deterministic). */
  workflowId?: string;
  correlationId?: string;
}

/** A handle to a started workflow. `done` resolves when the workflow completes. */
export interface WorkflowHandle<O = unknown> {
  workflowId: string;
  memberId: string;
  /** Resolves with the workflow result (or rejects on workflow failure). */
  done: Promise<O>;
}

/** A signal delivered to a running workflow (the human decision path). */
export interface WorkflowSignal {
  name: 'agent.task.approved' | 'agent.task.rejected';
  proposalId: string;
  decidedBy: string;
  /**
   * PROOF that `decidedBy` is a qualified reviewer, minted by
   * `@/lib/authz/credentialing.assertReviewerQualified` and unforgeable outside it.
   *
   * REQUIRED whenever the proposal took the human-required path (an adverse coverage action, or a
   * HITL tier) — `engineSupport.assertSignalDecider` refuses the signal without it. Optional in the
   * type because a non-human-required proposal does not need one, and because making it required
   * everywhere would push callers toward minting a proof for resolutions that do not warrant one.
   */
  reviewer?: QualifiedReviewer;
}

/**
 * The workflow engine (ADR-002). start / signal / query / setTimer / complete.
 * The in-memory fake implements this for tests; a Temporal-class engine drops in
 * at the `// SEAM: workflow-engine` anchor with the SAME interface.
 */
export interface WorkflowEngine {
  /** Start a workflow instance. Deterministic; per-member ordered. */
  start<I, O>(def: WorkflowDefinition<I, O>, opts: StartOptions<I>): WorkflowHandle<O>;
  /** Deliver a human decision signal (resumes a suspended workflow). Per-member ordered. */
  signal(workflowId: string, signal: WorkflowSignal): Promise<void>;
  /** Synchronous visibility read of a workflow's state. */
  query(workflowId: string): WorkflowSnapshot | undefined;
  /** Schedule a deterministic timer for a workflow; returns the timer id. */
  setTimer(workflowId: string, spec: TimerSpec): string;
  /** Force-complete a workflow terminally. */
  complete(workflowId: string, result?: unknown): Promise<void>;
}

/** Raised when the runtime is asked to emit a non-pre-allocated event type. */
export class UnallowedAgentEventError extends Error {
  constructor(public readonly eventType: string) {
    super(
      `Agent runtime may only emit the pre-allocated C2 event types ` +
        `(${AGENT_C2_EVENT_TYPES.join(', ')}); refused "${eventType}"`
    );
    this.name = 'UnallowedAgentEventError';
  }
}
