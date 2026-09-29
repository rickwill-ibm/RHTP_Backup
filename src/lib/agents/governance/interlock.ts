/**
 * Twin-Ladder INTERLOCK (Wave-1, safety-critical governance).
 *
 * Pairs the two ladders that jointly bound what an agent may DO:
 *   - the AUTONOMY ladder (manifest tier → the rung the operator granted), and
 *   - the EVIDENCE ladder (evidence tier → the rung the evidence can license).
 *
 * The permitted authority rung is the WEAKEST link — the min-by-ordinal of the
 * two. Strong autonomy on weak evidence is capped by the evidence; strong
 * evidence under a cautious autonomy tier is capped by the tier.
 *
 * This module does NOT fork the decision gate. The qualified-human invariant is
 * still owned by `decisionGate.evaluateDecision` / `isAdverseCoverageAction`;
 * the interlock reuses them so the SAME logic governs who may resolve an action.
 * The interlock only ADDS the money-moving / low-rung human requirements on top.
 *
 * Pure and deterministic; all reason strings are PHI-safe (no free-text payload).
 */

import type { AutonomyTier } from '@/lib/agents/manifest/types';
import type { ProposedAction, HumanDecision } from '@/lib/agentRuntime/types';
import { evaluateDecision, isAdverseCoverageAction, isSubmissionActionType } from './decisionGate';
import {
  type EvidenceTier,
  type AuthorityRung,
  RUNG_ORDER,
  TIER_RUNG_CEILING,
} from '@/lib/evidence/tierConfig';

/**
 * The rung each autonomy tier is granted BEFORE the evidence ceiling applies:
 *   HITL → A1 (a human must act), HOTL → A2, autonomous → A3.
 * A0 (assist-only) is never granted by autonomy — it can only arise as an
 * evidence ceiling (D0). Frozen so no runtime path can widen a tier's grant.
 */
export const AUTONOMY_RUNG: Readonly<Record<AutonomyTier, AuthorityRung>> = Object.freeze({
  HITL: 'A1',
  HOTL: 'A2',
  autonomous: 'A3',
});

/**
 * The lower (weaker) of two rungs by ordinal.
 *
 * FAIL-CLOSED ON AN UNRANKED INPUT, and it was not. `RUNG_ORDER[a]` is `undefined` for a rung this
 * table does not know, and `undefined <= 2` evaluates to `false` — so the comparison fell through and
 * returned `b`, the OTHER input. A "weakest link" primitive that returns the STRONGER of its two
 * arguments when one of them is unreadable is a fail-open, and it is the kind that gets reused: one
 * unranked input to this function silently licenses the full evidence ceiling, and then `lowRung` is
 * false, and then the human gate never engages. Unranked now floors to A0, which is what "I cannot
 * rank this" should mean in a function that exists to bound authority.
 */
function minRung(a: AuthorityRung, b: AuthorityRung): AuthorityRung {
  const ra = RUNG_ORDER[a];
  const rb = RUNG_ORDER[b];
  if (ra === undefined || rb === undefined) return 'A0';
  return ra <= rb ? a : b;
}

/**
 * The permitted authority rung: the weakest link between what autonomy grants
 * and what the evidence tier's ceiling can license.
 *
 * The two lookups can miss for the same reason `minRung` guards: the tier is read from a MANIFEST and
 * the evidence tier from a record, and the narrow parameter types are a claim about callers. A miss
 * reaches `minRung` as `undefined` and floors to A0 — assist-only, human-gated — rather than
 * inheriting whichever side happened to resolve.
 */
export function permittedRung(
  manifestTier: AutonomyTier,
  evidenceTier: EvidenceTier
): AuthorityRung {
  return minRung(AUTONOMY_RUNG[manifestTier], TIER_RUNG_CEILING[evidenceTier]);
}

export interface InterlockInput {
  manifestTier: AutonomyTier;
  evidenceTier: EvidenceTier;
  action: ProposedAction;
  humanDecision?: HumanDecision | null;
  /**
   * FIX-1: some actions are payer-facing / money-moving submissions
   * (submit/transmit an appeal, rebill, adjustment, recoupment). These are
   * human-gated regardless of rung — a draft may be produced autonomously, a
   * submission may not.
   */
  isSubmission?: boolean;
}

export interface InterlockResult {
  permittedRung: AuthorityRung;
  /** True if the evidence ceiling lowered the rung below the manifest rung. */
  cappedByEvidence: boolean;
  requiresHuman: boolean;
  /** May this action resolve now with the given (or absent) humanDecision? */
  resolved: boolean;
  /** PHI-safe reason for the interlock outcome. */
  reason: string;
}

/**
 * Evaluate the twin-ladder interlock for one proposed action.
 *
 * Safety property (the adversarial-after pass attacks this): an adverse coverage
 * action OR a payer-facing submission is human-gated regardless of rung and can
 * NEVER auto-resolve on autonomy alone — not even at A3 / D3. The qualified-human
 * check is delegated to `evaluateDecision` (forced through its human-required
 * path) so the interlock and the decision gate share one definition of a
 * qualified human.
 */
export function evaluateInterlock(input: InterlockInput): InterlockResult {
  const rung = permittedRung(input.manifestTier, input.evidenceTier);
  const cappedByEvidence =
    RUNG_ORDER[TIER_RUNG_CEILING[input.evidenceTier]] <
    RUNG_ORDER[AUTONOMY_RUNG[input.manifestTier]];

  const adverse = isAdverseCoverageAction(input.action);
  // C4: submission-class is derived from the SINGLE `isSubmissionActionType` predicate
  // (keyed on actionType); the `isSubmission` flag is a cache of it. A submission-class
  // actionType with the flag omitted is still human-gated — never a second source.
  const submission = input.isSubmission === true || isSubmissionActionType(input.action.actionType);
  // A0 (assist) and A1 (HITL) always need a human to actually act.
  const lowRung = RUNG_ORDER[rung] <= RUNG_ORDER['A1'];
  const requiresHuman = adverse || submission || lowRung;

  // Delegate the resolve decision to the decision gate so the SAME qualified-human
  // logic governs. When a human is required by the interlock (adverse, submission,
  // or low rung), force the gate through its human-required path (HITL) so autonomy
  // can NEVER auto-resolve it; otherwise the (HOTL/autonomous) tier auto-resolves.
  const gate = evaluateDecision({
    action: input.action,
    autonomyTier: requiresHuman ? 'HITL' : input.manifestTier,
    humanDecision: input.humanDecision ?? null,
  });
  const resolved = gate.resolved;
  // The gate's answer is ADDITIVE, never discarded. This returned the locally computed
  // `requiresHuman` alone, so a gate that blocked for a reason the interlock does not model — an
  // unrecognised autonomy tier, say — produced `{ resolved: false, requiresHuman: false }` with a
  // reason string claiming the action auto-resolved. Consumers read the flag (`governedAction.ts`,
  // `ledgerAnalytics.ts` both surface it to the UI and the API body), so the item would have landed
  // labelled "no human needed" and then never resolved: a silent stall, not a safe refusal.
  const humanRequired = requiresHuman || gate.requiresHuman;

  return {
    permittedRung: rung,
    cappedByEvidence,
    requiresHuman: humanRequired,
    resolved,
    reason: buildReason({
      rung,
      cappedByEvidence,
      adverse,
      submission,
      lowRung,
      requiresHuman: humanRequired,
      resolved,
    }),
  };
}

/** Build a PHI-safe reason string from the interlock drivers. */
function buildReason(x: {
  rung: AuthorityRung;
  cappedByEvidence: boolean;
  adverse: boolean;
  submission: boolean;
  lowRung: boolean;
  requiresHuman: boolean;
  resolved: boolean;
}): string {
  const capNote = x.cappedByEvidence ? ` (rung capped to ${x.rung} by evidence ceiling)` : '';
  if (!x.requiresHuman) {
    return `auto-resolved at permitted rung ${x.rung}${capNote}`;
  }
  const drivers: string[] = [];
  if (x.adverse) drivers.push('adverse coverage action');
  if (x.submission) drivers.push('payer-facing submission');
  if (x.lowRung) drivers.push(`assist/HITL rung ${x.rung}`);
  const why = drivers.join(', ');
  return x.resolved
    ? `human-gated (${why}) resolved by qualified human${capNote}`
    : `BLOCKED: human-gated (${why}) requires a qualified human decision${capNote}`;
}
