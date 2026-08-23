/**
 * Referral coordination agent — domain types.
 *
 * The agent opens/tracks a referral and, when it stalls, proposes a coordination
 * action HITL. A stalled, unattended proposal is detected and escalated by the
 * runtime's escalation-as-data machinery (SLA -> care-team hierarchy -> park),
 * driven off the injected clock. The agent never books an external transaction.
 */
import type { EscalationPriority } from '@/lib/agentRuntime';
import type { IdempotencyStore } from '@/lib/idempotency';

export const REFERRAL_AGENT_ID = 'referral-coordination-agent';

/** The lifecycle state of a tracked referral (PHI-safe codes only). */
export type ReferralState = 'open' | 'stalled' | 'completed';

/** A unit of referral work: one referral to open/track and coordinate. */
export interface ReferralTask {
  /** PHI-safe reference to the referral resource (e.g. "ServiceRequest/ref-12"). */
  referralRef: string;
  /** Escalation priority tier (drives the stall SLA + hierarchy walk). */
  priority: EscalationPriority;
  /** Optional current state, if already known from the source event. */
  knownState?: ReferralState;
}

/** The terminal outcome of a referral workflow run (PHI-safe). */
export type ReferralResult =
  | { outcome: 'executed'; referralRef: string; decidedBy: string }
  | { outcome: 'rejected'; referralRef: string; decidedBy: string }
  | { outcome: 'resolved-no-action'; referralRef: string }
  | { outcome: 'deduped'; referralRef: string; decidedBy: string };

/** Injected effects for the referral workflow (deterministic; mockable reads). */
export interface ReferralDeps {
  /**
   * Read the referral's current state (a `referral-status.read` tool call,
   * mockable). Returns a PHI-safe state code.
   */
  readState(task: ReferralTask): Promise<ReferralState>;
  /**
   * NS-04 guard. Durable idempotency store guarding the coordination ACTION: an
   * outbox at-least-once republish of the same referral must not re-fire the
   * approved follow-up. Optional — absent means no cross-delivery guard (the demo
   * default wires the seam store).
   */
  idempotency?: IdempotencyStore;
}
