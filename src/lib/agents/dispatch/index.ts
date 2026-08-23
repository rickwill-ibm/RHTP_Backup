/**
 * Agent dispatcher — public surface. Routes an SDE disposition batch to the right
 * agent by trigger/type (data-driven), and starts the tasks on the runtime.
 */
export {
  routeBatch,
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
