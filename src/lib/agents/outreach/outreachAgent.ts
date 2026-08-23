// CONTRACT: C1  // CONTRACT: C2
/**
 * Outreach agent behavior (G4).
 *
 * Consumes an SDE-approved coordinated touchpoint and runs it through the HITL
 * gate. The workflow body is a generic journey driven by manifest authority
 * (`outreach-agent`): every tool call passes the least-privilege allowlist, the
 * proposal suspends at the existing work queue, and the send happens ONLY after a
 * human approval.
 *
 * Consent-gated (DP consent seam reuse): no outreach is proposed without the
 * touchpoint's consent scope; absent consent yields suppress-with-reason, never a
 * silent send and never a proposal that could be approved into a send.
 */
import type { ProposedAction, WorkflowContext, WorkflowDefinition } from '@/lib/agentRuntime';
import { getIdempotencyStore, IDEMPOTENCY_CONSUMERS } from '@/lib/idempotency';
import { consentGranted as sdeConsentGranted } from '@/lib/sde';
import {
  OUTREACH_AGENT_ID,
  type OutreachDeps,
  type OutreachResult,
  type OutreachTask,
} from './types';

/**
 * Build the PHI-safe outreach proposal from a touchpoint. Pure: it names the
 * action, the channel, and the intent kinds (codes only), never member payload.
 */
export function buildOutreachAction(task: OutreachTask): ProposedAction {
  const tp = task.touchpoint;
  const kinds = tp.intents.map((i) => i.kind);
  return {
    actionType: 'send-outreach',
    priority: task.priority,
    refs: {
      touchpoint: tp.touchpointId,
      channel: tp.channel,
      intents: String(tp.intents.length),
      kinds: kinds.join(','),
    },
    summary: `Coordinated ${tp.channel} touchpoint (${tp.intents.length} intent(s)) awaiting review`,
  };
}

/** The default injected effects: a recording mock send + the SDE consent seam. */
export function defaultOutreachDeps(): OutreachDeps {
  return {
    async send(_action, task) {
      return { ref: `send::${task.touchpoint.channel}::${task.touchpoint.touchpointId}` };
    },
    consentGranted: sdeConsentGranted,
    // NS-04: the configured idempotency seam guards the send against a republish.
    idempotency: getIdempotencyStore(),
  };
}

/**
 * The outreach workflow definition, governed by the `outreach-agent` manifest.
 * Flow: read member context (allowlisted) -> consent gate -> propose + wait ->
 * on approval, send via the allowlisted `comms-channel.send` tool; on rejection,
 * no send. The runtime emits proposed/approved/executed (or rejected) around this.
 */
export function createOutreachWorkflow(
  deps: OutreachDeps = defaultOutreachDeps(),
): WorkflowDefinition<OutreachTask, OutreachResult> {
  return {
    name: 'outreach-journey',
    agentId: OUTREACH_AGENT_ID,
    async run(ctx: WorkflowContext, task: OutreachTask): Promise<OutreachResult> {
      const touchpointId = task.touchpoint.touchpointId;

      // Read member context through the least-privilege allowlist.
      await ctx.useTool('person-context.read', () => task.memberContext);

      // Consent gate (reuse the consent seam): no proposal without consent scope.
      const allowed = deps.consentGranted(ctx.memberId, task.consentScope, task.memberContext);
      if (!allowed) {
        return { outcome: 'suppressed', touchpointId, reason: 'consent-absent' };
      }

      // Register the proposal at the HITL work queue and suspend.
      const action = buildOutreachAction(task);
      const decision = await ctx.proposeAndWait(action);
      if (decision.decision === 'rejected') {
        return { outcome: 'rejected', touchpointId, decidedBy: decision.decidedBy };
      }

      // NS-04 durable guard: claim the send exactly once per touchpoint. An outbox
      // at-least-once republish that reaches an approved touchpoint is deduped here
      // BEFORE the effect fires, so no member is contacted twice. Keyed by
      // touchpointId under the outreach-agent consumer namespace.
      if (deps.idempotency) {
        const { firstProcessed } = await deps.idempotency.markProcessed(
          IDEMPOTENCY_CONSUMERS.outreachAgent,
          touchpointId,
        );
        if (!firstProcessed) {
          return { outcome: 'deduped', touchpointId, decidedBy: decision.decidedBy };
        }
      }

      // Approved: the actual send is a tool call (mockable), gated by the allowlist.
      const receipt = await ctx.useTool('comms-channel.send', () => deps.send(action, task));
      return {
        outcome: 'executed',
        touchpointId,
        channel: task.touchpoint.channel,
        sendRef: receipt.ref,
        decidedBy: decision.decidedBy,
      };
    },
  };
}
