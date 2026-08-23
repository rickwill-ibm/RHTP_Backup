import {
  createRuntime,
  createInMemoryWorkflowEngine,
  createManualClock,
  createMemoryEventSink,
  createMemoryProposalInbox,
  loadEscalationPolicies,
  type InMemoryWorkflowEngine,
  type ProposedAction,
  type WorkflowDefinition,
} from '@/lib/agentRuntime';
import { parseRegistry, loadAgentManifests, type AgentManifestRegistry } from '@/lib/agents/manifest';
import manifestsJson from '@/lib/agents/manifest/data/agent-manifests.json';

export const START_MS = Date.parse('2026-08-22T00:00:00.000Z');
export const HOUR = 3600_000;

/** Await enough microtasks for the async engine plumbing to settle. */
export async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

/** Poll a predicate across microtask flushes; throws if it never holds. */
export async function waitFor(cond: () => boolean, label = 'condition'): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (cond()) return;
    await Promise.resolve();
  }
  throw new Error(`waitFor: ${label} never held`);
}

/** A one-shot workflow that proposes an action and returns the decision. */
export function proposingWorkflow(
  agentId: string,
  action: ProposedAction,
): WorkflowDefinition<void, string> {
  return {
    name: `propose-${action.actionType}`,
    agentId,
    async run(ctx) {
      const decision = await ctx.proposeAndWait(action);
      return decision.decision;
    },
  };
}

/** Approve the proposal a workflow is currently awaiting. */
export async function approve(
  engine: InMemoryWorkflowEngine,
  workflowId: string,
  decidedBy = 'reviewer:rn-7',
): Promise<void> {
  const proposalId = engine.query(workflowId)?.awaitingProposalId;
  if (!proposalId) throw new Error('approve: workflow is not awaiting a decision');
  await engine.signal(workflowId, { name: 'agent.task.approved', proposalId, decidedBy });
}

/** Reject the proposal a workflow is currently awaiting. */
export async function reject(
  engine: InMemoryWorkflowEngine,
  workflowId: string,
  decidedBy = 'reviewer:rn-7',
): Promise<void> {
  const proposalId = engine.query(workflowId)?.awaitingProposalId;
  if (!proposalId) throw new Error('reject: workflow is not awaiting a decision');
  await engine.signal(workflowId, { name: 'agent.task.rejected', proposalId, decidedBy });
}

/** Build a registry with one agent's autonomyTier overridden (data change, no code). */
export function registryWithTier(agentId: string, tier: string): AgentManifestRegistry {
  const raw = JSON.parse(JSON.stringify(manifestsJson)) as {
    version: string;
    agents: Array<Record<string, unknown>>;
  };
  const agent = raw.agents.find((a) => a.id === agentId);
  if (!agent) throw new Error(`no such agent ${agentId}`);
  agent.autonomyTier = tier;
  return parseRegistry(raw);
}

/** A runtime whose engine uses a specific manifest registry. */
export function runtimeWithRegistry(registry: AgentManifestRegistry): {
  engine: InMemoryWorkflowEngine;
  clock: ReturnType<typeof createManualClock>;
  eventSink: ReturnType<typeof createMemoryEventSink>;
  inbox: ReturnType<typeof createMemoryProposalInbox>;
} {
  const clock = createManualClock(START_MS);
  const eventSink = createMemoryEventSink();
  const inbox = createMemoryProposalInbox();
  const engine = createInMemoryWorkflowEngine({
    clock,
    eventSink,
    inbox,
    registry,
    escalationPolicies: loadEscalationPolicies(),
  });
  return { engine, clock, eventSink, inbox };
}

export { createRuntime, loadAgentManifests };
