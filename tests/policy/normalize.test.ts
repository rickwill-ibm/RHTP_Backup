/**
 * S1 - adversarial red-team suite for the single canonical-text normalizer.
 *
 * The whole anchoring spine trusts one property: canonicalizeText is a fixed point of its
 * own output (idempotent), so an offset minted against canonical text re-slices to a
 * byte-identical snippet + sha256 on any OS / timezone / input encoding. These tests attack
 * that contract with every line terminator, Unicode space, normalization form, BOM position,
 * and astral code point the loaders can plausibly hand it.
 *
 * All exotic code points are built with String.fromCodePoint so this source file itself
 * contains no literal control / line-separator characters (U+2028/U+2029 in particular are
 * line terminators inside JS source).
 */
import { describe, it, expect } from 'vitest';
import {
  canonicalizeText,
  assertCanonical,
  assertNonEmpty,
  CANON_RULE_VERSION,
} from '@/lib/policy/loader/normalize';
import { makeSpan, verifyAnchor, hashText, type CanonicalRef } from '@/lib/policy/anchor/verify';

const cp = (n: number) => String.fromCodePoint(n);

// Line terminators the rule folds to '\n'.
const CR = '\r';
const LF = '\n';
const CRLF = '\r\n';
const NEL = cp(0x85); // U+0085 NEXT LINE
const LS = cp(0x2028); // U+2028 LINE SEPARATOR
const PS = cp(0x2029); // U+2029 PARAGRAPH SEPARATOR
const FF = cp(0x0c); // U+000C FORM FEED
const VT = cp(0x0b); // U+000B VERTICAL TAB

// Horizontal spaces the rule folds to ASCII space.
const TAB = '\t';
const NBSP = cp(0xa0); // U+00A0 NO-BREAK SPACE
const IDEO = cp(0x3000); // U+3000 IDEOGRAPHIC SPACE
const THIN = cp(0x2009); // U+2009 THIN SPACE
const HAIR = cp(0x200a); // U+200A HAIR SPACE
const ENQUAD = cp(0x2000); // U+2000 EN QUAD
const NNBSP = cp(0x202f); // U+202F NARROW NO-BREAK SPACE
const MMSP = cp(0x205f); // U+205F MEDIUM MATHEMATICAL SPACE
const OGHAM = cp(0x1680); // U+1680 OGHAM SPACE MARK

const BOM = cp(0xfeff); // U+FEFF ZERO WIDTH NO-BREAK SPACE / BOM
const ZWSP = cp(0x200b); // U+200B ZERO WIDTH SPACE (format char, deliberately NOT folded)
const ACUTE = cp(0x301); // U+0301 COMBINING ACUTE ACCENT
const DOTBELOW = cp(0x323); // U+0323 COMBINING DOT BELOW

// Astral (non-BMP) code points -> surrogate pairs of length 2 in UTF-16.
const THUMB = cp(0x1f44d); // U+1F44D THUMBS UP
const WOMAN = cp(0x1f469);
const GIRL = cp(0x1f467);
const ZWJ = cp(0x200d); // zero-width joiner (emoji sequence glue)

/** A wide battery of adversarial inputs used by the idempotence property test. */
const BATTERY: string[] = [
  '',
  'plain ascii text',
  'a' + CRLF + 'b',
  'a' + CR + 'b',
  'a' + NEL + 'b',
  'a' + LS + 'b',
  'a' + PS + 'b',
  'a' + FF + 'b',
  'a' + VT + 'b',
  'a' + NBSP + 'b',
  'a' + IDEO + 'b',
  'a' + THIN + HAIR + 'b',
  BOM + 'leading bom',
  'mid' + BOM + 'stream' + BOM + 'bom' + BOM,
  'e' + ACUTE, // NFD single mark
  cp(0xe9), // NFC precomposed
  'e' + ACUTE + DOTBELOW, // stacked combining marks (NFC reorders)
  'before ' + THUMB + ' after',
  WOMAN + ZWJ + GIRL, // multi-scalar ZWJ emoji sequence
  THUMB + NBSP + WOMAN,
  'line1\n\n\n\n\nline2', // run of blank lines
  'x' + NEL + LS + PS + FF + VT + 'y', // run of mixed terminators
  'a' + CRLF + CRLF + CRLF + CRLF + 'b',
  '    indented\n        deeper\n\ttabbed',
  'trailing   \nspace   ' + NBSP + '\nend',
  '   ' + IDEO + NNBSP + MMSP + OGHAM + ENQUAD + '   ', // all-horizontal-space
  '\n\n\nleading and trailing newlines\n\n\n',
  'a' + ZWSP + 'b',
  'a' + NBSP + ACUTE + 'b', // folded space adjacent to a combining mark
];

describe('canonicalizeText - idempotence (fixed-point contract)', () => {
  it('canonicalizeText(canonicalizeText(x)) === canonicalizeText(x) over the full battery', () => {
    for (const raw of BATTERY) {
      const once = canonicalizeText(raw);
      const twice = canonicalizeText(once);
      const thrice = canonicalizeText(twice);
      expect(twice).toBe(once);
      expect(thrice).toBe(once);
      // Length and hash must also be fixed points, not just string identity.
      expect(twice.length).toBe(once.length);
      expect(hashText(twice)).toBe(hashText(once));
    }
  });

  it('output contains no residual normalization targets (BOM, folded spaces, CR, run collapses)', () => {
    for (const raw of BATTERY) {
      const out = canonicalizeText(raw);
      expect(out).not.toContain(BOM);
      expect(out).not.toContain(CR);
      expect(out).not.toContain(NBSP);
      expect(out).not.toContain(IDEO);
      expect(out).not.toContain(NEL);
      expect(out).not.toContain(LS);
      expect(out).not.toContain(PS);
      expect(out).not.toContain(FF);
      expect(out).not.toContain(VT);
      expect(out).not.toMatch(/\t/); // tabs folded
      expect(out).not.toMatch(/ {2,}/); // no space runs
      expect(out).not.toMatch(/ \n/); // no trailing space before newline
      expect(out).not.toMatch(/\n{3,}/); // no 3+ newline runs
      expect(out).toBe(out.trim()); // fully trimmed
      expect(out.normalize('NFC')).toBe(out); // already NFC
    }
  });
});

describe('canonicalizeText - cross-OS NFC stability', () => {
  it('an NFD input and its NFC equivalent yield an identical string, length, and hash', () => {
    const nfd = canonicalizeText('e' + ACUTE); // decomposed
    const nfc = canonicalizeText(cp(0xe9)); // precomposed é
    expect(nfd).toBe(nfc);
    expect(nfd.length).toBe(nfc.length);
    expect(nfd.length).toBe(1); // composed to a single code unit
    expect(hashText(nfd)).toBe(hashText(nfc)); // same UTF-8 bytes -> same sha256
  });

  it('NFC composition is stable across a whole word regardless of input decomposition', () => {
    // "résumé" built two ways: fully decomposed (base + combining acute) vs precomposed.
    const decomposed = canonicalizeText('r' + 'e' + ACUTE + 'sum' + 'e' + ACUTE);
    const composed = canonicalizeText('r' + cp(0xe9) + 'sum' + cp(0xe9));
    expect(decomposed).toBe(composed);
    expect(decomposed.length).toBe(composed.length);
    expect(hashText(decomposed)).toBe(hashText(composed));
    expect(decomposed.normalize('NFC')).toBe(decomposed); // output is a fixed point of NFC
  });

  it('reorders stacked combining marks into canonical order (NFC), idempotently', () => {
    const out = canonicalizeText('e' + ACUTE + DOTBELOW);
    expect(out).toBe(out.normalize('NFC'));
    expect(canonicalizeText(out)).toBe(out);
  });
});

describe('canonicalizeText - line-terminator folding', () => {
  it('folds every terminator variant to a single LF', () => {
    for (const t of [CRLF, CR, NEL, LS, PS, FF, VT]) {
      expect(canonicalizeText('a' + t + 'b')).toBe('a\nb');
    }
  });

  it('CRLF folds to exactly one LF, never two', () => {
    expect(canonicalizeText('x' + CRLF + 'y')).toBe('x\ny');
    expect(canonicalizeText('x' + CRLF + 'y')).not.toBe('x\n\ny');
    expect(canonicalizeText('x' + CRLF + 'y').length).toBe(3);
  });

  it('a run of mixed terminators collapses (via the blank-line rule) to at most two LFs', () => {
    expect(canonicalizeText('x' + NEL + LS + PS + FF + VT + 'y')).toBe('x\n\ny');
    expect(canonicalizeText('a' + CRLF + CRLF + CRLF + CRLF + 'b')).toBe('a\n\nb');
  });
});

describe('canonicalizeText - horizontal space folding & collapse', () => {
  it('folds each horizontal Unicode space to a single ASCII space', () => {
    for (const s of [TAB, NBSP, IDEO, THIN, HAIR, ENQUAD, NNBSP, MMSP, OGHAM]) {
      expect(canonicalizeText('a' + s + 'b')).toBe('a b');
    }
  });

  it('collapses runs of mixed horizontal spaces to a single space', () => {
    expect(canonicalizeText('a' + NBSP + NBSP + NBSP + 'b')).toBe('a b');
    expect(canonicalizeText('a   b')).toBe('a b');
    expect(canonicalizeText('a ' + TAB + ' ' + NBSP + ' b')).toBe('a b');
  });

  it('strips trailing horizontal space before a newline (ascii and folded)', () => {
    expect(canonicalizeText('a   \nb')).toBe('a\nb');
    expect(canonicalizeText('a' + NBSP + '\nb')).toBe('a\nb');
    expect(canonicalizeText('a' + TAB + '\nb')).toBe('a\nb');
  });

  it('collapses 3+ newlines to exactly two (paragraph break preserved, blank runs bounded)', () => {
    expect(canonicalizeText('a\n\n\n\nb')).toBe('a\n\nb');
    expect(canonicalizeText('a\n\nb')).toBe('a\n\nb'); // exactly two is a fixed point
    expect(canonicalizeText('a\nb')).toBe('a\nb'); // single preserved
    expect(canonicalizeText('a\n \n \nb')).toBe('a\n\nb'); // blank lines with spaces
  });

  it('preserves interior-line indentation as the documented single-space marker (runs collapse per rule)', () => {
    // Contract per the module docstring step 4 ("collapse runs to one") + step 6 ("final trim"):
    // interior lines keep a single leading space (they are NOT left-stripped to zero), while a
    // run of leading spaces collapses to one, and the FIRST line's indent is removed by trim().
    expect(canonicalizeText('a\n    b')).toBe('a\n b'); // interior single-space marker preserved
    expect(canonicalizeText('    code\n        deeper')).toBe('code\n deeper');
  });
});

describe('canonicalizeText - BOM handling', () => {
  it('strips a BOM at the start of the stream', () => {
    expect(canonicalizeText(BOM + 'abc')).toBe('abc');
  });
  it('strips BOMs mid-stream and at end', () => {
    expect(canonicalizeText('a' + BOM + 'b')).toBe('ab');
    expect(canonicalizeText('a' + BOM + 'b' + BOM + 'c' + BOM)).toBe('abc');
  });
});

describe('canonicalizeText - astral / surrogate safety', () => {
  it('does not split a 4-byte (surrogate-pair) emoji', () => {
    const out = canonicalizeText('a' + THUMB + 'b');
    expect(out).toBe('a' + THUMB + 'b');
    expect(out.length).toBe(4); // a + 2 surrogate units + b
    expect(Array.from(out)).toEqual(['a', THUMB, 'b']); // iterates as whole code points
    expect(out.codePointAt(1)).toBe(0x1f44d);
  });

  it('leaves a ZWJ emoji sequence intact and idempotent', () => {
    const seq = WOMAN + ZWJ + GIRL;
    const out = canonicalizeText('family ' + seq + ' here');
    expect(out).toContain(seq);
    expect(canonicalizeText(out)).toBe(out);
  });

  it('an astral emoji used as an anchor snippet round-trips through makeSpan / verifyAnchor', () => {
    const doc: CanonicalRef = {
      docId: 'emoji-doc',
      text: canonicalizeText('Bariatric ' + THUMB + ' covered when BMI is high.'),
    };
    const start = doc.text.indexOf(THUMB);
    expect(start).toBeGreaterThanOrEqual(0);
    const span = makeSpan(doc, start, start + THUMB.length);
    expect(span.snippet).toBe(THUMB);
    expect(span.contentHash).toBe(hashText(THUMB));
    const verdict = verifyAnchor(
      { anchorId: 'e', provenanceClass: 'authoritative', spans: [span] },
      [doc]
    );
    expect(verdict.ok).toBe(true);
  });
});

describe('assertCanonical', () => {
  it('passes silently on already-canonical text', () => {
    expect(() => assertCanonical('a b\nc d')).not.toThrow();
    expect(() => assertCanonical('')).not.toThrow();
    expect(() => assertCanonical('para one\n\npara two')).not.toThrow();
    expect(() =>
      assertCanonical(canonicalizeText('anything' + CRLF + NBSP + 'here'))
    ).not.toThrow();
  });

  it('throws on deliberately non-normalized inputs', () => {
    expect(() => assertCanonical('a  b')).toThrow(/non-canonical/); // double space
    expect(() => assertCanonical('a' + CRLF + 'b')).toThrow(); // CRLF
    expect(() => assertCanonical('a' + NBSP + 'b')).toThrow(); // unfolded NBSP
    expect(() => assertCanonical(BOM + 'x')).toThrow(); // BOM present
    expect(() => assertCanonical('a\n\n\n\nb')).toThrow(); // 4 newlines
    expect(() => assertCanonical('trailing \nb')).toThrow(); // trailing space before newline
    expect(() => assertCanonical('e' + ACUTE)).toThrow(); // NFD, not NFC
  });
});

describe('assertNonEmpty', () => {
  it('throws when text is empty but the raw source had bytes (fail closed)', () => {
    expect(() => assertNonEmpty('', 1)).toThrow(/empty/);
    expect(() => assertNonEmpty('', 4096)).toThrow();
  });
  it('passes when empty text corresponds to a genuinely empty source', () => {
    expect(() => assertNonEmpty('', 0)).not.toThrow();
  });
  it('passes on any non-empty text regardless of raw byte length', () => {
    expect(() => assertNonEmpty('text', 4)).not.toThrow();
    expect(() => assertNonEmpty('text', 0)).not.toThrow();
    expect(() => assertNonEmpty(' ', 1)).not.toThrow();
  });
});

describe('canon rule identity + full anchoring round-trip', () => {
  it('exposes a stable rule version tag', () => {
    expect(CANON_RULE_VERSION).toBe('canon@1');
  });

  it('an anchor minted from canonicalizeText output verifies through verifyAnchor', () => {
    // Adversarial raw with CRLF, tabs, NBSP, trailing spaces, blank-line runs, and NFD accents.
    const rawText =
      'Coverage Policy' +
      CRLF +
      CRLF +
      'Bariatric surgery is covered when BMI' +
      NBSP +
      '>=' +
      TAB +
      '40 for the pati' +
      'e' +
      ACUTE +
      'nt.   ' +
      CRLF +
      CRLF +
      CRLF +
      'See CPT 43775.';
    const doc: CanonicalRef = { docId: 'policy-1', text: canonicalizeText(rawText) };

    // The canonical text is a fixed point.
    expect(canonicalizeText(doc.text)).toBe(doc.text);

    // Mint an anchor on a phrase and verify it exact-matches + hash-matches.
    const needle = 'BMI >= 40';
    const start = doc.text.indexOf(needle);
    expect(start).toBeGreaterThanOrEqual(0);
    const span = makeSpan(doc, start, start + needle.length);
    expect(span.snippet).toBe(needle);
    expect(span.contentHash).toBe(hashText(needle));

    const verdict = verifyAnchor(
      { anchorId: 'rt', provenanceClass: 'authoritative', spans: [span] },
      [doc]
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.spans[0].ok).toBe(true);

    // Re-canonicalizing the doc text does not shift the offset (idempotence => stable anchors).
    const doc2: CanonicalRef = { docId: 'policy-1', text: canonicalizeText(doc.text) };
    const reVerify = verifyAnchor(
      { anchorId: 'rt', provenanceClass: 'authoritative', spans: [span] },
      [doc2]
    );
    expect(reVerify.ok).toBe(true);
  });
});
