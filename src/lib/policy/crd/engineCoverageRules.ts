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
import {
  coverageInfoFor,
  dispositionToInput,
  type CodeDisposition,
} from '@/lib/policy/crd/coverageDisposition';

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
 *
 * `dispositions` carries the per-code coverage determination — the section-inferred DEFAULT at ingest,
 * or the human maker's decision on re-generate. A code with no disposition stays `pending` (referenced,
 * PA-required by default), so this remains payer-agnostic and never fabricates 'covered' on its own.
 */
export function engineCoverageRulesForReview(
  criteriaSections: CriteriaGroup[] | undefined,
  codes: GuidelineCode[] | undefined,
  opts: {
    service?: string;
    guidelineId?: string;
    policyId: string;
    policyTitle: string;
    dispositions?: Record<string, CodeDisposition>;
  }
): CoverageRule[] | null {
  if (!codes || codes.length === 0) return null;
  const procedures: ProcedureRule[] = codes.map((c) => {
    // Hand the engine the determination as coverageCode/basis; the engine derives role + PA. No
    // disposition ⇒ coverageCode omitted ⇒ the engine treats the code as policy-referenced (pending).
    const { coverageCode, basis } = dispositionToInput(opts.dispositions?.[c.code] ?? 'pending');
    return {
      code: c.code,
      system: c.codeSystem,
      sourceText: c.description ?? c.code,
      sourceSpan: { start: 0, end: 0 },
      ...(coverageCode ? { coverageCode } : {}),
      ...(basis ? { basis } : {}),
    };
  });
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
    const role = toRole(r.coverageCode, r.basis);
    // A not-covered / investigational code never advertises a DTR pathway — do NOT re-attach the
    // canonical the engine deliberately withheld. Covered / conditional / pending codes point at it.
    const wantsPathway = role !== 'not-covered' && role !== 'investigational';
    out.push({
      code: r.code,
      codeSystem: gc.codeSystem,
      display: gc.description,
      priorAuthRequired: r.priorAuthRequired,
      policyId: opts.policyId,
      policyTitle: opts.policyTitle,
      questionnaireCanonical: r.questionnaireCanonical ?? (wantsPathway ? canonical : ''),
      role,
      coverageInfo: coverageInfoFor(role, r.priorAuthRequired),
      reason:
        r.reason ??
        (role === 'referenced'
          ? `Referenced by ${opts.policyTitle}; coverage pending review — PA required by default.`
          : `Prior authorization required under ${opts.policyTitle}; complete the DTR template.`),
    });
  }
  return out.length ? out : null;
}
