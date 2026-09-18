/**
 * Tier-independent AI decision gate (HW-AI / I16, program-spine contract C-DEC).
 *
 * The AI-governance lens found the highest-severity class (3 Crit): a coverage-
 * affecting / ADVERSE action (a PA denial, a coverage termination, a benefit
 * reduction) could auto-resolve — via a HOTL SLA-timeout auto-approve or an
 * autonomous tier — with no qualified human in the loop. Federal and state rules
 * require a qualified human for an adverse benefit determination; automation may
 * assist but not decide it.
 *
 * The invariant here is TIER-INDEPENDENT: regardless of HITL / HOTL / autonomous,
 * an adverse coverage-affecting action resolves ONLY on an explicit qualified-human
 * decision. Favorable / non-coverage actions may still follow the autonomy tier.
 * This is the single gate the runtime consults before any auto-approval.
 */

import type { ProposedAction, HumanDecision } from '@/lib/agentRuntime/types';

/**
 * Action types that are COVERAGE-AFFECTING and ADVERSE — they deny, reduce, or
 * terminate a benefit / authorization. Matched on the code-level actionType
 * (substring, case-insensitive) so a new adverse action can't slip the gate by
 * naming. Favorable actions (approve, outreach, schedule) are intentionally absent.
 */
const ADVERSE_COVERAGE_PATTERNS = [
  'deny',
  'denial',
  'denied',
  'terminate',
  'termination',
  'reduce',
  'reduction',
  'downgrade',
  'revoke',
  'rescind',
  'disenroll',
  'adverse',
  'noncoverage',
  'non-coverage',
  'partial-approval',
  'modify-authorization',
  // Financial-adverse class (FIX-1): recoupment / member-billing directions must
  // fail closed. Today's underpayment DRAFT carries none of these tokens, so
  // nothing regresses; future money-recovery directions are gated closed.
  'recoup',
  'recoupment',
  'offset',
  'clawback',
  'takeback',
  'overpayment',
  'balance-bill',
  'balance bill',
  // Provider-facing PI adverse class (Phase-G): a payment suspension / exclusion / debarment /
  // sanction holds or bars payment and is adverse — a human determination. Deliberately NOT
  // 'freeze': the tamper-response `integrity-freeze` is a fast, system-protective action and must
  // remain able to auto-fire; provider payment suspension is a distinct, human-gated concept.
  'suspend',
  'suspension',
  'exclude',
  'exclusion',
  'debar',
  'sanction',
];

/** Is this proposed action an adverse coverage-affecting action (human-required)? */
export function isAdverseCoverageAction(action: Pick<ProposedAction, 'actionType'>): boolean {
  const t = (action.actionType || '').toLowerCase();
  return ADVERSE_COVERAGE_PATTERNS.some((p) => t.includes(p));
}

/**
 * C4 — the SINGLE source of truth for the payer-facing SUBMISSION class, keyed on the
 * code-level `actionType`. The X12 (276/278/275/837-corrected) + `appeal` governed actions
 * transmit to a payer, so they are human-gated regardless of rung. Both `isAutoApprovable`
 * and `evaluateInterlock` derive submission-class from THIS predicate, so a `ProposedAction`
 * whose `isSubmission` flag is omitted (a future submission-class type built without the
 * flag) can NEVER auto-approve — the boolean flag is a cache of this predicate, not a
 * second, drift-prone source. `governedAction.isSubmissionAction` also delegates here so
 * the recorder, runner, route and gate share ONE definition.
 */
const SUBMISSION_ACTION_TYPES: ReadonlySet<string> = new Set([
  'x12-276',
  'x12-278',
  'x12-275',
  'x12-837-corrected',
  'appeal',
]);

/** Is this code-level actionType payer-facing SUBMISSION-class (human-gated)? */
export function isSubmissionActionType(actionType: string | null | undefined): boolean {
  return typeof actionType === 'string' && SUBMISSION_ACTION_TYPES.has(actionType);
}

/** A human decision is one made by a qualified reviewer, NOT an autonomy actor. */
export function isQualifiedHumanDecision(decision: HumanDecision | null | undefined): boolean {
  if (!decision) return false;
  const by = (decision.decidedBy || '').toLowerCase();
  // The runtime stamps auto-approvals as `autonomy:<tier>`; a real human decision
  // never carries that prefix. An empty/auto actor is not a qualified human.
  return by.length > 0 && !by.startsWith('autonomy:') && by !== 'system';
}

export interface GateInput {
  action: ProposedAction;
  autonomyTier: 'HITL' | 'HOTL' | 'autonomous';
  /** The decision being applied, if any (a human resolution or a proposed auto one). */
  humanDecision?: HumanDecision | null;
}

export interface GateResult {
  /** May this action resolve now with the given decision? */
  resolved: boolean;
  /** Does this action REQUIRE a qualified human regardless of tier? */
  requiresHuman: boolean;
  /** PHI-safe reason for the gate outcome (audit + member-facing derivation). */
  reason: string;
}

/**
 * The gate. For an adverse coverage action it IGNORES the autonomy tier and
 * permits resolution only with a qualified human decision; otherwise the tier
 * governs (autonomous/HOTL may auto-approve, HITL still needs a human).
 */
export function evaluateDecision(input: GateInput): GateResult {
  const requiresHuman = isAdverseCoverageAction(input.action);
  if (requiresHuman) {
    const human = isQualifiedHumanDecision(input.humanDecision);
    return {
      resolved: human,
      requiresHuman: true,
      reason: human
        ? 'adverse coverage action resolved by qualified human'
        : 'adverse coverage action BLOCKED: qualified human decision required (tier-independent)',
    };
  }
  // Non-adverse: the tier governs.
  if (input.autonomyTier === 'HITL') {
    const human = isQualifiedHumanDecision(input.humanDecision);
    return {
      resolved: human,
      requiresHuman: false,
      reason: human ? 'HITL human decision' : 'HITL awaiting human',
    };
  }
  return {
    resolved: true,
    requiresHuman: false,
    reason: `auto-resolved under ${input.autonomyTier}`,
  };
}

/**
 * Convenience for the runtime's auto-approve branch: may this action be
 * auto-approved (no human) under its tier? False for every adverse coverage action.
 */
export function isAutoApprovable(
  action: ProposedAction,
  tier: 'HITL' | 'HOTL' | 'autonomous'
): boolean {
  if (isAdverseCoverageAction(action)) return false; // tier-independent block
  // Wave-3 MED-3 + C4: a payer-facing SUBMISSION always needs a qualified human,
  // regardless of tier — the durable runtime auto-approve gate must carry the
  // same guarantee the workflow-level interlock asserts. Submission-class is derived
  // from the SINGLE `isSubmissionActionType` predicate keyed on the code-level
  // actionType; the `isSubmission` flag is just a cache of it. So a submission-class
  // action built WITHOUT the flag (a future X12/appeal type) still cannot auto-approve
  // — the block no longer trusts the boolean alone. Non-submission actions omit the
  // flag and are not in the predicate → unchanged behavior.
  if (action.isSubmission === true || isSubmissionActionType(action.actionType)) return false;
  return tier === 'HOTL' || tier === 'autonomous';
}
