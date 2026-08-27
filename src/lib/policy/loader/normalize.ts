/**
 * S1 - the single canonical-text normalizer. Every loader (text, HTML, CSV, image/OCR,
 * PDF text-layer, scanned/OCR, XLSX) ends by passing its derived text through
 * canonicalizeText, minting every anchor offset against THAT output only. Because the rule
 * is idempotent, verifyAnchor re-slicing the stored text reproduces a byte-identical
 * snippet + sha256 on any OS / timezone - the trust boundary the whole spine depends on.
 *
 * Pure JS, Node stdlib only (String.prototype.normalize needs no ICU install). NFC - NOT
 * NFKC - is deliberate: NFKC would lossily fold clinical/CPT compatibility digits/ligatures.
 * The byte-offset naming elsewhere is a convention; the index space is UTF-16 code units,
 * matching verify.ts makeSpan/verifySpan which slice code units and re-hash UTF-8.
 */

/* eslint-disable no-control-regex --
 * This module's entire purpose is to MATCH control characters (line terminators VT/FF/NEL,
 * tab, and other Unicode separators) and fold them into canonical whitespace. The regexes
 * below intentionally contain control characters; that is the feature, not an accident. */

export const CANON_RULE_VERSION = 'canon@1';

// U+FEFF BOM / zero-width no-break space, stripped everywhere.
const BOM = /\uFEFF/g;
// Line terminators folded to newline: CRLF, CR, NEL, LS, PS, FF, VT.
const LINE_TERMINATORS = /\r\n|[\r\u0085\u2028\u2029\u000C\u000B]/g;
// Horizontal Unicode spaces folded to ASCII space: TAB, NBSP, OGHAM, EN..HAIR, NNBSP, MMSP, IDEOGRAPHIC.
const H_SPACES = /[\t\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

/**
 * The ONE normalization rule. Fixed order, idempotent by construction:
 *   1. strip U+FEFF everywhere
 *   2. Unicode NFC (not NFKC)
 *   3. fold every line terminator to a newline
 *   4. fold horizontal Unicode spaces to ASCII space, collapse runs to one
 *   5. strip trailing horizontal space per line; collapse 3+ newlines to two
 *   6. final trim
 */
export function canonicalizeText(raw: string): string {
  let t = raw.replace(BOM, '');
  t = t.normalize('NFC');
  t = t.replace(LINE_TERMINATORS, '\n');
  t = t.replace(H_SPACES, ' ');
  t = t.replace(/ +/g, ' ');
  t = t.replace(/ +\n/g, '\n');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

/**
 * Guard: a loader must emit already-canonical text. Fails closed at the seam rather than
 * shipping offsets that will not re-verify.
 */
export function assertCanonical(text: string): void {
  if (text !== canonicalizeText(text)) {
    throw new Error(
      'loader emitted non-canonical text (canonicalizeText is not a fixed point of the output)'
    );
  }
}

/**
 * Guard: a non-empty source must never reduce to empty text (a silent-empty loader would
 * ship a doc that anchors nothing).
 */
export function assertNonEmpty(text: string, rawByteLen: number): void {
  if (text === '' && rawByteLen > 0) {
    throw new Error('loader emitted empty text for a non-empty source (fail closed)');
  }
}
