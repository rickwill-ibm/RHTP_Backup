/**
 * Coverage DISPOSITION — the single truth table that turns a per-code coverage determination into the
 * CRD coverage classification, PA flag, coverage-information codings, and DTR-pathway pointer.
 *
 * A `CodeDisposition` is the human-facing coverage determination for one procedure code:
 *   • covered-pa      — covered, prior authorization required (complete the DTR).
 *   • not-covered     — a plain benefit/coverage exclusion.
 *   • investigational — experimental / investigational (a not-covered with a distinct basis).
 *   • pending         — undetermined; policy-referenced, PA-required by default until a human decides.
 *
 * This module is the ONE place that maps a disposition onto (a) the engine's ProcedureRule coverage
 * input, so the policy engine stays the single coverage brain, and (b) the workbench's `CoverageRule`
 * projection, so the SERVER ingest seam and the CLIENT Generate step cannot drift. Pure, deterministic,
 * payer-agnostic, and free of UI types.
 */
import type { CoverageCode, CoverageBasis } from '@/lib/policy/encode/ir';
import type { CoverageRole } from '@/lib/policy/dtr/questionnairePackage';
import type { CoverageRule } from './coverageRule';

export type CodeDisposition = 'covered-pa' | 'not-covered' | 'investigational' | 'pending';

export const CRD_COV = 'http://hl7.org/fhir/us/davinci-crd/CodeSystem/coverage-information';

/**
 * Disposition → the engine's ProcedureRule coverage input. The ENGINE remains the single coverage
 * brain: we hand it only the human's (or the section-inferred default) determination as
 * coverageCode/basis; the engine derives role + PA + questionnaire pointer from it. `pending` omits the
 * coverageCode so the engine treats the code as policy-referenced (never fabricated 'covered').
 */
export function dispositionToInput(d: CodeDisposition): {
  coverageCode?: CoverageCode;
  basis?: CoverageBasis;
} {
  switch (d) {
    case 'covered-pa':
      return { coverageCode: 'auth-needed' };
    case 'not-covered':
      return { coverageCode: 'not-covered', basis: 'benefit-exclusion' };
    case 'investigational':
      return { coverageCode: 'not-covered', basis: 'experimental-investigational' };
    case 'pending':
      return {};
  }
  const _exhaustive: never = d;
  return _exhaustive;
}

/** Disposition → the workbench CoverageRule role. */
export function dispositionToRole(d: CodeDisposition): CoverageRole | 'referenced' {
  switch (d) {
    case 'covered-pa':
      return 'covered';
    case 'not-covered':
      return 'not-covered';
    case 'investigational':
      return 'investigational';
    case 'pending':
      return 'referenced';
  }
  const _exhaustive: never = d;
  return _exhaustive;
}

/** Whether a disposition requires prior authorization. Covered·PA and pending (referenced,
 *  PA-by-default) require PA; a not-covered or investigational code does not. */
export function priorAuthForDisposition(d: CodeDisposition): boolean {
  return d === 'covered-pa' || d === 'pending';
}

/** Whether a disposition advertises a DTR pathway. A denied/investigational code never points at a
 *  questionnaire; covered·PA and pending point at the one per-policy DTR Questionnaire. */
export function dispositionHasPathway(d: CodeDisposition): boolean {
  return d === 'covered-pa' || d === 'pending';
}

/**
 * Da Vinci CRD `coverage-information` codings for a (role, PA) pair — the coded classification the CRD
 * card carries. Honest by role: an undetermined (referenced) code is `pending-review`, never `covered`.
 * Moved here from `engineCoverageRules` so ingest and the client projection share one definition.
 */
export function coverageInfoFor(
  role: CoverageRole | 'referenced',
  priorAuthRequired: boolean
): { system: string; code: string; display: string }[] {
  const pa = priorAuthRequired
    ? [{ system: CRD_COV, code: 'prior-auth-required', display: 'Prior authorization required' }]
    : [{ system: CRD_COV, code: 'no-auth', display: 'No prior authorization required' }];
  switch (role) {
    case 'covered':
      return [{ system: CRD_COV, code: 'covered', display: 'Covered' }, ...pa];
    case 'investigational':
      return [
        { system: CRD_COV, code: 'not-covered', display: 'Not covered' },
        {
          system: CRD_COV,
          code: 'experimental-investigational',
          display: 'Experimental / investigational',
        },
      ];
    case 'not-covered':
      return [{ system: CRD_COV, code: 'not-covered', display: 'Not covered' }];
    case 'ambiguous':
      return [{ system: CRD_COV, code: 'conditional', display: 'Conditional — review' }, ...pa];
    case 'supporting':
      return [{ system: CRD_COV, code: 'covered', display: 'Covered' }];
    default:
      return [
        { system: CRD_COV, code: 'pending-review', display: 'Coverage pending review' },
        ...pa,
      ];
  }
}

function reasonFor(rule: CoverageRule, d: CodeDisposition): string {
  const title = rule.policyTitle;
  switch (d) {
    case 'covered-pa':
      return `Prior authorization required under ${title}; complete the DTR template.`;
    case 'not-covered':
      return `Not covered under ${title}.`;
    case 'investigational':
      return `Considered investigational under ${title}.`;
    case 'pending':
      return `Referenced by ${title}; coverage pending review — PA required by default.`;
  }
  const _exhaustive: never = d;
  return _exhaustive;
}

/**
 * Re-project a CoverageRule to reflect a final disposition. Pure, client-safe (no engine import), and
 * IDEMPOTENT: the result depends only on the rule's identity fields (code/system/display/policy) and
 * the disposition, never on a previously-projected field, so applying twice with the same disposition
 * yields the same rule. A denied/investigational code drops its DTR pathway (empty canonical) and PA;
 * covered·PA and pending keep the per-policy questionnaire canonical.
 */
export function applyDisposition(
  rule: CoverageRule,
  d: CodeDisposition,
  opts: { canonical?: string } = {}
): CoverageRule {
  const role = dispositionToRole(d);
  // No-op when the disposition already matches how the engine built this rule: return it VERBATIM
  // (preserving the engine's reason + canonical) so projecting with the section-inferred default
  // reproduces the ingest rule byte-for-byte — only a genuine re-decision re-projects. Each
  // disposition maps to a distinct role, so an equal role means an equal disposition.
  if (role === rule.role) return rule;
  const priorAuthRequired = priorAuthForDisposition(d);
  // Treat an EMPTY canonical as absent (the engine emits '' for a code with no pathway), so a code
  // re-decided covered/pending recovers a real DTR canonical instead of blanking it. `||`, not `??`.
  const canonical = dispositionHasPathway(d) ? opts.canonical || rule.questionnaireCanonical : '';
  return {
    ...rule,
    role,
    priorAuthRequired,
    coverageInfo: coverageInfoFor(role, priorAuthRequired),
    questionnaireCanonical: canonical,
    reason: reasonFor(rule, d),
  };
}
