/**
 * Internal support types + the autonomy behavior table for the in-memory engine.
 * Split out of engine.ts to keep each file under the size cap; not part of the
 * public surface (index.ts re-exports only RuntimeDeps).
 */
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
  workflowId: string;
  memberId: string;
  agentId: string;
  action: ProposedAction;
  correlationId: string;
  tier: EscalationTier;
  hopsSoFar: number;
  parked: boolean;
  item: WorkItem;
  resolve: (d: HumanDecision) => void;
  timerId?: string;
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
}
