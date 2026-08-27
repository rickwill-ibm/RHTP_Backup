/**
 * Exhaustive tests for the anchoring spine (S0), including regressions for the red-team
 * findings: empty/zero-length spans must fail closed, conflicting duplicate docIds must fail
 * closed (no silent shadowing), and offsetToLineCol must reject out-of-range offsets.
 */
import { describe, it, expect } from 'vitest';
import {
  hashText,
  makeSpan,
  verifyAnchor,
  buildLineIndex,
  offsetToLineCol,
  type CanonicalRef,
  type SourceAnchorV2,
} from '@/lib/policy/anchor/verify';

const doc: CanonicalRef = {
  docId: 'aetna-0520',
  text: 'A. Bariatric surgery is medically necessary when BMI >= 40.\nB. See Appendix B for exclusions.',
};
const doc2: CanonicalRef = {
  docId: 'ncd-100-3',
  text: 'National Coverage Determination 100.3 governs.',
};

function anchorFrom(spans: SourceAnchorV2['spans']): SourceAnchorV2 {
  return { anchorId: 'a1', spans, provenanceClass: 'authoritative' };
}

describe('anchoring spine — verifyAnchor', () => {
  it('round-trips a minted single span', () => {
    const start = doc.text.indexOf('BMI >= 40');
    const span = makeSpan(doc, start, start + 'BMI >= 40'.length);
    expect(verifyAnchor(anchorFrom([span]), [doc]).ok).toBe(true);
  });

  it('passes only when EVERY span in a multi-span anchor verifies', () => {
    const s1 = makeSpan(doc, 0, 2);
    const s2 = makeSpan(doc2, 0, 8);
    expect(verifyAnchor(anchorFrom([s1, s2]), [doc, doc2]).ok).toBe(true);
  });

  it('fails the whole anchor if one span of many is broken', () => {
    const good = makeSpan(doc, 0, 2);
    const tampered = { ...makeSpan(doc2, 0, 8), snippet: 'NationXX' };
    const v = verifyAnchor(anchorFrom([good, tampered]), [doc, doc2]);
    expect(v.ok).toBe(false);
    expect(v.spans[1]).toMatchObject({ ok: false, reason: 'snippet-mismatch' });
  });

  it('detects source drift (re-OCR / re-paginate)', () => {
    const start = doc.text.indexOf('BMI >= 40');
    const span = makeSpan(doc, start, start + 'BMI >= 40'.length);
    const drifted: CanonicalRef = { docId: doc.docId, text: doc.text.replace('40', '35') };
    expect(verifyAnchor(anchorFrom([span]), [drifted]).ok).toBe(false);
  });

  it('flags a hash mismatch when the snippet is stale', () => {
    const span = makeSpan(doc, 0, 2);
    const forged = { ...span, contentHash: hashText('ZZ') };
    expect(verifyAnchor(anchorFrom([forged]), [doc]).spans[0].reason).toBe('hash-mismatch');
  });

  it('reports doc-missing when the referenced document is absent', () => {
    const v = verifyAnchor(anchorFrom([makeSpan(doc2, 0, 8)]), [doc]);
    expect(v.spans[0]).toMatchObject({ ok: false, reason: 'doc-missing' });
  });

  it('reports out-of-bounds for a span past the document end', () => {
    const span = {
      docId: doc.docId,
      charSpan: [0, doc.text.length + 5] as [number, number],
      snippet: 'x',
      contentHash: hashText('x'),
    };
    expect(verifyAnchor(anchorFrom([span]), [doc]).spans[0]).toMatchObject({
      ok: false,
      reason: 'out-of-bounds',
    });
  });

  it('handles unicode (accents + emoji) exactly', () => {
    const u: CanonicalRef = { docId: 'u', text: 'café ✅ obésité ≥ 40' };
    const start = u.text.indexOf('obésité');
    const span = makeSpan(u, start, start + 'obésité'.length);
    expect(verifyAnchor(anchorFrom([span]), [u]).ok).toBe(true);
  });

  // ---- red-team regressions ----
  it('REGRESSION: an empty (zero-length) span fails closed, never verifies vacuously', () => {
    const emptySpan = {
      docId: doc.docId,
      charSpan: [3, 3] as [number, number],
      snippet: '',
      contentHash: hashText(''),
    };
    const v = verifyAnchor(anchorFrom([emptySpan]), [
      { docId: doc.docId, text: 'completely different text' },
    ]);
    expect(v.ok).toBe(false);
    expect(v.spans[0].reason).toBe('empty-span');
  });

  it('REGRESSION: conflicting duplicate docIds fail closed (no silent shadowing)', () => {
    const span = makeSpan({ docId: 'd', text: 'BMI >= 40 authoritative' }, 0, 9); // "BMI >= 40"
    const shadowed = verifyAnchor(anchorFrom([span]), [
      { docId: 'd', text: 'BMI >= 35 drifted real' },
      { docId: 'd', text: 'BMI >= 40 attacker shadow' },
    ]);
    expect(shadowed.ok).toBe(false);
    expect(shadowed.spans[0].reason).toBe('duplicate-doc');
  });

  it('never verifies an empty anchor', () => {
    expect(verifyAnchor(anchorFrom([]), [doc]).ok).toBe(false);
  });
});

describe('anchoring spine — makeSpan guards', () => {
  it('throws on inverted, empty, or out-of-range spans', () => {
    expect(() => makeSpan(doc, 10, 5)).toThrow(RangeError);
    expect(() => makeSpan(doc, 5, 5)).toThrow(RangeError); // empty span rejected at mint
    expect(() => makeSpan(doc, 0, doc.text.length + 1)).toThrow(RangeError);
    expect(() => makeSpan(doc, -1, 2)).toThrow(RangeError);
  });
});

describe('anchoring spine — offset map', () => {
  it('maps offsets to 1-based line/col across newlines', () => {
    const idx = buildLineIndex(doc.text);
    expect(offsetToLineCol(0, idx, doc.text.length)).toEqual({ line: 1, col: 1 });
    const bStart = doc.text.indexOf('B. See');
    expect(offsetToLineCol(bStart, idx, doc.text.length)).toEqual({ line: 2, col: 1 });
  });

  it('REGRESSION: rejects offsets out of range instead of fabricating a position', () => {
    const idx = buildLineIndex('ab\ncd');
    expect(() => offsetToLineCol(-1, idx, 5)).toThrow(RangeError);
    expect(() => offsetToLineCol(100, idx, 5)).toThrow(RangeError);
  });
});
