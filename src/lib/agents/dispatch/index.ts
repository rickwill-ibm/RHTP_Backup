/**
 * Agent dispatcher — public surface. Routes an SDE disposition batch to the right
 * agent by trigger/type (data-driven), and starts the tasks on the runtime.
 */
export {
  routeBatch,
  routeBatchGated,
  assertNoUngatedPart2,
  NO_AGENT,
  type DispatchResult,
  type RefusedDispatch,
  type DispatchRefusalReason,
  runDispatch,
  defaultAgentWorkflows,
  loadAgentRouting,
  parseAgentRouting,
  type DispatchInput,
  type AgentWorkflows,
} from './dispatcher';
export {
  AgentRoutingError,
  type AgentRouting,
  type AgentRoute,
  type RouteMatch,
  type AgentTaskKind,
  type DispatchedTask,
  type PaRouteTemplate,
} from './types';
export {
  decideDispatchDisclosure,
  requiresDisclosureGate,
  type DisclosureGateDeps,
} from './disclosureGate';
export {
  decideTouchpointDisclosure,
  type DisclosedTouchpoint,
  type RefusedIntent,
  type TouchpointDisclosure,
} from './touchpointDisclosure';
