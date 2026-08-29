/**
 * Authoring "Generate CRD" adapter (policy layer).
 *
 * The ONE seam that turns reviewed criteria + codes into the CRD coverage rules the Generate stage
 * renders, sourced from the policy engine's `toCoverageRules` — replacing the legacy `buildCoverageRules`.
 * The DTR Questionnaire canonical is taken from the SAME engine encode, so the CRD rule and the DTR
 * questionnaire point at one URL (Da Vinci: CRD references the DTR Questionnaire canonical).
 *
 * Reuse, not a new generator: coverage logic lives in the engine. This maps engine `EncodedCoverageRule`
 * → the workbench's `CoverageRule` shape, joining code→system/display from the authored code list. Pure.
 */
import {
  encodePolicy,
  toCoverageRules,
  questionnaireUrl,
  type ProcedureRule,
} from '@/lib/policy/encode';
import type { CriteriaGroup, GuidelineCode } from '@/lib/policy/extract/criteria';
import { buildCriteriaPolicy } from '@/lib/policy/authoring/criteriaPolicy';
import type { CoverageRule } from '@/lib/policy/crd/coverageRule';
import type { CoverageRole } from '@/lib/policy/dtr/questionnairePackage';

function toRole(cov: string | undefined, basis: string | undefined): CoverageRole | 'referenced' {
  switch (cov) {
    case 'not-covered':
      return basis === 'experimental-investigational' ? 'investigational' : 'not-covered';
    case 'conditional':
      return 'ambiguous';
    case 'no-auth-needed':
      return 'supporting';
    case 'covered':
    case 'auth-needed':
      return 'covered';
    default:
      return 'referenced';
  }
}

/**
 * Build the CRD coverage rules for the authoring Generate stage from the engine. Returns `null` when
 * there are no codes to rule on, so the caller keeps its legacy rules.
 */
export function engineCoverageRulesForReview(
  criteriaSections: CriteriaGroup[] | undefined,
  codes: GuidelineCode[] | undefined,
  opts: { service?: string; guidelineId?: string; policyId: string; policyTitle: string }
): CoverageRule[] | null {
  if (!codes || codes.length === 0) return null;
  const procedures: ProcedureRule[] = codes.map((c) => ({
    code: c.code,
    system: c.codeSystem,
    coverageCode: 'covered', // pre-review default; the human/coding-map layer assigns the final role
    sourceText: c.description ?? c.code,
    sourceSpan: { start: 0, end: 0 },
  }));
  const policy = buildCriteriaPolicy(criteriaSections, {
    service: opts.service ?? opts.policyTitle,
    guidelineId: opts.guidelineId ?? opts.policyId,
    codes,
  });
  const logic = encodePolicy(policy, { procedures, service: opts.service });
  const canonical = questionnaireUrl(logic);
  const byCode = new Map(codes.map((c) => [c.code, c]));
  const out: CoverageRule[] = [];
  for (const r of toCoverageRules(logic)) {
    const gc = byCode.get(r.code);
    if (!gc) continue; // skip the service-level rule when procedures are enumerated
    out.push({
      code: r.code,
      codeSystem: gc.codeSystem,
      display: gc.description,
      priorAuthRequired: r.priorAuthRequired,
      policyId: opts.policyId,
      policyTitle: opts.policyTitle,
      questionnaireCanonical: r.questionnaireCanonical ?? canonical,
      role: toRole(r.coverageCode, r.basis),
      reason:
        r.reason ??
        `Prior authorization required under ${opts.policyTitle}; complete the DTR template.`,
    });
  }
  return out.length ? out : null;
}
