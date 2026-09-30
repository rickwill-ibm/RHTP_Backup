// CONTRACT: C-REVQUAL
/**
 * The reviewer-qualification step on the PA decision route, extracted so the route stays readable
 * and so this decision — WHICH requirement applies to WHICH determination — has one home.
 *
 * WHY IT RUNS BEFORE THE FACT-TAINT GATE. Three reasons, and the first is the one that matters:
 *
 * 1. INFORMATION DISCLOSURE. The taint refusal interpolates the offending fact key into both the
 *    audit detail and the API RESPONSE BODY. Run second, an unqualified caller learns which
 *    determinative-fact keys the route recognises and which one is tainted — an enumeration oracle
 *    behind a coarse role gate.
 * 2. AUTHORIZATION PRECEDES CONTENT INSPECTION. A qualification refusal is about the ACTOR; a taint
 *    refusal is about the CASE. An actor-refusal should not require a case record to be attributable.
 * 3. It sits naturally beside the existing `evaluateDecision` gate, which already runs before any
 *    body-content inspection.
 *
 * And when the SECOND gate refuses, the audit row carries the qualification verdict computed here —
 * otherwise the record shows a refusal with no attributable credentialed actor, and on a re-submission
 * you cannot prove the same person tried twice with different facts.
 */
import {
  assertReviewerQualified,
  type NeedDomain,
  type QualifiedReviewer,
} from '@/lib/authz/credentialing';

/**
 * The enumerated bases on which a denial may be ADMINISTRATIVE rather than clinical.
 *
 * Closed set, validated server-side, recorded in the audit row. `'clinical'` is the default for any
 * rejection that does not declare one, because that is the safe end: the cost of treating an
 * eligibility denial as clinical is that a licensed reviewer signs it; the cost of the reverse is an
 * unlicensed reviewer signing a medical-necessity denial.
 */
const DENIAL_BASES = ['clinical', 'eligibility', 'timeliness', 'benefit-exhaustion'] as const;
export type DenialBasis = (typeof DENIAL_BASES)[number];
export const isDenialBasis = (v: unknown): v is DenialBasis =>
  typeof v === 'string' && (DENIAL_BASES as readonly string[]).includes(v);

/** The need domains a request may declare, parsed rather than cast. */
const NEED_DOMAINS: readonly NeedDomain[] = ['medical', 'behavioral-health', 'ltss'];
export const isNeedDomain = (v: unknown): v is NeedDomain =>
  typeof v === 'string' && (NEED_DOMAINS as readonly string[]).includes(v);

/**
 * Qualify the acting reviewer for this determination.
 *
 * `needDomain` is REQUIRED on an adverse decision and deliberately has no default. 42 CFR
 * 438.210(b)(3) names three domains, and a reviewer attested for `medical` is not thereby attested
 * for behavioral health or LTSS — silently defaulting to `medical` would let a medical attestation
 * satisfy a behavioral-health denial, which is precisely the substitution the rule exists to prevent
 * and precisely the error the platform already had to retract once ("qualified physician decider").
 *
 * Throws `ReviewerNotQualifiedError` (the route maps the code to a 403) or
 * `CredentialingNotConfiguredError` (503 — the system cannot name its reviewers).
 */
export function qualifyReviewer(args: {
  reviewerRef: string;
  decision: 'approved' | 'rejected';
  denialBasis?: DenialBasis;
  needDomain: NeedDomain;
  licenceJurisdiction: string;
  asOfMs: number;
}): QualifiedReviewer {
  // A REJECTED service-authorization decision IS the 42 CFR 438.210(b)(3) object. Full stop.
  //
  // WHAT THIS REPLACED, AND WHY IT WAS THE WORST DEFECT IN THE WAVE. It read
  // `args.decision === 'rejected' && isAdverseCoverageAction(args.action)`, where `action.actionType`
  // is `body.actionType` — FREE TEXT FROM THE REQUEST — and `isAdverseCoverageAction` is a substring
  // match over a fixed token list. So a caller posting `actionType: 'pa-determination'` with
  // `decision: 'rejected'` matched none of deny|denial|adverse|reduce|…, fell through to
  // `administrative`, and the administrative path performs NO licence check and NO attestation
  // check. An authenticated reviewer with an expired licence, a restricted licence, or no licence at
  // all could record a behavioral-health denial. THE CLIENT CHOSE WHETHER THE CLINICAL BAR APPLIED.
  //
  // The asymmetry was the tell: every other gate on this route keys on `decision === 'rejected'` —
  // the needDomain requirement, the fact-taint gate, `isAdverseProvenanceComplete`. Only this one
  // asked the client. The route already knows it is a denial.
  //
  // The genuinely administrative denial classes still exist, but they must be DECLARED and
  // enumerated, never inferred from an unvalidated string — and the audit row records which was
  // claimed, so "this was only an eligibility denial" is a statement someone made, not a gap.
  const clinical =
    args.decision === 'rejected' &&
    args.denialBasis !== 'eligibility' &&
    args.denialBasis !== 'timeliness' &&
    args.denialBasis !== 'benefit-exhaustion';
  return assertReviewerQualified(
    args.reviewerRef,
    {
      kind: 'initial-determination',
      determinationClass: clinical ? 'clinical' : 'administrative',
      needDomain: args.needDomain,
      licenceJurisdiction: args.licenceJurisdiction,
    },
    args.asOfMs
  );
}
