/**
 * Agent library — public surface (G4).
 *
 * The three governed agents built ON the agent runtime (src/lib/agentRuntime) and
 * the manifest registry (src/lib/agents/manifest): outreach, referral coordination,
 * and PA documentation. Plus the thin dispatcher that routes an SDE disposition
 * batch to the right agent, and the demo seam (mock authored actions vs the real
 * runtime). Every agent proposes-and-waits at the existing HITL work queue; none
 * sets an authoritative domain state.
 */
export * from './manifest';
export {
  createOutreachWorkflow,
  buildOutreachAction,
  defaultOutreachDeps,
  OUTREACH_AGENT_ID,
  type OutreachTask,
  type OutreachResult,
  type OutreachDeps,
  type SendReceipt,
} from './outreach';
export {
  createReferralWorkflow,
  buildReferralAction,
  defaultReferralDeps,
  REFERRAL_AGENT_ID,
  type ReferralTask,
  type ReferralResult,
  type ReferralState,
  type ReferralDeps,
} from './referral';
export {
  createPaWorkflow,
  buildPaAction,
  defaultPaDeps,
  PA_AGENT_ID,
  AgentAuthorityError,
  AUTHORITATIVE_PA_EVENTS,
  assertAgentPaEventAllowed,
  type PaTask,
  type PaResult,
  type PaDeps,
} from './pa';
export {
  routeBatch,
  runDispatch,
  defaultAgentWorkflows,
  loadAgentRouting,
  parseAgentRouting,
  AgentRoutingError,
  type DispatchInput,
  type AgentWorkflows,
  type AgentRouting,
  type AgentRoute,
  type RouteMatch,
  type AgentTaskKind,
  type DispatchedTask,
  type PaRouteTemplate,
} from './dispatch';
export {
  getAgentDemoActions,
  authoredAgentActions,
  runRealAgentDemo,
  type AgentDemoAction,
} from './demo';
