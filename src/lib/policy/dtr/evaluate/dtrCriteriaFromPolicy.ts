/**
 * Derive the computable DTR criteria from the AUTHORED policy — the seam that connects "Generate DTR"
 * to real patient evaluation. It encodes the reviewed criteria (the same engine the questionnaire/CQL
 * use — REUSE, not a parallel parse) and lifts the typed age / BMI thresholds and the documentation
 * criteria out of the encoded measures, so the evaluation reflects the policy the maker signed off,
 * not a hardcoded scenario. Pure.
 *
 * Comorbidity coding: bariatric-class policies enumerate obesity-related comorbidities in prose
 * ("including, but not limited to …"), which the extractor does not reduce to codes. For the BMI
 * 35–40 band rule we therefore evaluate against a STANDARD obesity-comorbidity ICD-10 set (documented
 * below), not a per-policy value set — an honest, payer-agnostic default the reviewer can widen.
 */
import type { PolicyReview } from '@/lib/policy/policyReview';
import {
  encodePolicy,
  repairGlyphs,
  isExclusionCriterion,
  measureLoincCode,
  MEASURE_LOINC,
} from '@/lib/policy/encode';
import type { BoolExpr } from '@/lib/policy/encode';
import { buildCriteriaPolicy } from '@/lib/policy/authoring/criteriaPolicy';
import type { ComputableCriterion, DtrCriteria } from './patientEvaluation';

/** A standard set of obesity-related comorbidity ICD-10 codes for the BMI 35–40 band rule. Payer-agnostic;
 *  the policy's own "including but not limited to" phrasing makes a standard set the honest default. */
export const OBESITY_COMORBIDITY_ICD10 = [
  'E11.9', // type 2 diabetes mellitus
  'I10', // essential hypertension
  'G47.33', // obstructive sleep apnea
  'E78.5', // hyperlipidemia
  'I25.10', // atherosclerotic heart disease
  'K76.0', // non-alcoholic fatty liver disease
  'M17.9', // osteoarthritis of knee
];
export const OBESITY_COMORBIDITY_LABEL =
  'type 2 diabetes, hypertension, obstructive sleep apnea, or related condition';

function clean(s: string): string {
  return repairGlyphs(s).repaired.replace(/\s+/g, ' ').trim();
}

/** A criterion reference reached from a pathway's boolean tree, carrying whether it sits under an OR
 *  (an alternative branch) so the group projector can mark it non-required. Leaves under a `not`
 *  (exclusions) are dropped — an exclusionary threshold must never read as a positive gate. */
interface LeafRef {
  criterionId: string;
  underOr: boolean;
}
function collectLeaves(
  expr: BoolExpr | undefined,
  underOr: boolean,
  negated: boolean,
  out: LeafRef[]
): void {
  if (!expr) return;
  if (expr.op === 'leaf') {
    if (!negated) out.push({ criterionId: expr.criterionId, underOr });
    return;
  }
  if (expr.op === 'not') {
    collectLeaves(expr.node, underOr, !negated, out);
    return;
  }
  if (expr.op === 'and') {
    for (const n of expr.nodes) collectLeaves(n, underOr, negated, out);
    return;
  }
  // or — every child is an alternative
  for (const n of expr.nodes) collectLeaves(n, true, negated, out);
}

/** Surface a measure with NO standard coded concept as a documentation gap (provider attests it),
 *  deduped by title against the documentation already lifted — the honest alternative to dropping it. */
function addMeasureDoc(
  sourceText: string,
  documentation: DtrCriteria['documentation'],
  seenDoc: Set<string>
): void {
  const text = clean(sourceText);
  if (!text) return;
  const title = text.length > 90 ? text.slice(0, 88).trim() + '…' : text;
  if (seenDoc.has(title)) return;
  seenDoc.add(title);
  documentation.push({ title, description: text });
}

/**
 * Encode the reviewed criteria and lift the computable rules + documentation criteria into a
 * `DtrCriteria`. Age/BMI come from the typed measures; documentation criteria come from the encoded
 * documentation-kind criteria. Anything not reducible to a measure stays documentation-gated.
 */
export function dtrCriteriaFromReview(review: PolicyReview, cptCode: string): DtrCriteria {
  const sections = review.criteriaSections ?? [];
  const logic = encodePolicy(
    buildCriteriaPolicy(sections, {
      service: review.title,
      guidelineId: review.guidelineId ?? undefined,
    }),
    { service: review.title }
  );

  let minAge: number | undefined;
  const bmiThresholds: number[] = [];
  let bmiBand: { lower: number; upper: number } | undefined;
  const documentation: DtrCriteria['documentation'] = [];
  const seenDoc = new Set<string>();

  for (const crit of Object.values(logic.criteria)) {
    const ms =
      crit.measures && crit.measures.length > 0
        ? crit.measures
        : crit.measure
          ? [crit.measure]
          : [];
    for (const m of ms) {
      if (
        m.field === 'age' &&
        typeof m.value === 'number' &&
        (m.operator === '>=' || m.operator === '>')
      ) {
        minAge = minAge === undefined ? m.value : Math.max(minAge, m.value);
      }
      if (m.field === 'bmi') {
        if (m.operator === 'between' && typeof m.value === 'number' && m.value2 !== undefined) {
          bmiBand = { lower: m.value, upper: m.value2 };
        } else if (typeof m.value === 'number' && (m.operator === '>=' || m.operator === '>')) {
          bmiThresholds.push(m.value);
        }
      }
    }
    if (crit.kind === 'documentation') {
      const text = clean(crit.sourceText);
      const title = text.length > 90 ? text.slice(0, 88).trim() + '…' : text;
      if (text && !seenDoc.has(title)) {
        seenDoc.add(title);
        documentation.push({ title, description: text });
      }
    }
  }

  let bmi: DtrCriteria['bmi'];
  const distinct = [...new Set(bmiThresholds)].sort((a, b) => b - a);
  if (distinct.length > 0) {
    const threshold = distinct[0];
    // Two distinct BMI thresholds (e.g. 40 and 35) with no explicit "between" ⇒ the lower is the band floor.
    const band =
      bmiBand ??
      (distinct.length >= 2
        ? { lower: distinct[distinct.length - 1], upper: threshold }
        : undefined);
    bmi = { threshold, band };
  } else if (bmiBand) {
    bmi = { threshold: bmiBand.upper, band: bmiBand };
  }

  const comorbidity = bmi?.band
    ? { codes: OBESITY_COMORBIDITY_ICD10, label: OBESITY_COMORBIDITY_LABEL }
    : undefined;

  // GENERIC computable lift: walk the eligibility pathways' BOOLEAN TREES (never the flat registry —
  // that would flatten OR-branches into required ANDs and pull in children/exclusions). For every
  // non-age/BMI, non-excluded, LOINC-mapped measure leaf, emit a ComputableCriterion carrying the
  // encoded measure verbatim (evaluated later via the shared engine). `required` is false when the
  // leaf is under an OR or one of several alternative pathways. A measure field with NO standard coded
  // concept (stenosis %, tumour size) is surfaced as a documentation gap, never silently dropped.
  const computable: ComputableCriterion[] = [];
  const seenComputable = new Set<string>();
  const eligibility = logic.pathways.filter((p) => p.role === 'eligibility' && p.logic);
  const multiPathway = eligibility.length > 1;
  for (const p of eligibility) {
    const leaves: LeafRef[] = [];
    collectLeaves(p.logic, false, false, leaves);
    for (const { criterionId, underOr } of leaves) {
      const crit = logic.criteria[criterionId];
      if (!crit || crit.kind !== 'measure') continue;
      if (isExclusionCriterion(crit)) continue; // exclusion → never a positive eligibility gate
      // A criterion the encoder flagged for human review (OCR-repaired label, ambiguous operator/
      // threshold) must NOT be silently auto-evaluated to a confident met/gap — surface it as an
      // attestation the reviewer verifies. (mirrors evalCriterion's `if (crit.reviewFlag) → unknown`.)
      if (crit.reviewFlag) {
        addMeasureDoc(crit.sourceText, documentation, seenDoc);
        continue;
      }
      const ms =
        crit.measures && crit.measures.length ? crit.measures : crit.measure ? [crit.measure] : [];
      const required = !underOr && !multiPathway;
      const excerpt = clean(crit.sourceText).slice(0, 200) || undefined;
      for (const m of ms) {
        if (m.negatedLocally) continue; // in-scope negation cue → not an inclusion gate
        if (m.kind === 'compound') {
          const subs = m.subMeasures ?? [];
          const allMapped =
            subs.length > 0 && subs.every((s) => s.field && measureLoincCode(s.field));
          const key = `${criterionId}:compound`;
          if (allMapped && !seenComputable.has(key)) {
            seenComputable.add(key);
            computable.push({
              criterionId,
              field: subs[0].field as string,
              label: subs
                .map((s) => MEASURE_LOINC[s.field as string]?.display ?? s.field)
                .join(' / '),
              loinc: undefined,
              measure: m,
              required,
              sourceExcerpt: excerpt,
            });
          } else if (!allMapped) {
            addMeasureDoc(crit.sourceText, documentation, seenDoc);
          }
          continue;
        }
        const field = m.field;
        if (!field || field === 'age' || field === 'bmi') continue; // handled by the dedicated groups
        const loinc = measureLoincCode(field);
        if (!loinc) {
          addMeasureDoc(crit.sourceText, documentation, seenDoc);
          continue;
        }
        const key = `${criterionId}:${field}`;
        if (seenComputable.has(key)) continue;
        seenComputable.add(key);
        computable.push({
          criterionId,
          field,
          label: MEASURE_LOINC[field]?.display ?? field,
          loinc,
          measure: m,
          required,
          sourceExcerpt: excerpt,
          note: m.thresholdVariant
            ? 'Population-shifted threshold is attested; evaluated at the base threshold.'
            : undefined,
        });
      }
    }
  }

  return {
    policyTitle: review.title,
    cptCode,
    minAge,
    bmi,
    comorbidity,
    computable,
    // No cap: the DTR must reflect EVERY documentation-gated criterion the authored policy
    // states, not a truncated preview. A hardcoded slice here previously dropped criteria
    // silently once a policy had more than a handful — exactly the "are we showing ALL the
    // medically necessary criteria?" gap this function exists to close.
    documentation,
  };
}
