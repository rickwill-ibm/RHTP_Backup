/**
 * CRD projection — PolicyLogic → coverage rules + coverage-information (RHTP Policy Engine).
 *
 * This is the CRD half of the golden thread. Per the Da Vinci ruling, CRD NAMES the criteria and
 * states coverage/PA/doc-needed; it does NOT evaluate clinical criteria (that is DTR pre-population
 * over the same Questionnaire). So `toCoverageRules` emits the coverage rule the runtime CRD reads,
 * pointing at the DTR Questionnaire canonical URL, and `crdCoverageInformation` summarizes a
 * CDS-Hooks-style coverage-information payload. Determination detail comes from evaluate().
 *
 * The rule shape is structurally compatible with `src/lib/pa/publishedCoverage.ts` (CrdCoverageRule)
 * so the publication layer can register these for the runtime without a translation seam.
 *
 * Design authority: docs/policy-encoder-spec.md §5; the CRD≠DTR ruling (docs/crd-dtr-pas-*).
 */
import type { BoolExpr, PolicyLogic } from './ir';
import { questionnaireUrl } from './fhir';
import { evaluatePolicy, type Determination, type PatientFacts } from './evaluate';

export interface EncodedDocRequirement {
  doc: string;
  sub?: string;
  requirement: 'required' | 'recommended';
}

/** Structurally compatible with pa/publishedCoverage.CrdCoverageRule. */
export interface EncodedCoverageRule {
  code: string;
  priorAuthRequired: boolean;
  policyTitle: string;
  questionnaireCanonical?: string;
  reason?: string;
  clinicalGuideline?: string;
  docNeeded?: EncodedDocRequirement[];
  criteriaNames?: string[];
  /** CRD coverage code + basis, carried through for the coverage-information extension. */
  coverageCode?: string;
  basis?: string;
}

function leafIds(expr: BoolExpr | undefined): string[] {
  if (!expr) return [];
  if (expr.op === 'leaf') return [expr.criterionId];
  if (expr.op === 'not') return leafIds(expr.node);
  return expr.nodes.flatMap(leafIds);
}

/** The named criteria a CRD card lists — the top-level criterion labels across eligibility pathways. */
export function criteriaNamesOf(policy: PolicyLogic): string[] {
  const names: string[] = [];
  const seen = new Set<string>(); // de-dup names shared across pathways (red-team finding #7)
  for (const p of policy.pathways) {
    if (p.role !== 'eligibility') continue;
    for (const id of leafIds(p.logic)) {
      const crit = policy.criteria[id];
      if (!crit) continue;
      const name = crit.label
        ? `${crit.label}. ${firstSentence(crit.sourceText)}`
        : firstSentence(crit.sourceText);
      if (seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

function firstSentence(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  const stop = t.search(/[.:;]/);
  return (stop > 0 ? t.slice(0, stop) : t).slice(0, 120);
}

/**
 * Emit coverage rules for the runtime CRD. One rule per enumerated procedure; covered/conditional
 * procedures require PA and point at the DTR Questionnaire; not-covered/experimental procedures are
 * flagged with their basis. When the policy has no enumerated procedures, a single service-level
 * rule is emitted keyed by the guideline (so a code table can be attached later).
 */
export function toCoverageRules(policy: PolicyLogic): EncodedCoverageRule[] {
  const qurl = questionnaireUrl(policy);
  const names = criteriaNamesOf(policy);
  const docNeeded: EncodedDocRequirement[] = policy.documentation.map((d) => ({
    doc: d.doc,
    sub: d.sub,
    requirement: d.requirement,
  }));

  if (policy.procedures.length === 0) {
    return [
      {
        code: policy.guidelineId,
        priorAuthRequired: true,
        policyTitle: policy.service,
        questionnaireCanonical: qurl,
        clinicalGuideline: policy.guidelineId,
        criteriaNames: names,
        docNeeded,
        coverageCode: 'auth-needed',
      },
    ];
  }

  return policy.procedures.map((proc) => {
    const notCovered = proc.coverageCode === 'not-covered';
    // no-auth-needed / covered-without-PA must NOT be marked PA-required. (red-team finding #1)
    const paRequired =
      proc.coverageCode !== 'not-covered' && proc.coverageCode !== 'no-auth-needed';
    const rule: EncodedCoverageRule = {
      code: proc.code,
      priorAuthRequired: paRequired,
      policyTitle: policy.service,
      clinicalGuideline: policy.guidelineId,
      coverageCode: proc.coverageCode,
      basis: proc.basis,
    };
    if (!notCovered) {
      rule.questionnaireCanonical = qurl;
      rule.criteriaNames = names;
      rule.docNeeded = docNeeded;
    } else {
      rule.reason = `${proc.code} is ${proc.basis ?? 'not covered'} under ${policy.guidelineId}.`;
    }
    return rule;
  });
}

export interface CrdCoverageInformation {
  code?: string;
  coverage: string;
  priorAuthRequired: boolean;
  questionnaireCanonical?: string;
  criteriaNames: string[];
  determination: Determination;
}

/**
 * A CDS-Hooks-style coverage-information payload for an order. CRD states coverage + PA + the named
 * criteria and hands off the Questionnaire; the determination (from evaluate) is advisory detail.
 */
export function crdCoverageInformation(
  policy: PolicyLogic,
  facts: PatientFacts
): CrdCoverageInformation {
  const det = evaluatePolicy(policy, facts);
  const priorAuthRequired = det.coverage !== 'no-auth-needed' && det.coverage !== 'covered';
  return {
    code: facts.procedureCode,
    coverage: det.coverage,
    priorAuthRequired,
    questionnaireCanonical: det.coverage === 'not-covered' ? undefined : questionnaireUrl(policy),
    criteriaNames: criteriaNamesOf(policy),
    determination: det,
  };
}
