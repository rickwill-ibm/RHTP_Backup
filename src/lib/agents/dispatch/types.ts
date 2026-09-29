/**
 * Agent dispatcher — domain types.
 *
 * The dispatcher routes an SDE disposition batch to the right agent by trigger/type.
 * The routing is DATA (data/agent-routing.json): a match rule (actionability and/or
 * a signal-kind prefix) maps to an agent id + task kind, with an optional per-agent
 * template. Nothing here keys on a persona in code — the code applies data rules.
 */
import type { PaEvent, PaState } from '@/lib/workflow/paMachine';
import type { OutreachTask } from '@/lib/agents/outreach';
import type { ReferralTask } from '@/lib/agents/referral';
import type { PaTask } from '@/lib/agents/pa';

/** The three task kinds a route may produce. */
export type AgentTaskKind = 'outreach' | 'referral' | 'pa';

/**
 * INVARIANT: the runtime task-kind vocabulary is DERIVED from `AgentTaskKind`, never
 * restated. `Record<AgentTaskKind, true>` is exhaustive, so a member added to the
 * union without a key here fails `tsc --noEmit` ON THIS LITERAL — the type checker,
 * not a reviewer, keeps every validator in step with the type.
 *
 * WHY THIS EXISTS AND WHY IT LIVES HERE. `routingSchema.ts` restated the vocabulary
 * as `['outreach','referral','pa']: string[]`, and the ADL authoring layer typed
 * `RouteDefinition.taskKind` as an open `string`. So a kind authored into a
 * `.agent.json` compiled, emitted, and passed `adl:check` byte-identically and
 * `tsc --noEmit` cleanly — and then `parseAgentRouting` rejected the route at MODULE
 * LOAD, which throws before any dispatch. The blast radius was every dispatch in the
 * process, not the one new route. One derived set, imported by both the runtime
 * parser and the authoring schema, is what closes that.
 */
const AGENT_TASK_KIND_SET: Record<AgentTaskKind, true> = {
  outreach: true,
  referral: true,
  pa: true,
};

/** The closed task-kind vocabulary, for membership tests in hand validators. */
export const AGENT_TASK_KINDS: readonly string[] = Object.keys(AGENT_TASK_KIND_SET);

/** Narrow an untrusted string to `AgentTaskKind` (the one membership test). */
export function isAgentTaskKind(v: unknown): v is AgentTaskKind {
  return typeof v === 'string' && AGENT_TASK_KINDS.includes(v);
}

/** A match rule against a signal (all present fields must hold; first match wins). */
export interface RouteMatch {
  /** Matches when signal.actionability equals this value. */
  actionability?: string;
  /** Matches when signal.kind starts with this prefix. */
  kindPrefix?: string;
}

/** A PA task template carried by a route (the non-authoritative advancement to apply). */
export interface PaRouteTemplate {
  currentState: PaState;
  advanceEvent: PaEvent;
}

/** One routing rule: a trigger match -> an agent + task kind (+ optional template). */
export interface AgentRoute {
  id: string;
  agentId: string;
  taskKind: AgentTaskKind;
  match: RouteMatch;
  /** Required when taskKind === 'pa': the documentation advancement to propose. */
  pa?: PaRouteTemplate;
}

/** The whole routing table (versioned, additive data). */
export interface AgentRouting {
  version: string;
  routes: AgentRoute[];
}

/**
 * The task payload each kind carries. THE single place a kind is bound to its shape.
 *
 * INVARIANT: exhaustive over `AgentTaskKind` — a union member with no key here fails
 * `tsc --noEmit` on this literal, and because `DispatchedTask` and `AgentWorkflows` are
 * both mapped over it, one union addition breaks every site that must then decide
 * something: the payload, the task builder, the workflow, and the projections.
 *
 * WHY THIS REPLACED THREE HAND-WRITTEN MEMBERS. `DispatchedTask` used to RESTATE
 * `'outreach' | 'referral' | 'pa'` as three inline literals. So `AgentTaskKind` was the
 * single source of truth only for the validators — adding a kind left `DispatchedTask`
 * unchanged, which meant the `const unhandled: never` in `demo/index.ts` did NOT fire,
 * while its comment claimed it would. An exhaustiveness guard over a restated union
 * guards the restatement, not the union.
 */
export interface AgentTaskPayload {
  outreach: OutreachTask;
  referral: ReferralTask;
  pa: PaTask;
}

/** A concrete task the dispatcher produced, tagged by kind (discriminated union). */
export type DispatchedTask = {
  [K in AgentTaskKind]: {
    agentId: string;
    taskKind: K;
    memberId: string;
    routeId: string;
    task: AgentTaskPayload[K];
  };
}[AgentTaskKind];

/** Raised loudly when the routing data is malformed (house pattern, no silent default). */
export class AgentRoutingError extends Error {
  constructor(
    public readonly field: string,
    detail: string
  ) {
    super(`Agent routing invalid at "${field}": ${detail}`);
    this.name = 'AgentRoutingError';
  }
}
