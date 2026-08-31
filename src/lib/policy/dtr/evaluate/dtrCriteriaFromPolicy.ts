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
import { encodePolicy, repairGlyphs } from '@/lib/policy/encode';
import { buildCriteriaPolicy } from '@/lib/policy/authoring/criteriaPolicy';
import type { DtrCriteria } from './patientEvaluation';

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

  return {
    policyTitle: review.title,
    cptCode,
    minAge,
    bmi,
    comorbidity,
    documentation: documentation.slice(0, 6),
  };
}
