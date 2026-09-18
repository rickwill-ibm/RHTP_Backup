/**
 * recoveryFailScenarios.ts (#495) — explicit FAIL / fail-closed probes for the
 * recovery-policy simulation.
 *
 * These scenarios demonstrate the governance HOLDING under adversity. Each carries
 * a `FailProbe`: an attempted governed action, at an attempted (often maximal)
 * autonomy tier, which the REAL Twin-Ladder interlock (`evaluateInterlock`) refuses
 * to let act autonomously. The three classes:
 *
 *   payer-adverse       an auto-denial / adverse action on THIN evidence (D0) — the
 *                       evidence ceiling caps the rung to A0 AND the adverse-coverage
 *                       rule human-gates it: it cannot act autonomously.
 *   provider-evidence   a recovery with insufficient / absent attached evidence (D0)
 *                       — capped to assist (A0); it cannot escalate past flag/draft.
 *   submission-gateway  a payer-facing SUBMISSION that is fail-closed at the human
 *                       gate even at settlement-grade evidence (D3) + full autonomy —
 *                       the seam cannot submit autonomously regardless of rung.
 *
 * Wave-13.1 adds a second `payer-adverse` probe at the OTHER extreme (D3 + autonomous,
 * rung A3, NOT evidence-capped) to prove the adverse gate holds on RUNG-independent
 * grounds — the most persuasive fail-closed demo — plus a reconcile-level indeterminate
 * scenario (in recoveryCohorts.ts) for the no-recognized-X12-group fail-closed verdict.
 *
 * Every outcome is computed by the real `evaluateInterlock` — nothing is asserted by
 * hand. Pure, deterministic, client-safe (imports only pure governance modules).
 */
import type { SimScenario } from './recoverySimulation';
import { evaluateInterlock } from '@/lib/agents/governance/interlock';
import type { AuthorityRung } from '@/lib/evidence/tierConfig';
import type { AutonomyTier } from '@/lib/agents/manifest/types';
import type { EscalationPriority } from '@/lib/agentRuntime/types';

export type FailClass = 'payer-adverse' | 'provider-evidence' | 'submission-gateway';

/** An adversarial probe attached to a scenario — the action the sim TRIES to auto-run. */
export interface FailProbe {
  class: FailClass;
  /** The code-level actionType attempted (e.g. 'auto-denial', 'x12-837-corrected'). */
  attemptedActionType: string;
  /** The (often maximal) autonomy tier the adversary tries to act at. */
  attemptedAutonomy: AutonomyTier;
  /** True when the attempted action is a payer-facing submission (seam / gateway). */
  isSubmission?: boolean;
}

/** The computed fail-closed outcome — all fields derived from `evaluateInterlock`. */
export interface FailResult {
  class: FailClass;
  attemptedAutonomy: AutonomyTier;
  /** Permitted rung under the attempted autonomy (the cap the adversary hits). */
  cappedRung: AuthorityRung;
  /** Evidence was the binding constraint under the attempted autonomy. */
  cappedByEvidence: boolean;
  /** A qualified human is required — the action CANNOT act autonomously. */
  requiresHuman: boolean;
  /** The interlock refuses to resolve with no human decision (fail-closed). */
  blocked: boolean;
  /** PHI-safe interlock reason string. */
  reason: string;
}

/**
 * Evaluate a fail probe through the REAL interlock. No human decision is supplied
 * (the adversary attempts to auto-act); a blocked result is the fail-closed proof.
 */
export function evaluateFailProbe(
  probe: FailProbe,
  evidenceTier: SimScenario['evidenceTier']
): FailResult {
  const priority: EscalationPriority = probe.class === 'submission-gateway' ? 'high' : 'routine';
  const interlock = evaluateInterlock({
    manifestTier: probe.attemptedAutonomy,
    evidenceTier,
    action: { actionType: probe.attemptedActionType, priority },
    humanDecision: null,
    ...(probe.isSubmission ? { isSubmission: true } : {}),
  });
  return {
    class: probe.class,
    attemptedAutonomy: probe.attemptedAutonomy,
    cappedRung: interlock.permittedRung,
    cappedByEvidence: interlock.cappedByEvidence,
    requiresHuman: interlock.requiresHuman,
    blocked: !interlock.resolved,
    reason: interlock.reason,
  };
}

/**
 * The three FAIL scenarios. Ordinary reconcile fields are set so the recovery
 * categorization is coherent; the `fail` probe carries the fail-closed assertion.
 */
export const FAIL_SCENARIOS: readonly SimScenario[] = [
  {
    id: 'fail-payer-autodeny-thin',
    label: 'FAIL (payer): auto-denial on thin evidence (D0) — tier-capped, cannot act',
    cpt: '72148',
    service: 'MRI lumbar spine',
    contractedAllowed: 1150,
    paidAmount: 800,
    prAmount: 150,
    coAmount: 100,
    pasDecision: 'denied',
    evidenceTier: 'D0',
    goldCarded: false,
    remittanceDate: '2026-08-05T00:00:00.000Z',
    fail: {
      class: 'payer-adverse',
      attemptedActionType: 'auto-denial',
      attemptedAutonomy: 'autonomous',
    },
  },
  {
    id: 'fail-provider-thin-evidence',
    label:
      'FAIL (provider): recovery on absent evidence (D0) — capped to assist, no autonomous draft',
    cpt: '70553',
    service: 'MRI brain w/ & w/o contrast',
    contractedAllowed: 1400,
    paidAmount: 1050,
    prAmount: 200,
    coAmount: 120,
    pasDecision: 'approved',
    evidenceTier: 'D0',
    goldCarded: false,
    remittanceDate: '2026-08-01T00:00:00.000Z',
    fail: {
      class: 'provider-evidence',
      attemptedActionType: 'escalate-reconciliation-review',
      attemptedAutonomy: 'autonomous',
    },
  },
  {
    id: 'fail-submission-gateway',
    label: 'FAIL (gateway): payer submission blocked at the human gate even at D3 / autonomous',
    cpt: '74177',
    service: 'CT abdomen/pelvis w/ contrast',
    contractedAllowed: 1650,
    paidAmount: 1300,
    prAmount: 250,
    coAmount: 130,
    pasDecision: 'approved',
    evidenceTier: 'D3',
    goldCarded: false,
    remittanceDate: '2026-08-10T00:00:00.000Z',
    // The scenario's OWN recovery action is a payer-facing submission — so the sim GATE
    // (not just the probe) shows it human-gated regardless of rung.
    actionType: 'x12-837-corrected',
    isSubmission: true,
    fail: {
      class: 'submission-gateway',
      attemptedActionType: 'x12-837-corrected',
      attemptedAutonomy: 'autonomous',
      isSubmission: true,
    },
  },
  // Wave-13.1 MED-6 (2) — the single most persuasive fail-closed demo: an ADVERSE action
  // (recoupment / money-moving direction) at settlement-grade evidence (D3) under FULL
  // autonomy. The rung is A3 (NOT evidence-capped) — yet the interlock STILL blocks it:
  // adverse coverage/financial actions are human-gated regardless of rung. "Denied and
  // stays denied / recoupment human-gated regardless of rung."
  {
    id: 'fail-adverse-recoup-d3',
    label:
      'FAIL (adverse): recoupment at settlement-grade D3 + autonomous — rung A3, STILL blocked',
    cpt: '74177',
    service: 'CT abdomen/pelvis w/ contrast',
    contractedAllowed: 1650,
    paidAmount: 1300,
    prAmount: 250,
    coAmount: 130,
    pasDecision: 'approved',
    evidenceTier: 'D3',
    goldCarded: false,
    remittanceDate: '2026-08-10T00:00:00.000Z',
    // The recovery action itself is adverse (money-moving) — the sim GATE demotes it out
    // of `recoverable-agent-draft` to `recoverable-manual` even though the rung is A3.
    actionType: 'recoupment',
    fail: {
      class: 'payer-adverse',
      attemptedActionType: 'recoupment',
      attemptedAutonomy: 'autonomous',
    },
  },
];
