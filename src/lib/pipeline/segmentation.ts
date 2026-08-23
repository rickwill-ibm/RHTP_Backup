// CONTRACT: C9  // CONTRACT: C10
/**
 * Segmentation-at-transform (§4A stage 3, binding). Consent + 42 CFR Part 2
 * labels are a property of the data from the moment it is normalized, NEVER a
 * read-time afterthought. Adapters attach PHI-safe segmentation HINTS (codes,
 * not narrative) to the record payload; this module maps hints to durable
 * consent labels carried on the normalized record and strips the hints from the
 * payload. Part 2 (SUD) content is flagged here so projectors can drop it by
 * envelope inspection alone (C10.1) without ever parsing the payload.
 *
 * Rules are DATA (conventions v2 data-is-not-code): a hint -> label mapping, so
 * new segmentation categories are added without touching transform logic.
 */
import type { ConsentLabel, NormalizedRecord } from './types';

export interface SegmentationRule {
  hint: string;
  label: string;
  part2Restricted: boolean;
}

/** Hint catalog. Extend as new segmented programs arrive (owner + compliance). */
export const SEGMENTATION_RULES: readonly SegmentationRule[] = Object.freeze([
  { hint: 'part2-sud', label: '42-CFR-Part-2', part2Restricted: true },
  { hint: 'behavioral-health', label: 'behavioral-health', part2Restricted: false },
  { hint: 'hiv', label: 'hiv-related', part2Restricted: false },
  { hint: 'reproductive', label: 'reproductive-health', part2Restricted: false },
]);

const RULE_BY_HINT = new Map(SEGMENTATION_RULES.map((r) => [r.hint, r]));

/** Read PHI-safe hints an adapter placed on the payload (never narrative). */
export function readHints(payload: Record<string, unknown>): string[] {
  const h = payload['segmentationHints'];
  return Array.isArray(h) ? h.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Apply segmentation to a freshly-normalized record: derive consent labels from
 * its hints and return the record with hints stripped from the payload. Pure.
 */
export function applySegmentation(record: NormalizedRecord): NormalizedRecord {
  const hints = readHints(record.payload);
  const consent = labelsFromHints(hints, record.consent);
  const payload = { ...record.payload };
  delete payload['segmentationHints'];
  return { ...record, consent, payload };
}

/** Fold a hint list into a consent label, preserving any labels already set. */
export function labelsFromHints(hints: string[], base?: ConsentLabel): ConsentLabel {
  const labels = new Set(base?.segmentLabels ?? []);
  let part2 = base?.part2Restricted ?? false;
  for (const hint of hints) {
    const rule = RULE_BY_HINT.get(hint);
    if (!rule) continue;
    labels.add(rule.label);
    if (rule.part2Restricted) part2 = true;
  }
  return { part2Restricted: part2, segmentLabels: [...labels].sort() };
}
