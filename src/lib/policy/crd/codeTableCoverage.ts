/**
 * CRD coverage rules for a "Requirements By Product" (code-table) policy — the parity twin of
 * `engineCoverageRulesForReview` for the criteria path.
 *
 * A code-table policy IS, by its own construction, a list of prior-authorization-REQUIRED covered
 * procedures (that is what a "Requirements By Product" table asserts). So every enumerated code
 * defaults to `covered · PA required`, deduplicated across products, and the section-inferred default
 * disposition is `covered-pa` — which the human maker can still override in review, exactly like the
 * criteria path. Payer-agnostic: keys off the table structure, never a payer name. Pure/deterministic.
 */
import type { ProductReviewSection } from '../productReview';
import type { CoverageRule } from './coverageRule';
import { coverageInfoFor, type CodeDisposition } from './coverageDisposition';

export function codeTableCoverage(
  sections: ProductReviewSection[] | undefined,
  opts: { policyId: string; policyTitle: string; canonical: string }
): { rules: CoverageRule[]; dispositions: Record<string, CodeDisposition> } {
  const rules: CoverageRule[] = [];
  const dispositions: Record<string, CodeDisposition> = {};
  const seen = new Set<string>();
  for (const section of sections ?? []) {
    for (const proc of section.procedures) {
      for (const c of proc.codes) {
        if (seen.has(c.code)) continue;
        seen.add(c.code);
        dispositions[c.code] = 'covered-pa';
        rules.push({
          code: c.code,
          codeSystem: c.codeSystem,
          display: c.description,
          priorAuthRequired: true,
          policyId: opts.policyId,
          policyTitle: opts.policyTitle,
          questionnaireCanonical: opts.canonical,
          role: 'covered',
          coverageInfo: coverageInfoFor('covered', true),
          reason: `Prior authorization required under ${opts.policyTitle}.`,
        });
      }
    }
  }
  return { rules, dispositions };
}
