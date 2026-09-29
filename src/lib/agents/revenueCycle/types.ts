/**
 * Revenue-Cycle agent — domain types (FROZEN interface; Tree 2 dispatches against this).
 *
 * The revenue-cycle agent consumes an order→cash reconciliation `underpaid` verdict
 * and drives a recovery-appeal DRAFT through the HITL gate: it reads the recovery
 * context (references-only), writes the recovery draft via its OWN governed
 * `evidence.append` tool call (the agent is the single writer of the draft — Wave-3
 * FIX-1), then proposes the draft-appeal HITL and SUSPENDS for a human decision.
 *
 * A payer-facing SUBMISSION cannot occur WITHOUT a qualified-human decision (Wave-4,
 * evolving Wave-1 FIX-1): the agent MAY call `claim.submit-appeal`, but ONLY in the
 * post-approval branch after `proposeAndWait` resolves with a qualified human — the
 * runtime auto-approve gate (isAutoApprovable, isSubmission) refuses it at every tier
 * and the workflow body asserts isNonAutomatedDecider, so no auto-submit path
 * exists at any tier.
 *
 * Nothing here keys on a persona — the task is typed data (claim/remittance/auth
 * refs + a delta + an evidence tier + a priority) evaluated by a generic workflow.
 */
import type { EscalationPriority, HumanDecision } from '@/lib/agentRuntime';
import type { AuthorityRung, EvidenceTier } from '@/lib/evidence/tierConfig';

export const REVENUE_CYCLE_AGENT_ID = 'revenue-cycle-agent';

/**
 * A unit of recovery work: the PHI-safe references for one underpaid reconciliation
 * verdict plus its gate inputs. References + amounts only — never member free-text.
 */
export interface RecoveryTask {
  /** The claim under recovery (reference id, not member payload). */
  claimId: string;
  /** The 835 remittance the underpayment was found on (recovery claim ref). */
  remittanceId: string;
  /** The authorization the claim was submitted under. */
  authId: string;
  /** The underpayment amount (contracted allowed − paid); refs/amounts only. */
  delta: number;
  /** The evidence tier of the recovery context (caps the permitted authority rung). */
  evidenceTier: EvidenceTier;
  /** Escalation priority tier (drives the SLA + hierarchy walk if unattended). */
  priority: EscalationPriority;
}

/**
 * The GOVERNED effect closure injected by the caller. `recordDraft` appends the
 * recovery DRAFT to the evidence spine (Tree 2 wires it to `recordRecovery`); it is
 * invoked BY the agent through its `evidence.append` allowlisted tool (FIX-1), so
 * the draft is produced under `assertToolAllowed` + the interlock, never by the
 * caller directly. Returns a PHI-safe reference to the appended draft entry.
 */
export interface RecoveryDeps {
  recordDraft(task: RecoveryTask, rung: AuthorityRung): Promise<{ recoveryRef: string }>;
  /**
   * Wave-4 (must-fix 5): the GOVERNED submission effect, invoked BY the agent through
   * its `claim.submit-appeal` allowlisted tool ONLY in the post-approval branch —
   * after `proposeAndWait` resolves with a qualified human. Tree 2 wires it to the
   * fail-closed submissionGateway seam (a mock, not-transmitted receipt today). It is
   * NEVER called at draft/dispatch time: the dispatch-path and default deps supply a
   * THROWING stub, since dispatch always suspends and submission runs only on the
   * resume engine (the decision route). The qualified-human `decision` is passed so a
   * real transport can stamp the deciding reviewer on the transmission.
   */
  submitAppeal(task: RecoveryTask, decision: HumanDecision): Promise<{ submissionRef: string }>;
}

/**
 * The terminal outcome of a recovery workflow run (PHI-safe). Now a UNION (Wave-4):
 *  - `proposed`  — the body suspended at the HITL gate; the per-request dispatch engine
 *                  reads the draft + proposal from engine state (the body does not
 *                  complete to a return on that engine).
 *  - `submitted` — the resume engine signalled a qualified-human APPROVE; the agent ran
 *                  the governed submission and returns the submissionRef + decidedBy.
 *  - `rejected`  — the resume engine signalled a REJECT; no submission (Tree 2 records
 *                  the terminal marker).
 */
export type RecoveryResult =
  | {
      outcome: 'proposed';
      proposalId: string;
      rung: AuthorityRung;
      recoveryRef: string;
      requiresHumanForSubmission: true;
    }
  | {
      outcome: 'submitted';
      proposalId: string;
      rung: AuthorityRung;
      recoveryRef: string;
      submissionRef: string;
      decidedBy: string;
    }
  | {
      outcome: 'rejected';
      proposalId: string;
      rung: AuthorityRung;
      recoveryRef: string;
      decidedBy: string;
    };
