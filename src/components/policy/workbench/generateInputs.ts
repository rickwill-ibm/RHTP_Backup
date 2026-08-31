/**
 * Generate-stage input projection (client-safe, pure — no engine import).
 *
 * The CRD coverage rules the Generate stage publishes must reflect the maker's FINAL per-code coverage
 * decisions, not the frozen ingest-time snapshot. `projectCoverageRules` re-projects each already-built
 * rule through its disposition via the shared `applyDisposition` truth table. With the section-inferred
 * defaults (and no human override) this reproduces the ingest rules byte-for-byte — it only ever
 * changes a rule the maker re-decided. Idempotent and deterministic.
 */
import type { CoverageRule } from '@/lib/policy/crd/coverageRule';
import { applyDisposition, type CodeDisposition } from '@/lib/policy/crd/coverageDisposition';

export function projectCoverageRules(
  rules: CoverageRule[],
  dispositions: Record<string, CodeDisposition>,
  canonical?: string
): CoverageRule[] {
  return rules.map((r) => {
    const d = dispositions[r.code];
    if (!d) return r; // no decision on record → leave the rule as the engine built it
    return applyDisposition(r, d, { canonical });
  });
}
