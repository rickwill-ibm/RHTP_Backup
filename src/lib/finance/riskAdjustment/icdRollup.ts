/**
 * ICD-10-CM category rollup (HW6 / I21, HW6-2) — a self-contained policy-fidelity
 * helper. Rolls a code up to its 3-character CATEGORY (and the chapter block), so a
 * RADV analyst can see withheld/indefensible diagnoses grouped by category instead
 * of as a flat list. Pure, dependency-free, no licensed content required.
 */

import type { HccCapture } from './meat';
import type { SubmissionDecision } from './submission';

/** The 3-char ICD-10-CM category (e.g. 'E11.9' -> 'E11'). Empty for a malformed code. */
export function icdCategory(code: string): string {
  const m = /^([A-TV-Z]\d[0-9A-Z])/i.exec((code ?? '').trim());
  return m ? m[1].toUpperCase() : '';
}

/** The ICD-10-CM chapter letter (e.g. 'E11.9' -> 'E'). */
export function icdChapter(code: string): string {
  const c = icdCategory(code);
  return c ? c[0] : '';
}

export interface CategoryRollup {
  category: string;
  count: number;
  hccCodes: string[];
}

/** Group withheld captures by ICD category, for a RADV remediation worklist. */
export function rollupWithheldByCategory(
  withheld: Array<{ capture: HccCapture; decision: SubmissionDecision }>,
): CategoryRollup[] {
  const byCat = new Map<string, CategoryRollup>();
  for (const w of withheld) {
    const category = icdCategory(w.capture.icdCode) || 'UNKNOWN';
    const entry = byCat.get(category) ?? { category, count: 0, hccCodes: [] };
    entry.count += 1;
    if (!entry.hccCodes.includes(w.capture.hccCode)) entry.hccCodes.push(w.capture.hccCode);
    byCat.set(category, entry);
  }
  return [...byCat.values()].sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}
