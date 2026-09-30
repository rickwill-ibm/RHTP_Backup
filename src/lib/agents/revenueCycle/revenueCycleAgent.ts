/**
 * Revenue-Cycle agent behavior (Wave-3, golden-thread order→cash).
 *
 * Consumes an `underpaid` reconciliation verdict and runs a recovery-appeal DRAFT
 * through the HITL gate. The workflow body is a generic journey driven by manifest
 * authority (`revenue-cycle-agent`): every tool call passes the least-privilege
 * allowlist, the twin-ladder interlock caps the authority rung and forces the human
 * path for the payer-facing submission, and the proposal suspends at the existing
 * work queue.
 *
 * FIX-1 (the agent is the single writer of the draft): the recovery draft is
 * produced BY this agent through its own `evidence.append` governed tool call at
 * propose-time — BEFORE the proposeAndWait suspension — never written by the caller.
 *
 * SUBMISSION (Wave-4, evolving FIX-1): a payer-facing submission CANNOT occur WITHOUT
 * a qualified-human decision. The agent MAY call `claim.submit-appeal`, but ONLY in
 * the post-approval branch — after `proposeAndWait` resolves with a qualified human.
 * The runtime auto-approve gate (isAutoApprovable + isSubmission) refuses the proposal
 * at every tier, and the body ASSERTS isNonAutomatedDecider before the submit tool,
 * so a `system`/`autonomy:*` signaller can never reach submission — there is no
 * auto-submit path at any tier.
 */
import type { ProposedAction, WorkflowContext, WorkflowDefinition } from '@/lib/agentRuntime';
import { evaluateInterlock } from '@/lib/agents/governance/interlock';
import { isNonAutomatedDecider } from '@/lib/agents/governance/decisionGate';
import {
  REVENUE_CYCLE_AGENT_ID,
  type RecoveryDeps,
  type RecoveryResult,
  type RecoveryTask,
} from './types';

/**
 * Build the PHI-safe recovery proposal from a task. Pure: it names the action, the
 * priority, and the claim/remittance/delta references (codes + amounts only), never
 * member free-text. `actionType` is `draft-appeal` — a DRAFT, not a submission.
 */
export function buildRecoveryAction(task: RecoveryTask): ProposedAction {
  return {
    actionType: 'draft-appeal',
    priority: task.priority,
    refs: {
      claim: task.claimId,
      remittance: task.remittanceId,
      auth: task.authId,
      delta: String(task.delta),
    },
    summary: `Underpayment recovery appeal DRAFT for claim ${task.claimId} awaiting review`,
    // Wave-3 MED-3: a recovery appeal is payer-facing. Marking the proposal a
    // submission makes the DURABLE runtime auto-approve gate (`isAutoApprovable`)
    // refuse it even at HOTL/autonomous — a payer-facing action ALWAYS needs a
    // qualified human, not only because the tier happens to be HITL today.
    isSubmission: true,
  };
}

/**
 * Default injected effects, FOR TESTS ONLY: a no-op recorder returning a stub ref.
 * The REAL `recordDraft` (appending `recordRecovery` to the evidence record) is
 * injected by Tree 2 from the order→cash path.
 */
export function defaultRecoveryDeps(): RecoveryDeps {
  return {
    async recordDraft(task) {
      return { recoveryRef: `recovery::${task.remittanceId}` };
    },
    // submitAppeal is NOT wired here: submission runs ONLY on the resume engine
    // (the decision route), never at draft/dispatch time. A throwing stub makes a
    // mistaken pre-decision call fail loud rather than silently no-op.
    async submitAppeal() {
      throw new Error(
        'submitAppeal is not wired on defaultRecoveryDeps: a payer-facing submission ' +
          'runs only on the resume engine (the decision route), never at draft/dispatch time'
      );
    },
  };
}

/**
 * The recovery workflow definition, governed by the `revenue-cycle-agent` manifest.
 * Flow: read reconciliation context (allowlisted) -> interlock (consume
 * requiresHuman + permittedRung) -> write the DRAFT via the agent's own
 * `evidence.append` tool -> propose + wait (suspends at the HITL gate). Because the
 * propose suspends, in a per-request engine `run` may not complete to the return —
 * that is EXPECTED; the caller reads the durable draft + proposal from engine state.
 */
export function createRecoveryWorkflow(
  deps: RecoveryDeps = defaultRecoveryDeps()
): WorkflowDefinition<RecoveryTask, RecoveryResult> {
  return {
    name: 'recovery-appeal',
    agentId: REVENUE_CYCLE_AGENT_ID,
    async run(ctx: WorkflowContext, task: RecoveryTask): Promise<RecoveryResult> {
      // Least-privilege governed read (references-only). assertToolAllowed fires.
      await ctx.useTool('reconciliation.read', () => task);

      // Twin-ladder interlock: CONSUME requiresHuman + permittedRung. A payer-facing
      // submission is human-gated regardless of rung (isSubmission) — never
      // auto-resolves. Invariant: a recovery submission MUST require a human.
      const gate = evaluateInterlock({
        manifestTier: ctx.autonomyTier(),
        evidenceTier: task.evidenceTier,
        action: buildRecoveryAction(task),
        isSubmission: true,
      });
      if (!gate.requiresHuman) {
        throw new Error(
          'revenue-cycle interlock invariant violated: a recovery submission must require a human'
        );
      }

      // FIX-1: the agent is the single writer of the recovery DRAFT. Write it via
      // the agent's OWN governed tool call (assertToolAllowed enforces the
      // allowlist) at propose-time, BEFORE the suspension, at the interlock rung.
      const { recoveryRef } = await ctx.useTool('evidence.append', () =>
        deps.recordDraft(task, gate.permittedRung)
      );

      // Register the DRAFT proposal at the HITL work queue and SUSPEND for the human
      // SUBMISSION decision. The draft already exists (step above). This emits
      // agent.task.proposed + enqueues the agent-proposal work item. On the per-request
      // dispatch engine this NEVER resolves (the engine is discarded at the request
      // boundary); on the resume engine (the decision route) it resolves when a
      // qualified human signals a decision — that is the ONLY path past this line.
      const decision = await ctx.proposeAndWait(buildRecoveryAction(task));

      // REJECT: terminal, no submission. Tree 2 records the terminal marker + lifecycle.
      if (decision.decision === 'rejected') {
        return {
          outcome: 'rejected',
          proposalId: decision.proposalId,
          rung: gate.permittedRung,
          recoveryRef,
          decidedBy: decision.decidedBy,
        };
      }

      // APPROVE: submission requires a QUALIFIED human (defense-in-depth). The runtime
      // gate already refuses auto-approval for a submission at every tier; assert it
      // here too so a `system`/`autonomy:*` signaller can NEVER reach the submit tool.
      if (!isNonAutomatedDecider(decision)) {
        throw new Error(
          'revenue-cycle submission invariant violated: a payer-facing submission requires ' +
            'a qualified-human decision (never system/autonomy)'
        );
      }

      // The governed submission effect — the agent's OWN allowlisted `claim.submit-appeal`
      // tool call (assertToolAllowed enforces the allowlist). Reached ONLY after a
      // qualified-human APPROVE.
      const { submissionRef } = await ctx.useTool('claim.submit-appeal', () =>
        deps.submitAppeal(task, decision)
      );
      return {
        outcome: 'submitted',
        proposalId: decision.proposalId,
        rung: gate.permittedRung,
        recoveryRef,
        submissionRef,
        decidedBy: decision.decidedBy,
      };
    },
  };
}
