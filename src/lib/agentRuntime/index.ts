// CONTRACT: C2  // SEAM: workflow-engine  // SEAM: agentRuntime  (dataMode)
/**
 * Agent runtime (journey lane, G4) — public surface (ADR-002).
 *
 * A minimal WorkflowEngine (start/signal/query/setTimer/complete), deterministic
 * and per-member ordered, with the HITL primitive `proposeAndWait`. Ships an
 * in-memory fake engine for tests behind a documented Temporal seam
 * (`// SEAM: workflow-engine`), manifest-governed least privilege, and
 * escalation-as-data. See FAKE_FIDELITY.md for what the fake does NOT model.
 *
 * dataMode seam `agentRuntime`: mock returns the demo's authored agent actions
 * (the demo stays green); production runs the real runtime engine.
 */
import { getDataMode, type DataMode } from '@/lib/config/dataMode';
import { loadAgentManifests } from '@/lib/agents/manifest';
import { createManualClock, type ManualClock } from './clock';
import { createInMemoryWorkflowEngine, InMemoryWorkflowEngine, type RuntimeDeps } from './engine';
import { createMemoryEventSink, type MemoryEventSink } from './events';
import { createMemoryProposalInbox, type ProposalInbox } from './inbox';
import { loadEscalationPolicies } from './escalation';

// ── Types ──────────────────────────────────────────────────────────────────────
export type {
  WorkflowEngine,
  WorkflowDefinition,
  WorkflowContext,
  WorkflowHandle,
  WorkflowSnapshot,
  WorkflowSignal,
  StartOptions,
  ProposedAction,
  HumanDecision,
  TimerSpec,
  EscalationPriority,
  AgentTaskEvent,
  AgentEventSink,
  AgentC2EventType,
} from './types';
export { AGENT_C2_EVENT_TYPES, UnallowedAgentEventError } from './types';

// ── Engine (the fake) ────────────────────────────────────────────────────────
export { createInMemoryWorkflowEngine, InMemoryWorkflowEngine, type RuntimeDeps } from './engine';

// ── Events ──────────────────────────────────────────────────────────────────────
export { createMemoryEventSink, buildAgentEvent, assertAllowedEventType, type MemoryEventSink } from './events';

// ── HITL inbox (work-queue reuse) ────────────────────────────────────────────
export {
  createMemoryProposalInbox,
  buildProposalWorkItem,
  type ProposalInbox,
  type PendingProposal,
} from './inbox';

// ── Escalation-as-data ────────────────────────────────────────────────────────
export {
  loadEscalationPolicies,
  parseEscalationPolicies,
  getEscalationTier,
  nextEscalationStep,
  EscalationPolicyError,
  type EscalationPolicies,
  type EscalationPolicySet,
  type EscalationTier,
  type EscalationStep,
} from './escalation';

// ── Clock ────────────────────────────────────────────────────────────────────
export { createManualClock, type ManualClock } from './clock';

/**
 * Assemble a runtime with default in-memory deps (fake engine, memory event sink,
 * memory HITL inbox, default manifest registry, default escalation policies). The
 * caller supplies a ManualClock (or one is created at `startMs`) for determinism.
 */
export function createRuntime(opts?: {
  clock?: ManualClock;
  startMs?: number;
  inbox?: ProposalInbox;
  eventSink?: MemoryEventSink;
}): {
  engine: InMemoryWorkflowEngine;
  clock: ManualClock;
  eventSink: MemoryEventSink;
  inbox: ProposalInbox;
} {
  const clock = opts?.clock ?? createManualClock(opts?.startMs ?? Date.parse('2026-08-22T00:00:00.000Z'));
  const eventSink = opts?.eventSink ?? createMemoryEventSink();
  const inbox = opts?.inbox ?? createMemoryProposalInbox();
  const deps: RuntimeDeps = {
    clock,
    eventSink,
    inbox,
    registry: loadAgentManifests(),
    escalationPolicies: loadEscalationPolicies(),
  };
  return { engine: createInMemoryWorkflowEngine(deps), clock, eventSink, inbox };
}

/** The `agentRuntime` dataMode: mock = authored actions, production = real runtime. */
export function agentRuntimeMode(): DataMode {
  return getDataMode('agentRuntime');
}
