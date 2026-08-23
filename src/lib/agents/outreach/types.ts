/**
 * Outreach agent — domain types.
 *
 * The outreach agent consumes an SDE-approved coordinated touchpoint (the output
 * of src/lib/sde) and drives it through the HITL gate: consent check, propose,
 * wait for a human decision, then (on approval) perform the send as a tool call.
 *
 * Nothing here keys on a persona — the task is typed data (a touchpoint + a
 * consent scope + a member context) evaluated by a generic workflow body.
 */
import type { EscalationPriority, ProposedAction } from '@/lib/agentRuntime';
import type { IdempotencyStore } from '@/lib/idempotency';
import type { MemberContext, Touchpoint } from '@/lib/sde';

export const OUTREACH_AGENT_ID = 'outreach-agent';

/** A unit of outreach work: one SDE coordinated touchpoint plus its gate inputs. */
export interface OutreachTask {
  /** The SDE-composed coordinated touchpoint (channel + priority-ordered intents). */
  touchpoint: Touchpoint;
  /** Member context (consent scopes granted, contact history) for the consent gate. */
  memberContext: MemberContext;
  /** The consent purpose this touchpoint requires (from the taxonomy/signal). */
  consentScope: string;
  /** Escalation priority tier (drives the SLA + hierarchy walk if unattended). */
  priority: EscalationPriority;
}

/** The terminal outcome of an outreach workflow run (PHI-safe). */
export type OutreachResult =
  | { outcome: 'executed'; touchpointId: string; channel: string; sendRef: string; decidedBy: string }
  | { outcome: 'rejected'; touchpointId: string; decidedBy: string }
  | { outcome: 'suppressed'; touchpointId: string; reason: 'consent-absent' }
  | OutreachDedupedResult;

/** PHI-safe receipt returned by the (mockable) send effect. */
export interface SendReceipt {
  /** A reference to the sent contact (never member payload). */
  ref: string;
}

/** Injected effects for the outreach workflow (deterministic; mockable send). */
export interface OutreachDeps {
  /**
   * The actual send effect — a tool call, mockable. Runs ONLY after a human
   * approval and ONLY through the `comms-channel.send` allowlisted tool. Returns
   * a PHI-safe receipt ref.
   */
  send(action: ProposedAction, task: OutreachTask): Promise<SendReceipt>;
  /**
   * Consent lookup (reuses the SDE consent seam by default). True when the member
   * has granted the touchpoint's scope and has not opted out of contact.
   */
  consentGranted(memberId: string, scope: string, ctx: MemberContext): boolean;
  /**
   * NS-04 guard. Durable idempotency store guarding the SEND effect: an outbox
   * at-least-once republish of the same touchpoint must not re-send. Optional —
   * absent means no cross-delivery guard (the demo default wires the seam store).
   */
  idempotency?: IdempotencyStore;
}

/** The outcome discriminant added when a republish is deduped before the send. */
export interface OutreachDedupedResult {
  outcome: 'deduped';
  touchpointId: string;
  decidedBy: string;
}
