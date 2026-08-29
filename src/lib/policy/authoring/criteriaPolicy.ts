/**
 * Shared authoring helper — assemble a `CriteriaPolicy` from reviewed criteria + codes.
 *
 * ONE place that builds the engine's input struct, reused by every authoring seam (DTR items, CRD
 * rules, encoding-review elements) so the assembly is not re-coded per adapter. Pure.
 */
import type {
  CriteriaGroup,
  CriteriaPolicy,
  CriterionNode,
  GuidelineCode,
} from '@/lib/policy/extract/criteria';

function countCriteria(nodes: CriterionNode[]): number {
  return nodes.reduce((n, c) => n + 1 + countCriteria(c.children), 0);
}

export function buildCriteriaPolicy(
  sections: CriteriaGroup[] | undefined,
  opts: { service?: string; guidelineId?: string; codes?: GuidelineCode[] } = {}
): CriteriaPolicy {
  const s = sections ?? [];
  const criteria = s.reduce((n, g) => n + countCriteria(g.criteria), 0);
  return {
    title: opts.service ?? 'Policy',
    guidelineId: opts.guidelineId ?? 'authored-policy',
    status: 'active',
    medicallyNecessary: s,
    notMedicallyNecessary: [],
    codes: opts.codes ?? [],
    provenance: [],
    warnings: [],
    stats: { groups: s.length, criteria, codes: opts.codes?.length ?? 0 },
  };
}
