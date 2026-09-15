/**
 * Outreach agent — public surface. Consumes an SDE-approved coordinated
 * touchpoint, consent-gates it, proposes the outreach action HITL, and (on
 * approval) sends via the allowlisted comms tool.
 */
export { createOutreachWorkflow, buildOutreachAction, defaultOutreachDeps } from './outreachAgent';
export {
  OUTREACH_AGENT_ID,
  type OutreachTask,
  type OutreachResult,
  type OutreachDeps,
  type SendReceipt,
} from './types';
