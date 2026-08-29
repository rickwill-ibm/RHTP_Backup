/**
 * E0 — OCR + label normalization (RHTP Policy Engine, encoding layer).
 *
 * Split by trust level per spec §2 / F1:
 *   - glyph repair (repairGlyphs): reversible, span-preserving, whitelisted. NEVER alters a clinical
 *     number. An operator glyph that cannot be recovered with confidence is FLAGGED, not guessed.
 *   - structural label handling (canonicalLabel / detectLabelCollisions): inference is recorded, and
 *     colliding sibling labels raise a review flag — de-duplication is forbidden.
 *
 * Design authority: docs/policy-encoder-spec.md §2, §1.3, §1.4, §1.9.
 */

export interface GlyphRepair {
  repaired: string;
  changed: boolean;
  /** Human-readable notes; entries starting with "REVIEW:" mark unrecoverable glyphs. */
  notes: string[];
  /** True when an operator/threshold glyph could not be recovered — downstream must flag for review. */
  needsReview: boolean;
}

/** Whitelisted, anchored glyph/label repairs seen across the corpus. Order matters (longest first). */
const GLYPH_RULES: { re: RegExp; to: string; note: string }[] = [
  // Concatenations that defeat negation/cue matching (common OCR artifacts).
  { re: /\bnecessaryfor\b/g, to: 'necessary for', note: 'necessaryfor→necessary for' },
  { re: /\binvestigationaf\b/gi, to: 'investigational', note: 'investigationaf→investigational' },
  // Roman-numeral label artifacts, anchored to a label position (followed by a dot).
  { re: /\bIll\./g, to: 'III.', note: 'Ill.→III.' },
  { re: /\bI1\.([A-Z])/g, to: 'II.$1', note: 'I1.x→II.x' },
  { re: /\bI1\.(\d)/g, to: 'II.$1', note: 'I1.n→II.n' },
  // Unit / symbol artifacts.
  { re: /\bBM\//g, to: 'BMI', note: 'BM/→BMI' },
  { re: /kg\s*\/\s*m2\b/gi, to: 'kg/m²', note: 'kg/m2→kg/m²' },
  { re: /kglrn2/gi, to: 'kg/m²', note: 'kglrn2→kg/m²' },
  { re: /\{BMI/g, to: '(BMI', note: '{BMI→(BMI' },
  { re: /\{BMI\)/g, to: '(BMI)', note: '{BMI)→(BMI)' },
];

/** The Unicode replacement char, which the corpus shows where an operator (≥/≤) was lost. */
const REPLACEMENT_CHAR = /�/;

/**
 * Repair known OCR glyph/label artifacts. Reversible and span-preserving in spirit (it does not
 * touch digits). If a replacement character sits adjacent to a number, the comparator is
 * unrecoverable — we do NOT guess; we flag for review (spec §1.3).
 */
export function repairGlyphs(text: string): GlyphRepair {
  let out = text;
  const notes: string[] = [];
  for (const rule of GLYPH_RULES) {
    if (rule.re.test(out)) {
      out = out.replace(rule.re, rule.to);
      notes.push(rule.note);
    }
  }
  let needsReview = false;
  // ANY residual replacement char in a criterion span is unsafe to auto-evaluate (a lost operator,
  // unit, or word) — flag for review regardless of digit adjacency (fail-safe, spec §1.3). The note
  // only claims "comparator" when the glyph actually sits next to a number. (red-team finding #9)
  if (REPLACEMENT_CHAR.test(out)) {
    needsReview = true;
    const nearNumber = /�\s*\d|\d\s*�/.test(out);
    notes.push(
      nearNumber
        ? 'REVIEW: replacement char adjacent to a number — comparator/threshold unrecoverable'
        : 'REVIEW: replacement char present — text unrecoverable'
    );
  }
  return { repaired: out, changed: out !== text, notes, needsReview };
}

/** Roman/letter/numeric label → a canonical dotted path segment (upper-cased, trimmed). */
export function canonicalLabel(label: string): string {
  return label.replace(/[).]/g, '').trim().toUpperCase();
}

export interface LabelCollision {
  label: string;
  count: number;
}

/**
 * Detect colliding sibling labels (e.g. four `A.` siblings, or two `i.` blocks). These must raise a
 * review flag — NEVER be de-duplicated/merged (spec F1). Returns the labels that appear more than
 * once among immediate siblings.
 */
export function detectLabelCollisions(siblingLabels: string[]): LabelCollision[] {
  const counts = new Map<string, number>();
  for (const raw of siblingLabels) {
    const key = canonicalLabel(raw);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const out: LabelCollision[] = [];
  for (const [label, count] of counts) {
    if (count > 1) out.push({ label, count });
  }
  return out;
}
