/**
 * Routing data — house-pattern validator, refuses loudly.
 *
 * Split out of `dispatcher.ts` by responsibility (conventions §2): the dispatcher
 * APPLIES routing rules, this module PARSES them. Zod is not a dependency here;
 * the house pattern is a hand validator that matches the JSON shape exactly and
 * throws a coded domain error, so a misconfigured routing table can never
 * silently change which agent receives a member's signal.
 */
import { isPaEventType, isPaState, PA_EVENT_TYPES, PA_STATES } from '@/lib/workflow/paMachine';
import routingJson from './data/agent-routing.json';
import {
  AGENT_TASK_KINDS,
  AgentRoutingError,
  isAgentTaskKind,
  type AgentRoute,
  type AgentRouting,
  type RouteMatch,
} from './types';

/** Assert a routing-data condition, or throw the coded error. */
export function req(cond: unknown, field: string, detail: string): asserts cond {
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

/**
 * Validate a route's PA template against the CLOSED machine vocabularies.
 *
 * THE CAST THIS REPLACED. It was `route.pa = o.pa as AgentRoute['pa']` — an unchecked
 * assertion into `{ currentState: PaState; advanceEvent: PaEvent }` after a bare
 * `typeof o.pa === 'object'` check. So `"currentState": "denied"` (lower-case d) passed
 * here, `tsc --noEmit`, and `adl:check`, and then `transition()` returned an `error`
 * WITHOUT throwing: `paAgent` still reported `outcome: 'executed'`, `evidence.append`
 * had already fired, and the audited row said an advancement happened that did not. A
 * cast is not a check, and a soft-failing consumer makes the missing check load-bearing.
 */
function validatePaTemplate(raw: unknown, i: number): AgentRoute['pa'] {
  const pa = raw as Record<string, unknown>;
  req(
    isPaState(pa.currentState),
    `routes[${i}].pa.currentState`,
    `must be one of ${PA_STATES.join(', ')}`
  );
  req(
    pa.advanceEvent !== null && typeof pa.advanceEvent === 'object',
    `routes[${i}].pa.advanceEvent`,
    'must be an object carrying a type'
  );
  const ev = pa.advanceEvent as Record<string, unknown>;
  req(
    isPaEventType(ev.type),
    `routes[${i}].pa.advanceEvent.type`,
    `must be one of ${PA_EVENT_TYPES.join(', ')}`
  );
  return pa as unknown as AgentRoute['pa'];
}

function validateRoute(r: unknown, i: number): AgentRoute {
  req(r && typeof r === 'object', `routes[${i}]`, 'must be an object');
  const o = r as Record<string, unknown>;
  req(typeof o.id === 'string' && o.id.length > 0, `routes[${i}].id`, 'must be a non-empty string');
  req(
    typeof o.agentId === 'string' && o.agentId.length > 0,
    `routes[${i}].agentId`,
    'must be a non-empty string'
  );
  req(
    isAgentTaskKind(o.taskKind),
    `routes[${i}].taskKind`,
    `must be one of ${AGENT_TASK_KINDS.join(', ')}`
  );
  req(o.match && typeof o.match === 'object', `routes[${i}].match`, 'must be an object');
  const m = o.match as Record<string, unknown>;
  req(
    m.actionability !== undefined || m.kindPrefix !== undefined,
    `routes[${i}].match`,
    'must set at least one of actionability, kindPrefix'
  );
  if (o.taskKind === 'pa') {
    req(
      o.pa && typeof o.pa === 'object',
      `routes[${i}].pa`,
      'a pa route must carry a { currentState, advanceEvent } template'
    );
  }
  const route: AgentRoute = {
    id: o.id as string,
    agentId: o.agentId as string,
    taskKind: o.taskKind as AgentRoute['taskKind'],
    match: { ...(m as RouteMatch) },
  };
  if (o.pa) route.pa = validatePaTemplate(o.pa, i);
  return route;
}

/** Load the shipped default routing table (the reference data). */
export function loadAgentRouting(): AgentRouting {
  return parseAgentRouting(routingJson as AgentRouting);
}
