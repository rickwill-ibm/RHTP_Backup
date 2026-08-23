/**
 * Referral coordination agent — public surface. Opens/tracks a referral, proposes
 * a coordination action HITL, and escalates a stall via escalation-as-data.
 */
export {
  createReferralWorkflow,
  buildReferralAction,
  defaultReferralDeps,
} from './referralAgent';
export {
  REFERRAL_AGENT_ID,
  type ReferralTask,
  type ReferralResult,
  type ReferralState,
  type ReferralDeps,
} from './types';
