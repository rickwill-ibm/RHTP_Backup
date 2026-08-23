/**
 * Agent dispatcher (thin composition root).
 *
 * Given an SDE disposition batch, route each APPROVED action to the right agent by
 * trigger/type. Routing is data (data/agent-routing.json): a match rule maps a
 * signal to an agent id + task kind; the dispatcher applies the rule and builds the
 * concrete workflow input. Outreach groups by the SDE-composed coordinated
 * touchpoint (one task per touchpoint); referral/PA route per approved disposition.
 *
 * Nothing here keys on a persona in code — the trigger->agent map and the PA
 * advancement template are data; the code is a generic apply-and-start.
 */
import type {
  StartOptions,
  WorkflowDefinition,
  WorkflowEngine,
  WorkflowHandle,
} from '@/lib/agentRuntime';
import { isApproved, type DispositionBatch, type MemberContext, type Signal } from '@/lib/sde';
import { createOutreachWorkflow, type OutreachResult, type OutreachTask } from '@/lib/agents/outreach';
import { createReferralWorkflow, type ReferralResult, type ReferralState, type ReferralTask } from '@/lib/agents/referral';
import { createPaWorkflow, type PaResult, type PaTask } from '@/lib/agents/pa';
import type { PaContext } from '@/lib/workflow/paMachine';
import routingJson from './data/agent-routing.json';
import {
  AgentRoutingError,
  type AgentRoute,
  type AgentRouting,
  type DispatchedTask,
  type RouteMatch,
} from './types';

// ── Routing data (house-pattern validator, refuses loudly) ──────────────────────

const TASK_KINDS = ['outreach', 'referral', 'pa'];

function req(cond: unknown, field: string, detail: string): asserts cond {
  if (!cond) throw new AgentRoutingError(field, detail);
}

/** Parse + validate a routing blob, or throw AgentRoutingError. */
export function parseAgentRouting(data: unknown): AgentRouting {
  req(data && typeof data === 'object', 'root', 'must be an object');
  const o = data as Record<string, unknown>;
  req(typeof o.version === 'string' && o.version.length > 0, 'version', 'must be a version string');
  req(Array.isArray(o.routes), 'routes', 'must be an array');
  const routes = (o.routes as unknown[]).map((r, i) => validateRoute(r, i));
  return { version: o.version as string, routes };
}

function validateRoute(r: unknown, i: number): AgentRoute {
  req(r && typeof r === 'object', `routes[${i}]`, 'must be an object');
  const o = r as Record<string, unknown>;
  req(typeof o.id === 'string' && o.id.length > 0, `routes[${i}].id`, 'must be a non-empty string');
  req(typeof o.agentId === 'string' && o.agentId.length > 0, `routes[${i}].agentId`, 'must be a non-empty string');
  req(typeof o.taskKind === 'string' && TASK_KINDS.includes(o.taskKind), `routes[${i}].taskKind`, `must be one of ${TASK_KINDS.join(', ')}`);
  req(o.match && typeof o.match === 'object', `routes[${i}].match`, 'must be an object');
  const m = o.match as Record<string, unknown>;
  req(
    m.actionability !== undefined || m.kindPrefix !== undefined,
    `routes[${i}].match`,
    'must set at least one of actionability, kindPrefix',
  );
  if (o.taskKind === 'pa') {
    req(o.pa && typeof o.pa === 'object', `routes[${i}].pa`, 'a pa route must carry a { currentState, advanceEvent } template');
  }
  const route: AgentRoute = {
    id: o.id as string,
    agentId: o.agentId as string,
    taskKind: o.taskKind as AgentRoute['taskKind'],
    match: { ...(m as RouteMatch) },
  };
  if (o.pa) route.pa = o.pa as AgentRoute['pa'];
  return route;
}

/** Load the shipped default routing table (the reference data). */
export function loadAgentRouting(): AgentRouting {
  return parseAgentRouting(routingJson as AgentRouting);
}

// ── Routing (pure, deterministic) ───────────────────────────────────────────────

function matches(m: RouteMatch, sig: Signal): boolean {
  if (m.actionability !== undefined && sig.actionability !== m.actionability) return false;
  if (m.kindPrefix !== undefined && !sig.kind.startsWith(m.kindPrefix)) return false;
  return m.actionability !== undefined || m.kindPrefix !== undefined;
}

function firstMatch(routing: AgentRouting, sig: Signal): AgentRoute | undefined {
  return routing.routes.find((r) => matches(r.match, sig));
}

function paContextFor(sig: Signal): PaContext {
  return { priority: sig.priority === 'urgent' ? 'expedited' : 'standard' };
}

/** Input to the pure router: the SDE batch + the signals + member context. */
export interface DispatchInput {
  batch: DispositionBatch;
  memberContext: MemberContext;
  signals: Signal[];
  routing?: AgentRouting;
}

/**
 * Route an SDE disposition batch into concrete agent tasks. Outreach groups by
 * composed touchpoint; referral/PA route per approved disposition. Deterministic:
 * touchpoints first (in composed order), then approved dispositions (in batch order).
 */
export function routeBatch(input: DispatchInput): DispatchedTask[] {
  const routing = input.routing ?? loadAgentRouting();
  const byId = new Map(input.signals.map((s) => [s.signalId, s]));
  const tasks: DispatchedTask[] = [];

  // Outreach: one task per SDE coordinated touchpoint (grouped by the composer).
  for (const tp of input.batch.touchpoints) {
    const opener = byId.get(tp.intents[0]?.signalId ?? '');
    if (!opener) continue;
    const route = firstMatch(routing, opener);
    if (!route || route.taskKind !== 'outreach') continue;
    tasks.push({
      agentId: route.agentId,
      taskKind: 'outreach',
      memberId: tp.memberId,
      routeId: route.id,
      task: {
        touchpoint: tp,
        memberContext: input.memberContext,
        consentScope: opener.consentScope ?? '',
        priority: opener.priority,
      },
    });
  }

  // Referral + PA: one task per approved disposition whose route is not outreach.
  for (const d of input.batch.dispositions) {
    if (!isApproved(d)) continue;
    const sig = byId.get(d.signalId);
    if (!sig) continue;
    const route = firstMatch(routing, sig);
    if (!route || route.taskKind === 'outreach') continue;
    if (route.taskKind === 'referral') {
      const knownState: ReferralState = sig.kind.endsWith('.stalled') ? 'stalled' : 'open';
      tasks.push({
        agentId: route.agentId,
        taskKind: 'referral',
        memberId: sig.memberId,
        routeId: route.id,
        task: { referralRef: sig.refs?.referral ?? sig.signalId, priority: sig.priority, knownState },
      });
    } else {
      req(route.pa, `routes.${route.id}.pa`, 'a pa route must carry a template');
      tasks.push({
        agentId: route.agentId,
        taskKind: 'pa',
        memberId: sig.memberId,
        routeId: route.id,
        task: {
          threadRef: sig.refs?.claim ?? sig.refs?.thread ?? sig.signalId,
          currentState: route.pa!.currentState,
          paContext: paContextFor(sig),
          priority: sig.priority,
          advanceEvent: route.pa!.advanceEvent,
        },
      });
    }
  }

  return tasks;
}

// ── Running (start each task on the runtime; per-member ordered by the engine) ──

/** The workflow definition per task kind (default agent behaviors). */
export interface AgentWorkflows {
  outreach: WorkflowDefinition<OutreachTask, OutreachResult>;
  referral: WorkflowDefinition<ReferralTask, ReferralResult>;
  pa: WorkflowDefinition<PaTask, PaResult>;
}

/** Assemble the default agent workflows (mock deps). */
export function defaultAgentWorkflows(): AgentWorkflows {
  return {
    outreach: createOutreachWorkflow(),
    referral: createReferralWorkflow(),
    pa: createPaWorkflow(),
  };
}

/**
 * Start each dispatched task on the runtime with its agent workflow. The engine
 * partitions by memberId, so per-member start order (hence event order) is preserved.
 */
export function runDispatch(
  engine: WorkflowEngine,
  tasks: DispatchedTask[],
  workflows: AgentWorkflows = defaultAgentWorkflows(),
): WorkflowHandle[] {
  return tasks.map((t) => {
    const opts: StartOptions<unknown> = { memberId: t.memberId, input: t.task };
    if (t.taskKind === 'outreach') return engine.start(workflows.outreach, opts as StartOptions<OutreachTask>);
    if (t.taskKind === 'referral') return engine.start(workflows.referral, opts as StartOptions<ReferralTask>);
    return engine.start(workflows.pa, opts as StartOptions<PaTask>);
  });
}
