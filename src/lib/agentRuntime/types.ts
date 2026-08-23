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

/** The pre-allocated C2 agent-task event types (the ONLY types this lane emits). */
export const AGENT_C2_EVENT_TYPES = [
  'agent.task.proposed',
  'agent.task.approved',
  'agent.task.rejected',
  'agent.task.executed',
  'agent.task.escalated',
] as const;
export type AgentC2EventType = (typeof AGENT_C2_EVENT_TYPES)[number];

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

/** Escalation priority tier (drives the SLA + hierarchy walk). */
export type EscalationPriority = 'urgent' | 'high' | 'routine';

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
  status: 'running' | 'waiting-decision' | 'completed' | 'failed';
  /** The proposalId currently awaiting a decision, if any. */
  awaitingProposalId?: string;
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
   * escalation timers, then suspends. Resolves on `agent.task.approved` (also
   * emitting `agent.task.executed`) or `agent.task.rejected`. Autonomy tier
   * (read from the manifest) decides whether a human signal is required.
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
        `(${AGENT_C2_EVENT_TYPES.join(', ')}); refused "${eventType}"`,
    );
    this.name = 'UnallowedAgentEventError';
  }
}
