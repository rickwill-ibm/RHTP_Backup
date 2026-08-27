/**
 * S1 — PDF loader. Two gates decide text-layer vs scanned:
 *   1. classifyPdf — MANDATORY, pure-JS (node:zlib). Inflates content streams and scans for
 *      text-showing operators (Tj/TJ/BT…ET). Works OFFLINE with no optional dep, so a scanned
 *      PDF fails closed with the right message even when pdfjs is absent.
 *   2. post-extraction coverage — if the text engine yields effectively empty text, reroute
 *      to the scanned/OCR handoff (a junk/partial text layer must not bypass OCR).
 *
 * Text extraction and rasterization are optional seams (PdfTextEngine / RasterizeProvider),
 * lazy-loaded like the OcrEngine. pdfItemsToLines is the pure-JS geometry reconstruction;
 * the shared canonicalizeText then folds whitespace/NFC. Offsets index the canonical text.
 */
import { inflateSync, inflateRawSync } from 'node:zlib';
import type { LayoutBlock } from '../pipeline/contracts';
import { canonicalizeText } from './normalize';
import type { RawDoc, BuiltinOptions } from './capture';

export interface PdfItem {
  str: string;
  x: number; // PDF user-space x of the glyph run origin
  y: number; // PDF user-space y (increases upward)
  width: number;
  fontSize: number;
  streamIndex: number; // draw order within the page (tie-breaker)
}
export interface PdfPageItems {
  page: number; // 1-based
  mediaBox: [number, number, number, number];
  items: PdfItem[];
}

export interface PdfTextEngine {
  readonly name: string;
  extract(pdf: Uint8Array): Promise<PdfPageItems[]>;
}

/** Deterministic fake for unit tests — hands back pre-baked per-page items. */
export function fakePdfTextEngine(pages: PdfPageItems[]): PdfTextEngine {
  return {
    name: 'fake',
    async extract(): Promise<PdfPageItems[]> {
      return pages;
    },
  };
}

// ---- classifier (mandatory, pure-JS) ---------------------------------------

/** Inflate FlateDecode streams and concatenate with the raw bytes (catches uncompressed ops). */
function extractContentText(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  const s = buf.toString('latin1');
  let combined = s;
  let idx = 0;
  // Bound the scan so a pathological file can't blow up (defensive).
  for (let guard = 0; guard < 100000; guard++) {
    const st = s.indexOf('stream', idx);
    if (st < 0) break;
    let cs = st + 'stream'.length;
    if (s[cs] === '\r') cs++;
    if (s[cs] === '\n') cs++;
    const en = s.indexOf('endstream', cs);
    if (en < 0) break;
    const raw = buf.subarray(cs, en);
    try {
      combined += '\n' + inflateSync(raw).toString('latin1');
    } catch {
      try {
        combined += '\n' + inflateRawSync(raw).toString('latin1');
      } catch {
        /* not a Flate stream (image/encrypted/raw) — skip */
      }
    }
    idx = en + 'endstream'.length;
  }
  return combined;
}

function hasTextOps(t: string): boolean {
  return /(^|[\s>\])])(Tj|TJ)(?![A-Za-z0-9])/.test(t) || /\bBT\b[\s\S]{0,100000}?\bET\b/.test(t);
}
function hasImage(t: string): boolean {
  return /\/Subtype\s*\/Image\b/.test(t) || /\/DCTDecode\b/.test(t) || /\/JPXDecode\b/.test(t);
}

/**
 * Classify a PDF as 'text-layer' (has text-showing operators), 'scanned' (image XObjects and
 * no text ops), or 'unknown'. Heuristic and deterministic; the coverage reroute in loadPdf is
 * the secondary safety net for text drawn as outlines or a junk text layer.
 */
export function classifyPdf(bytes: Uint8Array): 'text-layer' | 'scanned' | 'unknown' {
  const t = extractContentText(bytes);
  if (hasTextOps(t)) return 'text-layer';
  if (hasImage(t)) return 'scanned';
  return 'unknown';
}

// ---- geometry reconstruction (pure-JS) -------------------------------------

/**
 * Reconstruct reading-order text from positioned items. Deterministic by construction:
 * integer-quantized Y line buckets (kills float ULP jitter), an explicit (x, streamIndex)
 * total order within a line, and a 0.25·fontSize space-injection threshold. Pages separated
 * by a blank line. Raw text — the shared canonicalizeText folds whitespace/NFC afterward.
 */
export function pdfItemsToLines(pages: PdfPageItems[]): string {
  const q = (v: number): number => Math.round(v);
  const Y_TOL = 2; // PDF-unit tolerance for "same line" after rounding

  const pageTexts = pages.map((pg) => {
    const items = pg.items.filter((it) => it.str.length > 0);
    const sorted = [...items].sort((a, b) => {
      const ay = q(a.y);
      const by = q(b.y);
      if (ay !== by) return by - ay; // top (higher y) first
      if (a.x !== b.x) return a.x - b.x;
      return a.streamIndex - b.streamIndex;
    });
    const lines: PdfItem[][] = [];
    let cur: PdfItem[] = [];
    let curY: number | null = null;
    for (const it of sorted) {
      const y = q(it.y);
      if (curY === null || Math.abs(y - curY) <= Y_TOL) {
        cur.push(it);
        if (curY === null) curY = y;
      } else {
        lines.push(cur);
        cur = [it];
        curY = y;
      }
    }
    if (cur.length) lines.push(cur);

    const lineStrs = lines.map((line) => {
      const l = [...line].sort((a, b) => (a.x !== b.x ? a.x - b.x : a.streamIndex - b.streamIndex));
      let s = '';
      let prevEnd: number | null = null;
      for (const it of l) {
        if (prevEnd !== null) {
          const gap = it.x - prevEnd;
          if (gap > 0.25 * (it.fontSize || 1)) s += ' ';
        }
        s += it.str;
        prevEnd = it.x + it.width;
      }
      return s;
    });
    return lineStrs.join('\n');
  });

  return pageTexts.join('\n\n');
}

// ---- real text engine (optional, lazy) -------------------------------------

interface PdfjsTextItem {
  str: string;
  transform: number[]; // [a,b,c,d,e,f]; e=x, f=y
  width: number;
  height: number;
}
interface PdfjsTextPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: PdfjsTextItem[] }>;
}
interface PdfjsTextDoc {
  numPages: number;
  getPage(n: number): Promise<PdfjsTextPage>;
}
interface PdfjsTextModule {
  getDocument(o: { data: Uint8Array }): { promise: Promise<PdfjsTextDoc> };
}

/** Real text-layer engine via pdfjs-dist. Lazily loaded; pure-JS but OPTIONAL behind the seam. */
export function pdfjsTextEngine(): PdfTextEngine {
  return {
    name: 'pdfjs',
    async extract(pdf: Uint8Array): Promise<PdfPageItems[]> {
      const specifier = 'pdfjs-dist/legacy/build/pdf.mjs';
      const mod = (await import(specifier as string)) as unknown as PdfjsTextModule;
      const doc = await mod.getDocument({ data: pdf }).promise;
      const out: PdfPageItems[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const vp = page.getViewport({ scale: 1 });
        const tc = await page.getTextContent();
        const items: PdfItem[] = tc.items.map((it, i) => ({
          str: it.str,
          x: it.transform[4],
          y: it.transform[5],
          width: it.width,
          fontSize: Math.hypot(it.transform[2], it.transform[3]) || it.height || 1,
          streamIndex: i,
        }));
        out.push({ page: n, mediaBox: [0, 0, vp.width, vp.height], items });
      }
      return out;
    },
  };
}

// ---- loader / router -------------------------------------------------------

async function scannedPdf(
  raw: RawDoc,
  options: BuiltinOptions
): Promise<{ text: string; blocks: LayoutBlock[] }> {
  if (!options.raster) {
    throw new Error(
      'builtin capture: scanned PDF requires a RasterizeProvider — makeBuiltinCapture({ raster })'
    );
  }
  if (!options.ocr) {
    throw new Error(
      'builtin capture: scanned PDF requires an OCR engine — makeBuiltinCapture({ ocr })'
    );
  }
  const rpages = await options.raster.rasterize(raw.bytes);
  if (rpages.length === 0) {
    throw new Error('builtin capture: rasterizer produced no pages (fail closed)');
  }
  const pageTexts: string[] = [];
  const blocks: LayoutBlock[] = [];
  for (const rp of rpages) {
    const { text } = await options.ocr.recognize(rp.image, { mime: rp.mime });
    const ct = canonicalizeText(text);
    pageTexts.push(ct);
    blocks.push({ page: rp.page, text: ct });
  }
  return { text: canonicalizeText(pageTexts.join('\n\n')), blocks };
}

/**
 * Load a PDF RawDoc into canonical text + per-page blocks. classifyPdf routes scanned PDFs to
 * the OCR handoff; text-layer PDFs go through the PdfTextEngine, and an empty/junk text layer
 * reroutes to scanned. Every missing capability fails closed with a specific message.
 */
export async function loadPdf(
  raw: RawDoc,
  options: BuiltinOptions
): Promise<{ text: string; blocks: LayoutBlock[] }> {
  if (classifyPdf(raw.bytes) === 'scanned') {
    return scannedPdf(raw, options);
  }
  if (!options.pdfText) {
    throw new Error(
      'builtin capture: PDF text-layer requires a PdfTextEngine — makeBuiltinCapture({ pdfText })'
    );
  }
  const pages = await options.pdfText.extract(raw.bytes);
  const text = canonicalizeText(pdfItemsToLines(pages));
  if (text === '') {
    // coverage reroute: no usable text layer → scanned/OCR handoff (needs raster + ocr)
    return scannedPdf(raw, options);
  }
  const blocks: LayoutBlock[] = pages.map((pg) => ({
    page: pg.page,
    text: canonicalizeText(pdfItemsToLines([pg])),
  }));
  return { text, blocks };
}
