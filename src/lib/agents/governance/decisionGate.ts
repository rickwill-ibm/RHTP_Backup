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
import { isPlaceholderIdentity } from '@/lib/authz/principal';

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

/**
 * Is this decider a person rather than an automation actor or a placeholder?
 *
 * RENAMED from `isQualifiedHumanDecision`, which is what it was called while testing exactly this.
 * The old name documented a control that did not exist — it never looked at a licence, a specialty
 * or a credential, so `'human:bob'` passed — and three of its four callers gate X12/appeal
 * SUBMISSIONS (financial recovery), where a clinical-peer requirement has no statutory basis and
 * would block legitimate revenue-cycle operations. So the decider-CLASS predicate keeps its job
 * under an honest name, and clinical qualification is a separate assert
 * (`@/lib/authz/credentialing.assertReviewerQualified`) wired only where a 42 CFR 438.210 object is
 * in play.
 *
 * `'session-user'` is now refused (register G-046). `authz/principal.deriveUserId` returns that
 * literal when a session carries no `fhirUser`, `approvalAuthority.isNonIdentity` has always blocked
 * it, and this function accepted it — two reviewer-authorization mechanisms disagreeing about the
 * placeholder identity, live, on `/api/pa/decision`.
 */
export function isNonAutomatedDecider(
  decision: HumanDecision | string | null | undefined
): boolean {
  const raw = typeof decision === 'string' ? decision : (decision?.decidedBy ?? '');
  const by = raw.trim().toLowerCase();
  // The runtime stamps auto-approvals as `autonomy:<tier>`; a real human decision never carries
  // that prefix. An empty, automated or placeholder actor is not a person. The placeholder set is
  // single-sourced (`authz/principal`) because three copies of it had already drifted apart.
  if (by.startsWith('autonomy:') || by === 'system') return false;
  return !isPlaceholderIdentity(by);
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
    const human = isNonAutomatedDecider(input.humanDecision);
    return {
      resolved: human,
      requiresHuman: true,
      reason: human
        ? 'adverse coverage action resolved by qualified human'
        : 'adverse coverage action BLOCKED: qualified human decision required (tier-independent)',
    };
  }
  // Non-adverse: the tier governs — EXHAUSTIVELY, and fail-closed on anything else.
  //
  // WHAT THIS REPLACED (register MED-9). The branch was `if (tier === 'HITL') {...}` followed by an
  // unconditional `return { resolved: true }`. That trailing return was the default for every value
  // that is not the string 'HITL' — so a fourth autonomy tier, or a manifest carrying a typo'd tier
  // string, auto-resolved the action with no human. A safety gate whose unknown-input default is
  // "permit" is the fail-open this module exists to prevent, on the other axis from the adverse one.
  //
  // HONEST REACHABILITY, because the first draft of this comment overstated it and was corrected in
  // adversarial review: no CURRENT path delivers an unknown tier here. `manifest/registry.ts`
  // validates the tier on the default path, and the production-loader path routes through
  // `assertManifestsWithinLock` → `assertAuthority.rank`, which THROWS on a tier outside
  // `AUTONOMY_ORDER`. So this is defence in depth behind a gate that does hold, and the load-bearing
  // half is the compile-time `never` below, not a runtime rescue. Saying otherwise would point a
  // future reviewer at a load path that already validates and away from one that might not.
  switch (input.autonomyTier) {
    case 'HITL': {
      const human = isNonAutomatedDecider(input.humanDecision);
      return {
        resolved: human,
        requiresHuman: false,
        reason: human ? 'HITL human decision' : 'HITL awaiting human',
      };
    }
    case 'HOTL':
    case 'autonomous':
      return {
        resolved: true,
        requiresHuman: false,
        reason: `auto-resolved under ${input.autonomyTier}`,
      };
    default: {
      // INVARIANT: exhaustive over the autonomy tiers. Adding a tier without deciding here fails
      // `tsc --noEmit` on this assignment — the decision is forced at compile time. And at RUNTIME
      // an unrecognised tier blocks and demands a human rather than resolving.
      const unknownTier: never = input.autonomyTier;
      void unknownTier;
      return {
        resolved: false,
        requiresHuman: true,
        // FIXED string: `reason` is documented PHI-safe (no free-text payload) and is returned in an
        // API body, so an unvalidated manifest value does not get interpolated into it. The offending
        // value belongs in a structured log field, not in a member-derivable reason.
        reason:
          'BLOCKED: unrecognised autonomy tier — a tier this gate does not know is never permitted to auto-resolve',
      };
    }
  }
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
