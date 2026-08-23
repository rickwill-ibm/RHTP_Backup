/**
 * PA documentation agent — public surface (O-8). Drives the /prior-auth flow from
 * thread context, proposes documentation/advancement HITL, and NEVER sets an
 * authoritative PA state (the guardrail: `assertAgentPaEventAllowed`).
 */
export { createPaWorkflow, buildPaAction, defaultPaDeps } from './paAgent';
export {
  PA_AGENT_ID,
  AgentAuthorityError,
  AUTHORITATIVE_PA_EVENTS,
  assertAgentPaEventAllowed,
  type PaTask,
  type PaResult,
  type PaDeps,
} from './types';
