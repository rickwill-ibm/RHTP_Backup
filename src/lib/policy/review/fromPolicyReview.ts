/**
 * Adapter: a `PolicyReview` (extractor output) → the encoding-review element inputs the screen
 * renders. Deterministic and pure.
 *
 * Criteria come from the policy ENGINE (encoded), so the review reflects the real clinical STRUCTURE:
 * a measure like "Age ≥ 18 years" / "BMI > 40 kg/m²" lands in the Value-thresholds section, not as an
 * opaque line of text; the engine's review flags surface for the reviewer. The coding-map / AI layer
 * still contributes MAPPED diagnosis codes, procedure roles, and flags (passed in via `codingMap`).
 * Flat extracted text is kept only as a fallback when the engine has nothing to encode.
 */
import type { PolicyReview } from '@/lib/policy/policyReview';
import type { CriteriaGroup, CriterionNode } from '@/lib/policy/extract/criteria';
import type { ReviewElementInput, ReviewFlag } from './encodingReview';
import type { CoverageRole } from '@/lib/policy/dtr/questionnairePackage';
import { encodePolicy, repairGlyphs, FIELD_REGISTRY, type Measure } from '@/lib/policy/encode';
import { buildCriteriaPolicy } from '@/lib/policy/authoring/criteriaPolicy';

/** Contribution from the coding-map / AI layer (post-extraction): proposed roles for procedure
 *  codes, mapped diagnosis codes, and any defect/ambiguity flags a reviewer must resolve. */
export interface CodingMapContribution {
  /** procedure code → proposed coverage role. */
  roles?: Record<string, CoverageRole>;
  /** procedure/diagnosis code → flag to surface. */
  flags?: Record<string, ReviewFlag>;
  /** proposed diagnosis codes establishing medical necessity. */
  diagnoses?: {
    system: string;
    code: string;
    label: string;
    flag?: ReviewFlag;
  }[];
  /** documentation-only requirements that cannot be computed from coded data. */
  gatedItems?: { id: string; label: string }[];
  /** procedure code → routing hint (WHERE its evidence sits) — never a coverage decision. */
  routing?: Record<string, import('./codeRouting').RoutingHint>;
}

const OP: Record<string, string> = {
  '>=': '≥',
  '<=': '≤',
  '>': '>',
  '<': '<',
  '=': '=',
  '!=': '≠',
};
// Field → label is driven by the dimension registry so labels never drift; compound BP is added on top.
const FIELD: Record<string, string> = {
  ...Object.fromEntries(FIELD_REGISTRY.map((f) => [f.field, f.label])),
  bloodPressure: 'Blood pressure',
};

function clean(s: string): string {
  return repairGlyphs(s).repaired.replace(/\s+/g, ' ').trim();
}

/** A readable label for an encoded measure — "Age ≥ 18 years", "BMI > 40 kg/m²", "BMI 35–40 kg/m²". */
function describeMeasure(m: Measure): string {
  if (m.kind === 'compound') {
    const parts = (m.subMeasures ?? []).map(describeMeasure);
    const joined = parts.join(m.logic === 'any' ? ' or ' : ' and ') || 'Blood pressure';
    // Do NOT invent a ≥: render the count as the source stated it ("despite N agents").
    const tq = m.therapyQualifier ? ` despite ${m.therapyQualifier.drugClassCount} agents` : '';
    return joined + tq;
  }
  // A field-bearing measure renders "Label op value unit"; a defensive fieldless one renders the bare
  // "op value unit" with NO bogus "Value" field. (an incompatible unit is structurally impossible now.)
  const u = m.unit ? ` ${m.unit}` : '';
  const f = m.field ? (FIELD[m.field] ?? m.field) : '';
  if (m.operator === 'between' && m.value2 !== undefined) {
    return `${f} ${m.value}–${m.value2}${u}`.replace(/\s+/g, ' ').trim();
  }
  const op = m.operator ? (OP[m.operator] ?? m.operator) : '';
  return `${f} ${op} ${m.value ?? ''}${u}`.replace(/\s+/g, ' ').trim();
}

/** Engine-encoded criterion review elements: typed measures → Value-thresholds; others → criterion. */
function engineCriterionElements(
  sections: CriteriaGroup[] | undefined,
  service: string,
  guidelineId?: string
): ReviewElementInput[] {
  if (!sections || sections.length === 0) return [];
  const logic = encodePolicy(buildCriteriaPolicy(sections, { service, guidelineId }), { service });
  const out: ReviewElementInput[] = [];
  const seen = new Set<string>();
  for (const crit of Object.values(logic.criteria)) {
    if (seen.has(crit.id)) continue;
    seen.add(crit.id);
    const flag: ReviewFlag | undefined = crit.reviewFlag
      ? { severity: 'verify', message: crit.reviewFlag.reason }
      : undefined;
    if (crit.kind === 'measure' && crit.measure) {
      // One typed Value-threshold row PER measure, so age AND BMI both show (ids index-suffixed
      // for uniqueness even if two measures share a field).
      const ms = crit.measures && crit.measures.length > 1 ? crit.measures : [crit.measure];
      ms.forEach((m, i) => {
        const el: ReviewElementInput = {
          id: ms.length > 1 ? `crit-${crit.id}::${i}` : `crit-${crit.id}`,
          kind: 'bmi',
          label: describeMeasure(m),
          confidence: 'explicit',
          source: clean(crit.sourceText),
        };
        if (flag) el.flag = flag;
        out.push(el);
      });
    } else {
      const el: ReviewElementInput = {
        id: `crit-${crit.id}`,
        kind: 'criterion',
        label: clean(crit.sourceText),
        confidence: 'explicit',
        source: clean(crit.sourceText),
      };
      if (flag) el.flag = flag;
      out.push(el);
    }
  }
  return out;
}

function flattenCriteria(groups: CriteriaGroup[]): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (nodes: CriterionNode[], prefix: string): void => {
    for (const n of nodes) {
      const path = `${prefix}${n.label}`;
      out.push({ path, text: n.text });
      if (n.children.length > 0) walk(n.children, `${path}.`);
    }
  };
  for (const g of groups) walk(g.criteria, '');
  return out;
}

/**
 * Build the review element inputs for a policy. Procedure codes come from the deterministic
 * extraction; criteria come from the ENGINE (typed); diagnoses, roles and flags come from the
 * optional coding-map contribution.
 */
export function reviewElementsFromPolicy(
  review: PolicyReview,
  codingMap: CodingMapContribution = {}
): ReviewElementInput[] {
  const elements: ReviewElementInput[] = [];

  for (const c of review.guidelineCodes ?? []) {
    elements.push({
      id: `proc-${c.codeSystem}-${c.code}`,
      kind: 'procedure',
      system: c.codeSystem,
      code: c.code,
      label: c.description ? `${c.code} — ${c.description}` : c.code,
      role: codingMap.roles?.[c.code],
      confidence: c.confidence ?? 'explicit',
      flag: codingMap.flags?.[c.code],
      routing: codingMap.routing?.[c.code],
    });
  }

  for (const dx of codingMap.diagnoses ?? []) {
    elements.push({
      id: `dx-${dx.system}-${dx.code}`,
      kind: 'diagnosis',
      system: dx.system,
      code: dx.code,
      label: `${dx.code} — ${dx.label}`,
      confidence: 'mapped',
      flag: dx.flag ?? codingMap.flags?.[dx.code],
    });
  }

  // Criteria from the engine (typed). Fall back to flat extracted text only if nothing encoded.
  const encoded = engineCriterionElements(
    review.criteriaSections,
    review.title,
    review.guidelineId ?? undefined
  );
  if (encoded.length > 0) {
    elements.push(...encoded);
  } else {
    for (const crit of flattenCriteria(review.criteriaSections ?? [])) {
      elements.push({
        id: `crit-${crit.path}`,
        kind: 'criterion',
        label: crit.path ? `${crit.path}. ${crit.text}` : crit.text,
        confidence: 'explicit',
      });
    }
  }

  for (const g of codingMap.gatedItems ?? []) {
    elements.push({ id: g.id, kind: 'gated', label: g.label, confidence: 'explicit', gated: true });
  }

  return elements;
}
