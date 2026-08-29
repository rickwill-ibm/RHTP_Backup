/**
 * Criteria → NormalizedPolicy mapping — turns an extracted clinical guideline into the repo's existing
 * `NormalizedPolicy` so DTR generation flows through the ONE existing generator. Split out of
 * `criteria.ts` for the size cap; behavior unchanged. Each criterion (top-level AND nested) becomes a
 * `PolicyIndication` with `required` reflecting the all-of / one-of logic.
 */
import type { NormalizedPolicy, PolicyCodeBuckets, PolicyIndication } from '../types';
import type { CriteriaGroup, CriteriaPolicy, CriterionNode } from './criteria';
import { logicOf } from './criteriaParse';

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'untitled'
  );
}

function emptyCodeBuckets(): PolicyCodeBuckets {
  return {
    cptCovered: [],
    cptNotCovered: [],
    cptOther: [],
    hcpcsCovered: [],
    hcpcsNotCovered: [],
    hcpcsOther: [],
    icd10Covered: [],
    icd10NotCovered: [],
  };
}

/**
 * Flatten a criteria group into indications — ONE per node (top-level and nested), so every sub-item
 * is individually answerable in the DTR. Logic is preserved via `required`: under an "all of the
 * following" group each criterion is required; alternatives under a "one of the following" parent are
 * NOT. Labels are path-encoded (A, A.1, A.1.a) and de-duplicated so linkIds never collide.
 */
interface ServiceContext {
  /** Label prefix scoping this group's criteria (e.g. "S1." for the first service). */
  labelPrefix: string;
  /** Human service name folded into the DTR question, or null for a single-service doc. */
  service: string | null;
}

/** Derive a concise service name from a group's intro sentence, for multi-service docs. */
function deriveServiceName(heading: string): string {
  const m =
    /^(.*?)\s+(?:is\s+(?:considered\s+)?medically necessary|medically necessary\s+when)/i.exec(
      heading
    );
  let name = (m && m[1] ? m[1] : heading)
    .trim()
    .replace(/[:;,.]+$/, '')
    .trim();
  if (name.length === 0 || /^(the\s+)?services?$/i.test(name)) {
    name = heading.replace(/[:;.]+$/, '').trim();
  }
  return name.length > 60 ? `${name.slice(0, 57).trim()}…` : name;
}

function flattenGroupIndications(
  group: CriteriaGroup,
  out: PolicyIndication[],
  seen: Map<string, number>,
  ctx: ServiceContext
): void {
  const walk = (nodes: CriterionNode[], prefix: string, required: boolean): void => {
    for (const node of nodes) {
      const base = `${prefix}${node.label}`;
      const count = (seen.get(base) ?? 0) + 1;
      seen.set(base, count);
      const label = count > 1 ? `${base}-${count}` : base;
      // Multi-service guidelines carry the service in the question so an "A" from one service is
      // never confused with an "A" from another.
      const title = ctx.service ? `${ctx.service} — ${node.text}` : node.text;
      out.push({ label, title, required });
      if (node.children.length > 0) {
        // Children are alternatives unless the parent explicitly says "all of the following".
        walk(node.children, `${base}.`, logicOf(node.text) === 'all');
      }
    }
  };
  walk(group.criteria, ctx.labelPrefix, group.logic === 'all');
}

/**
 * Map an extracted clinical guideline onto the repo's existing `NormalizedPolicy`, so DTR generation
 * flows through the ONE existing generator (`generateQuestionnaireFromPolicy`) rather than a parallel
 * path. `determinationBasis: 'medical-necessity-criteria'` is what makes the existing generator emit an
 * indication item per criterion plus a supporting-diagnosis item.
 */
export function criteriaToNormalized(cp: CriteriaPolicy): NormalizedPolicy {
  const title = cp.title ?? 'Untitled guideline';
  const policyId = `${slug(title)}${cp.guidelineId ? `-${slug(cp.guidelineId)}` : ''}`;

  const indications: PolicyIndication[] = [];
  const seenLabels = new Map<string, number>();
  // Only scope by service when the guideline actually covers more than one — single-service guidelines
  // (the common case) keep pristine A/B/C labels and un-prefixed questions.
  const multiService = cp.medicallyNecessary.length > 1;
  cp.medicallyNecessary.forEach((group, gi) => {
    flattenGroupIndications(group, indications, seenLabels, {
      labelPrefix: multiService ? `S${gi + 1}.` : '',
      service: multiService ? deriveServiceName(group.heading) : null,
    });
  });

  // These are the codes the guideline governs — putting them in the "covered"/allPaCodes buckets is
  // what makes evaluate() match an order to this policy for criteria review; the criteria (not the
  // bucket) decide coverage. The guideline itself asserts no covered/not split.
  const codes = emptyCodeBuckets();
  const allPaCodes: string[] = [];
  for (const gc of cp.codes) {
    allPaCodes.push(gc.code);
    if (gc.codeSystem === 'CPT') codes.cptCovered.push(gc.code);
    else codes.hcpcsCovered.push(gc.code);
  }

  return {
    policyId,
    source: cp.guidelineId ?? title,
    sourceType: 'medical-clinical-policy-bulletin',
    title,
    category: 'Medical necessity guideline',
    requiresPA: true,
    determinationBasis: 'medical-necessity-criteria',
    number: cp.guidelineId,
    indications,
    codes,
    allPaCodes: Array.from(new Set(allPaCodes)).sort(),
  };
}
