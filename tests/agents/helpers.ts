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
import {
  agentCapabilities,
  loadAgentManifests,
  type AgentManifestRegistry,
} from '@/lib/agents/manifest';
import { createDisclosureLedger } from '@/lib/agents/disclosure';
import {
  assertReviewerQualified,
  SEED_EPOCH_MS,
  type QualifiedReviewer,
} from '@/lib/authz/credentialing';
import { taxonomyClassFloor } from '@/lib/sde';
import type { Touchpoint } from '@/lib/sde';
import type { DisclosedTouchpoint, DisclosureGateDeps } from '@/lib/agents/dispatch';
import { loadConsentBases, recipientForAgent } from '@/lib/agents/demo/disclosureSources';
// Deliberately NOT from the barrel: parsing under an explicit lock is not
// application API, and importing it by path is the visible cost of using it.
import { parseRegistryUnderLock } from '@/lib/agents/manifest/registry';
import manifestsJson from '@/lib/agents/manifest/data/agent-manifests.json';
import authorityLockJson from '@/lib/agents/authority/data/authority-lock.json';
import type { AuthorityLockFile } from '@/lib/agents/authority';

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
  action: ProposedAction
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

/**
 * A real `QualifiedReviewer` proof for a test, obtained THROUGH THE PRODUCTION DOOR.
 *
 * Tests cannot forge one — the brand symbol is not exported — and this helper does not try. It calls
 * `assertReviewerQualified` against the seeded credentialing directory at the seed's own epoch, which
 * is exactly what a route does with a real source at `clock.now()`. So a test that approves a HITL
 * proposal is exercising the same qualification path production takes, against different data.
 *
 * `Practitioner/dev` is the seed's qualified medical reviewer. Tests needing a refusal ask for one of
 * the seeded reviewers that fails (`Practitioner/expired`, `/restricted`, `/out-of-state`, …).
 */
export function testReviewer(reviewerRef = 'Practitioner/dev'): QualifiedReviewer {
  return assertReviewerQualified(
    reviewerRef,
    {
      kind: 'initial-determination',
      determinationClass: 'clinical',
      needDomain: 'medical',
      licenceJurisdiction: 'NY',
    },
    SEED_EPOCH_MS
  );
}

/** Approve the proposal a workflow is currently awaiting. */
export async function approve(
  engine: InMemoryWorkflowEngine,
  workflowId: string,
  decidedBy = 'Practitioner/dev'
): Promise<void> {
  const proposalId = engine.query(workflowId)?.awaitingProposalId;
  if (!proposalId) throw new Error('approve: workflow is not awaiting a decision');
  await engine.signal(workflowId, {
    name: 'agent.task.approved',
    proposalId,
    decidedBy,
    reviewer: testReviewer(decidedBy),
  });
}

/** Reject the proposal a workflow is currently awaiting. */
export async function reject(
  engine: InMemoryWorkflowEngine,
  workflowId: string,
  decidedBy = 'Practitioner/dev'
): Promise<void> {
  const proposalId = engine.query(workflowId)?.awaitingProposalId;
  if (!proposalId) throw new Error('reject: workflow is not awaiting a decision');
  await engine.signal(workflowId, {
    name: 'agent.task.rejected',
    proposalId,
    decidedBy,
    reviewer: testReviewer(decidedBy),
  });
}

/**
 * Build a registry with one agent's autonomyTier overridden (data change, no code).
 *
 * The AUTHORITY LOCK is widened to match. That is not a way around the gate —
 * it is the only way this state legitimately arises: promoting an agent takes a
 * reviewed lock change AND a manifest change, and the tests below assert that
 * even after BOTH, the interlock still refuses to let an agent set an
 * authoritative domain state. Promoting the manifest alone is refused at load,
 * which tests/agents/authorityGateRuntime.test.ts covers separately.
 */
export function registryWithTier(agentId: string, tier: string): AgentManifestRegistry {
  const raw = JSON.parse(JSON.stringify(manifestsJson)) as {
    version: string;
    agents: Array<Record<string, unknown>>;
  };
  const agent = raw.agents.find((a) => a.id === agentId);
  if (!agent) throw new Error(`no such agent ${agentId}`);
  agent.autonomyTier = tier;
  const lock = JSON.parse(JSON.stringify(authorityLockJson)) as AuthorityLockFile;
  const entry = lock.entries.find((e) => e.agentId === agentId);
  if (!entry) throw new Error(`no lock entry for ${agentId}`);
  entry.maxAutonomyTier = tier;
  return parseRegistryUnderLock(raw, lock);
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

/**
 * The disclosure gate wired from the same seeded sources the demo composition
 * root uses — INCLUDING the taxonomy class-floor supplier. Tests that route the
 * REAL demo batch must supply it: the gate is a required input, and the batch
 * carries a 42 CFR Part 2 signal, so routing it ungated is refused — which is the
 * control working, not a test nuisance.
 *
 * This helper previously omitted `classFloorFor`, reproducing the exact broken
 * composition the shipped root had. A fixture that mirrors the production bug
 * certifies the bug, so the two are now wired the same way on purpose.
 */
/**
 * Brand a touchpoint for a test that is NOT exercising the disclosure plane.
 *
 * THE ONE SANCTIONED CAST. `OutreachTask.touchpoint` is a `DisclosedTouchpoint`, so
 * only `decideTouchpointDisclosure` can produce one — that is the point of the
 * brand. Tests of the outreach workflow itself (HITL gate, idempotency,
 * escalation) need a task without re-running the gate, so the cast lives HERE,
 * once, named, in test code — instead of a `as DisclosedTouchpoint` sprinkled
 * across suites where a reviewer would stop noticing it.
 */
export function disclosedForTest(tp: Touchpoint): DisclosedTouchpoint {
  return tp as DisclosedTouchpoint;
}

export function seededDisclosure(nowMs: number): DisclosureGateDeps {
  return {
    classFloorFor: taxonomyClassFloor(),
    capabilities: agentCapabilities(),
    basesFor: (memberId) => loadConsentBases(memberId),
    recipientFor: (agentId) => recipientForAgent(agentId),
    ledger: createDisclosureLedger(),
    nowMs,
  };
}
