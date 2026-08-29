/**
 * E8 — cross-reference resolver (RHTP Policy Engine, encoding layer).
 *
 * Runs as a prerequisite pass (spec §2). Resolves internal label references ("See II.D.2 either i
 * or ii") against the canonical label set, preserving the sub-selector semantics ("either i or ii"
 * ⇒ choose one). An unresolved or ambiguous reference FAILS CLOSED — it never yields an empty or
 * dangling pathway (spec §1.9, F4/F5).
 *
 * Design authority: docs/policy-encoder-spec.md §4 (E8), §2, §1.9.
 */
import { canonicalLabel } from './text';

export interface ResolvedRef {
  rawLabel: string;
  resolved?: string;
  status: 'resolved' | 'unresolved-fail-closed';
  /** "either i or ii" ⇒ 'choose-one'; a plain list ⇒ 'all'. */
  selector: 'all' | 'choose-one';
}

/** Extract the individual label tokens a reference clause points at, plus its selector semantics. */
export function parseReferenceClause(clause: string): {
  labels: string[];
  selector: 'all' | 'choose-one';
} {
  const selector: 'all' | 'choose-one' = /either|or\b/i.test(clause) ? 'choose-one' : 'all';
  // Match dotted label paths like II.D.1, II.D.2, i, ii.
  const labels = (clause.match(/[IVXLC]+\.[A-Z0-9.]+|(?<![A-Za-z])[ivx]+(?![A-Za-z])/g) ?? []).map(
    (s) => s.trim()
  );
  return { labels, selector };
}

/**
 * Resolve a reference clause against the set of known canonical labels. Every referenced label must
 * exist and be unique, or the whole reference fails closed.
 */
export function resolveReference(clause: string, knownLabels: string[]): ResolvedRef {
  const known = new Map<string, number>();
  for (const l of knownLabels) {
    const key = canonicalLabel(l);
    known.set(key, (known.get(key) ?? 0) + 1);
  }
  const { labels, selector } = parseReferenceClause(clause);
  if (!labels.length) {
    return { rawLabel: clause, status: 'unresolved-fail-closed', selector };
  }
  for (const raw of labels) {
    const key = canonicalLabel(raw);
    const count = known.get(key) ?? 0;
    if (count !== 1) {
      // Missing (0) or ambiguous (>1) ⇒ fail closed.
      return { rawLabel: clause, status: 'unresolved-fail-closed', selector };
    }
  }
  return {
    rawLabel: clause,
    resolved: labels.map(canonicalLabel).join(','),
    status: 'resolved',
    selector,
  };
}
