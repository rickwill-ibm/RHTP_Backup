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

/** A concrete task the dispatcher produced, tagged by kind (discriminated union). */
export type DispatchedTask =
  | { agentId: string; taskKind: 'outreach'; memberId: string; routeId: string; task: OutreachTask }
  | { agentId: string; taskKind: 'referral'; memberId: string; routeId: string; task: ReferralTask }
  | { agentId: string; taskKind: 'pa'; memberId: string; routeId: string; task: PaTask };

/** Raised loudly when the routing data is malformed (house pattern, no silent default). */
export class AgentRoutingError extends Error {
  constructor(
    public readonly field: string,
    detail: string,
  ) {
    super(`Agent routing invalid at "${field}": ${detail}`);
    this.name = 'AgentRoutingError';
  }
}
