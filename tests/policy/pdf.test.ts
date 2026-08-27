/**
 * S1 — adversarial red-team suite for the PDF loader (src/lib/policy/loader/pdf.ts).
 *
 * Attacks four surfaces:
 *   1. classifyPdf — the mandatory pure-JS gate (uncompressed ops, Flate-compressed ops,
 *      image-only, and the "neither" fall-through).
 *   2. pdfItemsToLines — deterministic geometry reconstruction (reading order, space
 *      injection threshold, Y tolerance, two-column separation, order-independence).
 *   3. loadPdf routing — text-layer vs scanned handoff, the empty-coverage reroute, and the
 *      FAIL-CLOSED matrix (every missing capability must throw, never ship an empty doc).
 *   4. spine round-trips — text-layer, scanned/OCR, and astral/non-ASCII snippets that must
 *      byte-match through makeSpan/verifyAnchor.
 *
 * The fakes ignore the bytes, so every fixture carries the classifying tokens IN its bytes.
 */
import { describe, it, expect } from 'vitest';
import { deflateSync } from 'node:zlib';
import {
  classifyPdf,
  pdfItemsToLines,
  loadPdf,
  fakePdfTextEngine,
  type PdfItem,
  type PdfPageItems,
} from '@/lib/policy/loader/pdf';
import { fakeRasterizer, type RasterPage } from '@/lib/policy/loader/rasterize';
import { fakeOcrEngine } from '@/lib/policy/loader/ocr';
import { makeBuiltinCapture, type RawDoc, type BuiltinOptions } from '@/lib/policy/loader/capture';
import { makeSpan, verifyAnchor, type CanonicalRef } from '@/lib/policy/anchor/verify';

// ---- fixtures --------------------------------------------------------------

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

function raw(bytes: Uint8Array, mime = 'application/pdf'): RawDoc {
  return { docId: 'd', sourceFile: 'f.pdf', bytes, mime, provenanceClass: 'authoritative' };
}

/** Build a PdfItem with sane defaults; override only what the case cares about. */
function it_(p: Partial<PdfItem> & { str: string }): PdfItem {
  return {
    str: p.str,
    x: p.x ?? 0,
    y: p.y ?? 0,
    width: p.width ?? 10,
    fontSize: p.fontSize ?? 12,
    streamIndex: p.streamIndex ?? 0,
  };
}

function page(items: PdfItem[], pageNo = 1): PdfPageItems {
  return { page: pageNo, mediaBox: [0, 0, 612, 792], items };
}

/** Deterministic Fisher-Yates with a fixed seed — a reproducible "different array order". */
function shuffle<T>(arr: T[], seed = 1234567): T[] {
  const out = [...arr];
  let s = seed;
  const rnd = (): number => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const rasterOne: RasterPage = {
  page: 1,
  image: enc('fake-png-bytes'),
  mime: 'image/png',
  width: 1000,
  height: 1400,
};

// ===========================================================================
// 1. classifyPdf
// ===========================================================================

describe('classifyPdf (mandatory pure-JS gate)', () => {
  it('(a) uncompressed content stream with BT/Tf/Tj/ET -> text-layer', () => {
    const bytes = Buffer.concat([
      Buffer.from('%PDF-1.7\n', 'latin1'),
      Buffer.from('BT /F1 12 Tf (Hello) Tj ET', 'latin1'),
    ]);
    expect(classifyPdf(bytes)).toBe('text-layer');
  });

  it('(b) Flate-COMPRESSED content stream must be inflated -> text-layer', () => {
    // The text operators exist ONLY inside the deflated payload; the raw bytes are binary.
    const payload = 'BT (Bariatric surgery) Tj ET';
    const deflated = deflateSync(Buffer.from(payload, 'latin1'));
    const bytes = Buffer.concat([
      Buffer.from('%PDF-1.7\n', 'latin1'),
      Buffer.from('stream\n', 'latin1'),
      deflated,
      Buffer.from('\nendstream', 'latin1'),
    ]);
    // Sanity: the token is genuinely not visible in the raw latin1 bytes.
    expect(Buffer.from(bytes).toString('latin1')).not.toContain('Tj ET');
    expect(classifyPdf(bytes)).toBe('text-layer');
  });

  it('(c) image XObject (/Subtype /Image /Filter /DCTDecode) with NO text ops -> scanned', () => {
    const bytes = Buffer.concat([
      Buffer.from('%PDF-1.7\n', 'latin1'),
      Buffer.from('/XObject << /Im0 << /Subtype /Image /Filter /DCTDecode >> >>', 'latin1'),
    ]);
    expect(classifyPdf(bytes)).toBe('scanned');
  });

  it('(d) neither text ops nor image -> unknown', () => {
    const bytes = Buffer.from('%PDF-1.7\n% just a header and a comment, no operators', 'latin1');
    expect(classifyPdf(bytes)).toBe('unknown');
  });

  it('text ops WIN over image tokens when both are present -> text-layer', () => {
    const bytes = Buffer.from(
      '%PDF-1.7\n/Subtype /Image /DCTDecode\nBT (label over scan) Tj ET',
      'latin1'
    );
    expect(classifyPdf(bytes)).toBe('text-layer');
  });

  it('does not false-positive on the substrings of unrelated words (no bare Tj/TJ)', () => {
    // 'OBJECT' contains no Tj/TJ token; 'subject' lower-case is not the /Subtype image marker.
    const bytes = Buffer.from('%PDF-1.7\n% OBJECT stream subject matter only', 'latin1');
    expect(classifyPdf(bytes)).toBe('unknown');
  });
});

// ===========================================================================
// 2. pdfItemsToLines — deterministic geometry
// ===========================================================================

describe('pdfItemsToLines (deterministic geometry reconstruction)', () => {
  it('sorts top-to-bottom, left-to-right from shuffled input', () => {
    const items = [
      it_({ str: 'world', x: 200, y: 700, width: 40, streamIndex: 3 }),
      it_({ str: 'Hello', x: 100, y: 700, width: 40, streamIndex: 1 }),
      it_({ str: 'line', x: 170, y: 680, width: 30, streamIndex: 4 }),
      it_({ str: 'second', x: 100, y: 680, width: 50, streamIndex: 2 }),
    ];
    expect(pdfItemsToLines([page(items)])).toBe('Hello world\nsecond line');
  });

  it('DETERMINISM: a different array order yields the identical string', () => {
    const items = [
      it_({ str: 'world', x: 200, y: 700, width: 40, streamIndex: 3 }),
      it_({ str: 'Hello', x: 100, y: 700, width: 40, streamIndex: 1 }),
      it_({ str: 'line', x: 170, y: 680, width: 30, streamIndex: 4 }),
      it_({ str: 'second', x: 100, y: 680, width: 50, streamIndex: 2 }),
    ];
    const a = pdfItemsToLines([page(items)]);
    const b = pdfItemsToLines([page(shuffle(items))]);
    const c = pdfItemsToLines([page(shuffle(items, 987654))]);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('injects a space when the x-gap exceeds 0.25*fontSize', () => {
    // A ends at x=120; B starts at x=130 -> gap 10 > 0.25*12(=3) -> space.
    const items = [
      it_({ str: 'A', x: 100, y: 700, width: 20, fontSize: 12, streamIndex: 0 }),
      it_({ str: 'B', x: 130, y: 700, width: 20, fontSize: 12, streamIndex: 1 }),
    ];
    expect(pdfItemsToLines([page(items)])).toBe('A B');
  });

  it('does NOT inject a space when the x-gap is within 0.25*fontSize', () => {
    // A ends at x=120; B starts at x=122 -> gap 2 <= 3 -> no space.
    const items = [
      it_({ str: 'A', x: 100, y: 700, width: 20, fontSize: 12, streamIndex: 0 }),
      it_({ str: 'B', x: 122, y: 700, width: 20, fontSize: 12, streamIndex: 1 }),
    ];
    expect(pdfItemsToLines([page(items)])).toBe('AB');
  });

  it('a tiny Y jitter within tolerance keeps items on ONE line', () => {
    // y differs by 1 (<= Y_TOL 2) -> same line, ordered left-to-right, joined with a space.
    const items = [
      it_({ str: 'foo', x: 100, y: 700, width: 20, fontSize: 12, streamIndex: 0 }),
      it_({ str: 'bar', x: 130, y: 701, width: 20, fontSize: 12, streamIndex: 1 }),
    ];
    const out = pdfItemsToLines([page(items)]);
    expect(out).toBe('foo bar');
    expect(out).not.toContain('\n');
  });

  it('a Y delta beyond tolerance splits into two lines', () => {
    const items = [
      it_({ str: 'top', x: 100, y: 700, width: 20, streamIndex: 0 }),
      it_({ str: 'bottom', x: 100, y: 695, width: 20, streamIndex: 1 }),
    ];
    expect(pdfItemsToLines([page(items)])).toBe('top\nbottom');
  });

  it('two-column layout does NOT interleave columns on one line when Y differs', () => {
    // Left column rows and right column rows sit at DIFFERENT y — each stays on its own line.
    const items = [
      it_({ str: 'right1', x: 400, y: 690, width: 40, streamIndex: 10 }),
      it_({ str: 'left1', x: 50, y: 700, width: 40, streamIndex: 1 }),
      it_({ str: 'right2', x: 400, y: 670, width: 40, streamIndex: 11 }),
      it_({ str: 'left2', x: 50, y: 680, width: 40, streamIndex: 2 }),
    ];
    const out = pdfItemsToLines([page(items)]);
    expect(out).toBe('left1\nright1\nleft2\nright2');
    // No single line fuses a left-column and a right-column token.
    for (const line of out.split('\n')) {
      expect(line.includes('left') && line.includes('right')).toBe(false);
    }
  });

  it('separates pages with a blank line and preserves per-page reading order', () => {
    const p1 = page([it_({ str: 'PageOne', x: 0, y: 700, streamIndex: 0 })], 1);
    const p2 = page([it_({ str: 'PageTwo', x: 0, y: 700, streamIndex: 0 })], 2);
    expect(pdfItemsToLines([p1, p2])).toBe('PageOne\n\nPageTwo');
  });

  it('filters zero-length items but keeps whitespace-only glyph runs (pre-canonical)', () => {
    const items = [
      it_({ str: '', x: 0, y: 700, streamIndex: 0 }),
      it_({ str: '   ', x: 50, y: 700, width: 5, streamIndex: 1 }),
    ];
    // The empty item is dropped; the whitespace run survives here and is folded LATER by
    // canonicalizeText — which is exactly what drives the loadPdf coverage reroute.
    expect(pdfItemsToLines([page(items)])).toBe('   ');
  });
});

// ===========================================================================
// 3. loadPdf routing + FAIL-CLOSED matrix
// ===========================================================================

const textLayerBytes = enc('%PDF-1.7\nBT (Bariatric surgery covered when BMI >= 40.) Tj ET');
const scannedBytes = enc('%PDF-1.7\n/Subtype /Image /Filter /DCTDecode');

function textEngineFor(text: string): BuiltinOptions {
  return {
    pdfText: fakePdfTextEngine([
      page([it_({ str: text, x: 50, y: 700, width: 300, streamIndex: 0 })]),
    ]),
  };
}

describe('loadPdf routing', () => {
  it('text-layer PDF -> canonical text + per-page blocks via PdfTextEngine', async () => {
    const opts = textEngineFor('Bariatric surgery covered when BMI >= 40.');
    const { text, blocks } = await loadPdf(raw(textLayerBytes), opts);
    expect(text).toBe('Bariatric surgery covered when BMI >= 40.');
    expect(blocks).toEqual([{ page: 1, text: 'Bariatric surgery covered when BMI >= 40.' }]);
  });

  it('multi-page text-layer produces one block per page in order', async () => {
    const pages = [
      page([it_({ str: 'First page body', x: 0, y: 700, width: 100, streamIndex: 0 })], 1),
      page([it_({ str: 'Second page body', x: 0, y: 700, width: 100, streamIndex: 0 })], 2),
    ];
    const { text, blocks } = await loadPdf(raw(textLayerBytes), {
      pdfText: fakePdfTextEngine(pages),
    });
    expect(text).toBe('First page body\n\nSecond page body');
    expect(blocks).toEqual([
      { page: 1, text: 'First page body' },
      { page: 2, text: 'Second page body' },
    ]);
  });

  it('scanned PDF -> OCRs the rasterized page image into canonical text', async () => {
    const { text, blocks } = await loadPdf(raw(scannedBytes), {
      raster: fakeRasterizer([rasterOne]),
      ocr: fakeOcrEngine('BMI 40'),
    });
    expect(text).toBe('BMI 40');
    expect(blocks).toEqual([{ page: 1, text: 'BMI 40' }]);
  });

  it('scanned multi-page: each page image is OCRd and blocks track page numbers', async () => {
    const pages: RasterPage[] = [
      { ...rasterOne, page: 1 },
      { ...rasterOne, page: 2 },
    ];
    const { blocks } = await loadPdf(raw(scannedBytes), {
      raster: fakeRasterizer(pages),
      ocr: fakeOcrEngine('PER PAGE'),
    });
    expect(blocks.map((b) => b.page)).toEqual([1, 2]);
  });
});

describe('loadPdf coverage reroute (junk/empty text layer must not bypass OCR)', () => {
  it('whitespace-only text layer REROUTES to the scanned/OCR handoff', async () => {
    const opts: BuiltinOptions = {
      pdfText: fakePdfTextEngine([
        page([it_({ str: '   ', x: 0, y: 700, width: 5, streamIndex: 0 })]),
      ]),
      raster: fakeRasterizer([rasterOne]),
      ocr: fakeOcrEngine('RECOVERED VIA OCR'),
    };
    const { text } = await loadPdf(raw(textLayerBytes), opts);
    expect(text).toBe('RECOVERED VIA OCR');
  });

  it('empty-str text layer REROUTES to OCR', async () => {
    const opts: BuiltinOptions = {
      pdfText: fakePdfTextEngine([page([it_({ str: '', x: 0, y: 700, streamIndex: 0 })])]),
      raster: fakeRasterizer([rasterOne]),
      ocr: fakeOcrEngine('OCR FALLBACK'),
    };
    const { text } = await loadPdf(raw(textLayerBytes), opts);
    expect(text).toBe('OCR FALLBACK');
  });

  it('reroute with NO raster/ocr fails closed (does not silently return empty)', async () => {
    const opts: BuiltinOptions = {
      pdfText: fakePdfTextEngine([
        page([it_({ str: '   ', x: 0, y: 700, width: 5, streamIndex: 0 })]),
      ]),
    };
    await expect(loadPdf(raw(textLayerBytes), opts)).rejects.toThrow(/RasterizeProvider/);
  });
});

describe('loadPdf FAIL-CLOSED matrix (each throws; none returns an empty doc)', () => {
  it('text-layer PDF with NO pdfText engine throws', async () => {
    await expect(loadPdf(raw(textLayerBytes), {})).rejects.toThrow(/PdfTextEngine/);
  });

  it('scanned PDF with raster but NO ocr throws', async () => {
    await expect(
      loadPdf(raw(scannedBytes), { raster: fakeRasterizer([rasterOne]) })
    ).rejects.toThrow(/OCR engine/);
  });

  it('scanned PDF with ocr but NO raster throws', async () => {
    await expect(loadPdf(raw(scannedBytes), { ocr: fakeOcrEngine('x') })).rejects.toThrow(
      /RasterizeProvider/
    );
  });

  it('scanned PDF whose rasterizer returns [] throws (fail closed)', async () => {
    await expect(
      loadPdf(raw(scannedBytes), { raster: fakeRasterizer([]), ocr: fakeOcrEngine('x') })
    ).rejects.toThrow(/no pages/);
  });

  it('scanned PDF whose OCR returns empty for every page is caught by the capture guard', async () => {
    // loadPdf itself would return { text: '' }; the assertNonEmpty guard in the capture seam
    // is what fails it closed — so this MUST go through makeBuiltinCapture(...).load().
    const cap = makeBuiltinCapture({
      raster: fakeRasterizer([rasterOne]),
      ocr: fakeOcrEngine(''),
    });
    await expect(cap.load(raw(scannedBytes))).rejects.toThrow(/empty text/);
  });

  it('text-layer PDF through the full capture seam with no engine fails closed', async () => {
    await expect(makeBuiltinCapture().load(raw(textLayerBytes))).rejects.toThrow(/PdfTextEngine/);
  });
});

// ===========================================================================
// 4. Spine round-trips (byte-exact anchoring through makeSpan/verifyAnchor)
// ===========================================================================

describe('spine round-trips through makeBuiltinCapture', () => {
  it('TEXT-LAYER: an anchor minted from PDF text verifies through the S0 spine', async () => {
    const cap = makeBuiltinCapture(textEngineFor('Bariatric surgery covered when BMI >= 40.'));
    const doc = await cap.load(raw(textLayerBytes));
    expect(doc.text).toBe('Bariatric surgery covered when BMI >= 40.');
    const needle = 'BMI >= 40';
    const start = doc.text.indexOf(needle);
    expect(start).toBeGreaterThanOrEqual(0);
    const span = makeSpan(doc as CanonicalRef, start, start + needle.length);
    expect(
      verifyAnchor({ anchorId: 'a', provenanceClass: 'authoritative', spans: [span] }, [
        doc as CanonicalRef,
      ]).ok
    ).toBe(true);
    // Per-page blocks survive onto the CanonicalDoc.
    expect(doc.blocks).toEqual([{ page: 1, text: 'Bariatric surgery covered when BMI >= 40.' }]);
  });

  it('SCANNED: an anchor minted from OCR text verifies through the S0 spine', async () => {
    const cap = makeBuiltinCapture({
      raster: fakeRasterizer([rasterOne]),
      ocr: fakeOcrEngine('Bariatric surgery covered when BMI >= 40.'),
    });
    const doc = await cap.load(raw(scannedBytes));
    const needle = 'BMI >= 40';
    const start = doc.text.indexOf(needle);
    const span = makeSpan(doc as CanonicalRef, start, start + needle.length, 1);
    expect(
      verifyAnchor({ anchorId: 'ocr', provenanceClass: 'authoritative', spans: [span] }, [
        doc as CanonicalRef,
      ]).ok
    ).toBe(true);
  });

  it('ASTRAL / non-ASCII: a surrogate-pair snippet round-trips byte-exactly', async () => {
    const body = 'Coverage 🏥 requires BMI ≥ 40 for reimbursement 😀';
    const cap = makeBuiltinCapture(textEngineFor(body));
    const doc = await cap.load(raw(textLayerBytes));
    expect(doc.text).toBe(body);
    // Anchor a span that straddles an astral (surrogate-pair) code point.
    const needle = '🏥 requires BMI ≥ 40';
    const start = doc.text.indexOf(needle);
    expect(start).toBeGreaterThanOrEqual(0);
    const span = makeSpan(doc as CanonicalRef, start, start + needle.length);
    expect(span.snippet).toBe(needle);
    const verdict = verifyAnchor(
      { anchorId: 'astral', provenanceClass: 'authoritative', spans: [span] },
      [doc as CanonicalRef]
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.spans[0].ok).toBe(true);
  });
});
