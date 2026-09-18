// CONTRACT: C2
/**
 * Referral coordination agent behavior (G4).
 *
 * Opens/tracks a referral and proposes a coordination action HITL. Stall handling
 * is escalation-as-data, not bespoke code: the proposal registers the runtime's
 * escalation timers, so an unattended (stalled) proposal walks the SLA -> care-team
 * hierarchy -> park path off the injected clock. A completed referral resolves with
 * no action. The agent never books an external transaction; its authority is the
 * `referral-coordination-agent` manifest (read + work-queue tools only).
 */
import type { ProposedAction, WorkflowContext, WorkflowDefinition } from '@/lib/agentRuntime';
import { getIdempotencyStore, IDEMPOTENCY_CONSUMERS } from '@/lib/idempotency';
import {
  REFERRAL_AGENT_ID,
  type ReferralDeps,
  type ReferralResult,
  type ReferralState,
  type ReferralTask,
} from './types';

/** Build the PHI-safe referral coordination proposal. Pure. */
export function buildReferralAction(task: ReferralTask, state: ReferralState): ProposedAction {
  return {
    actionType: 'referral-followup',
    priority: task.priority,
    refs: { referral: task.referralRef, state },
    summary: `Referral ${state} — coordination follow-up awaiting review`,
  };
}

/** The default injected effects: a mock status read honoring any known state. */
export function defaultReferralDeps(): ReferralDeps {
  return {
    async readState(task) {
      return task.knownState ?? 'open';
    },
    // NS-04: the configured idempotency seam guards the action against a republish.
    idempotency: getIdempotencyStore(),
  };
}

/**
 * The referral workflow definition, governed by the `referral-coordination-agent`
 * manifest. Flow: read status (allowlisted) -> if completed, resolve with no
 * action -> else propose + wait; a stalled/unattended proposal escalates via the
 * runtime's escalation-as-data (SLA -> hierarchy -> park), never silently expiring.
 */
export function createReferralWorkflow(
  deps: ReferralDeps = defaultReferralDeps()
): WorkflowDefinition<ReferralTask, ReferralResult> {
  return {
    name: 'referral-journey',
    agentId: REFERRAL_AGENT_ID,
    async run(ctx: WorkflowContext, task: ReferralTask): Promise<ReferralResult> {
      const state = await ctx.useTool('referral-status.read', () => deps.readState(task));
      if (state === 'completed') {
        return { outcome: 'resolved-no-action', referralRef: task.referralRef };
      }

      // Propose the coordination action; the runtime detects a stall (unattended
      // proposal past its SLA) and escalates up the hierarchy per escalation-as-data.
      const action = buildReferralAction(task, state);
      const decision = await ctx.proposeAndWait(action);
      if (decision.decision === 'rejected') {
        return {
          outcome: 'rejected',
          referralRef: task.referralRef,
          decidedBy: decision.decidedBy,
        };
      }

      // NS-04 durable guard: claim the coordination action exactly once per
      // referral. A republished referral event that reaches an approved action is
      // deduped here before the effect, so the follow-up never double-fires.
      if (deps.idempotency) {
        const { firstProcessed } = await deps.idempotency.markProcessed(
          IDEMPOTENCY_CONSUMERS.referralAgent,
          task.referralRef
        );
        if (!firstProcessed) {
          return {
            outcome: 'deduped',
            referralRef: task.referralRef,
            decidedBy: decision.decidedBy,
          };
        }
      }

      return { outcome: 'executed', referralRef: task.referralRef, decidedBy: decision.decidedBy };
    },
  };
}
