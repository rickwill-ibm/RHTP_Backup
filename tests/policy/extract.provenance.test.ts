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
});
