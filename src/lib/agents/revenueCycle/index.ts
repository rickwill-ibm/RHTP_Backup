/**
 * Revenue-Cycle agent — public surface. Consumes an order→cash `underpaid`
 * reconciliation verdict, reads the recovery context (references-only), writes the
 * recovery DRAFT via its OWN governed `evidence.append` tool call (FIX-1), and
 * proposes the draft-appeal HITL. A payer-facing SUBMISSION is never auto-executed.
 */
export {
  createRecoveryWorkflow,
  buildRecoveryAction,
  defaultRecoveryDeps,
} from './revenueCycleAgent';
export {
  REVENUE_CYCLE_AGENT_ID,
  type RecoveryTask,
  type RecoveryDeps,
  type RecoveryResult,
} from './types';
