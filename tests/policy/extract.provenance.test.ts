/**
 * Provenance is falsifiable: a correct span verifies, a tampered span fails, and
 * makeSpan refuses out-of-range offsets.
 */
import { describe, it, expect } from 'vitest';
import {
  anchorValue,
  makeProvenance,
  makeSpan,
  verifyAnchor,
  findBrokenAnchors,
} from '@/lib/policy/extract/provenance';

const TEXT = 'Cardiology\n93451, 93452, 93453\n';

describe('provenance anchoring', () => {
  it('anchors a value to its real offset and verifies', () => {
    const p = anchorValue(TEXT, '93452', 'paItems[0].codes[1]');
    expect(p).not.toBeNull();
    if (p) {
      expect(TEXT.slice(p.span.start, p.span.end)).toBe('93452');
      expect(verifyAnchor(TEXT, p)).toBe(true);
    }
  });

  it('makeProvenance value is the verbatim source slice', () => {
    const idx = TEXT.indexOf('93451');
    const p = makeProvenance(TEXT, 'x', { start: idx, end: idx + 5 });
    expect(p.value).toBe('93451');
    expect(verifyAnchor(TEXT, p)).toBe(true);
  });

  it('a tampered span fails verification', () => {
    const p = anchorValue(TEXT, '93451', 'x');
    expect(p).not.toBeNull();
    if (p) {
      const tampered = { ...p, span: { start: p.span.start + 1, end: p.span.end + 1 } };
      expect(verifyAnchor(TEXT, tampered)).toBe(false);
      expect(findBrokenAnchors(TEXT, [tampered])).toHaveLength(1);
    }
  });

  it('makeSpan rejects out-of-range offsets', () => {
    expect(() => makeSpan(TEXT, -1, 3)).toThrow();
    expect(() => makeSpan(TEXT, 0, TEXT.length + 5)).toThrow();
    expect(() => makeSpan(TEXT, 5, 2)).toThrow();
  });

  it('anchorValue returns null when the value is absent', () => {
    expect(anchorValue(TEXT, '00000', 'x')).toBeNull();
  });

  // A reviewer must be able to read a code IN CONTEXT — the snippet is a generous window, not a
  // three-word sliver, and it never leaves a half-word fragment beside the ellipsis.
  describe('display snippet', () => {
    const LEFT =
      'the quick brown fox jumps over the lazy dog while carrying roux limb one hundred fifty centimeters or less into the operative field ';
    const RIGHT =
      ' laparoscopy surgical gastric restrictive procedure with gastric bypass and small intestine reconstruction to limit absorption of nutrients';
    const CTX = `${LEFT}43645${RIGHT}`;

    it('gives a wide window around the code, not a three-word sliver', () => {
      const p = anchorValue(CTX, '43645', 'codes[0]');
      expect(p).not.toBeNull();
      if (!p) return;
      expect(p.snippet).toContain('43645');
      expect(p.snippet.length).toBeGreaterThan(120); // the old 24-pad window was ~53 chars
      expect(p.snippet.startsWith('…')).toBe(true);
      expect(p.snippet.endsWith('…')).toBe(true);
    });

    it('snaps both cut edges to whole words (no "roux" → "ux" fragment)', () => {
      const p = anchorValue(CTX, '43645', 'codes[0]');
      if (!p) return;
      const body = p.snippet.replace(/^…/, '').replace(/…$/, '').trim();
      const first = body.split(' ')[0];
      const last = body.split(' ').slice(-1)[0];
      // Every edge token is a WHOLE word present in the source, not a truncated tail/head.
      expect(new RegExp(`\\b${first}\\b`).test(CTX)).toBe(true);
      expect(new RegExp(`\\b${last}\\b`).test(CTX)).toBe(true);
      expect(body).not.toMatch(/^ux\b/); // the specific mid-word slice we set out to fix
    });

    it('does not add an ellipsis on a side that reaches the text edge', () => {
      const p = anchorValue('43645 laparoscopy', '43645', 'codes[0]');
      if (!p) return;
      expect(p.snippet.startsWith('…')).toBe(false); // code is at the very start
    });
  });
});
