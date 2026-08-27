/**
 * S1 — CaptureProvider seam. Turns a RawDoc into a CanonicalDoc the S0 anchoring spine can
 * verify against. The BUILTIN provider is MANDATORY and offline: text, HTML, CSV natively;
 * and — through injected seams — scanned images (OcrEngine), PDFs (PdfTextEngine +
 * RasterizeProvider), and spreadsheets (WorkbookReader). Every derived text ends through the
 * one shared canonicalizeText (normalize.ts) so hashes and offsets are stable across OSes.
 * ibm-datacap / watsonx / generic-http remain OPTIONAL, config-selected vendor adapters.
 *
 * builtin@0.3: text/HTML/CSV now route through the shared normalizer and decode UTF-8
 * FATALLY (malformed bytes throw, no silent U+FFFD). Both shift offsets for edge inputs vs
 * 0.2, so mixed-version anchors fail closed through verifyAnchor — the intended safety.
 */
import { hashText, type ProvenanceClass } from '../anchor/verify';
import type { CanonicalDoc, LayoutBlock } from '../pipeline/contracts';
import { canonicalizeText, assertCanonical, assertNonEmpty } from './normalize';
import type { OcrEngine } from './ocr';
import { loadPdf, type PdfTextEngine } from './pdf';
import { loadXlsx, type WorkbookReader } from './xlsx';
import type { RasterizeProvider } from './rasterize';

export interface RawDoc {
  docId: string;
  sourceFile: string;
  bytes: Uint8Array;
  mime: string; // 'text/plain' | 'text/html' | 'text/csv' | 'image/png' | 'application/pdf' | spreadsheet…
  provenanceClass: ProvenanceClass;
}

export interface CaptureProvider {
  readonly name: string;
  supports(mime: string): boolean;
  load(raw: RawDoc): Promise<CanonicalDoc>;
}

export type CaptureProviderKind = 'builtin' | 'ibm-datacap' | 'watsonx' | 'generic-http';

export interface CaptureConfig {
  provider: CaptureProviderKind; // default 'builtin' — mandatory, offline
  endpoint?: string; // datacap/watsonx/generic-http
  apiKeyRef?: string; // a credential REFERENCE, never the secret itself
}

/** Injected capability engines. Absent engine ⇒ its input class fails closed (never silent). */
export interface BuiltinOptions {
  ocr?: OcrEngine; // image/* and scanned-PDF pages
  pdfText?: PdfTextEngine; // PDF embedded text layer
  raster?: RasterizeProvider; // PDF page → image (scanned path)
  workbook?: WorkbookReader; // XLSX/XLS
}

export const BUILTIN_LOADER_VERSION = 'builtin@0.3';

const SPREADSHEET_MIME =
  /spreadsheetml|ms-excel|^application\/vnd\.oasis\.opendocument\.spreadsheet/i;

/** Fatal UTF-8 decode: malformed bytes throw instead of yielding U+FFFD (fail closed). */
function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** Dependency-free HTML → canonical text (offsets index into the returned text). */
export function htmlToCanonicalText(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
  return canonicalizeText(stripped);
}

/** Dependency-free RFC4180-ish CSV parser. */
export function parseCsv(s: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (c !== '\r') {
      cell += c;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** CSV → canonical text: one row per line, cells joined by ' | ' (offsets index into this). */
export function csvToCanonicalText(csv: string): string {
  return canonicalizeText(
    parseCsv(csv)
      .map((r) => r.join(' | '))
      .join('\n')
  );
}

/**
 * Assemble a CanonicalDoc from already-canonical text. Guards run here so EVERY loader path
 * fails closed on non-canonical or silent-empty output before a doc escapes the seam.
 */
function toCanonicalDoc(raw: RawDoc, text: string, blocks?: LayoutBlock[]): CanonicalDoc {
  assertNonEmpty(text, raw.bytes.length);
  assertCanonical(text);
  return {
    docId: raw.docId,
    sourceFile: raw.sourceFile,
    provenanceClass: raw.provenanceClass,
    text,
    // Hash over SOURCE container bytes (OCR/parse-stable), not the derived text.
    sourceContentHash: hashText(Buffer.from(raw.bytes).toString('base64')),
    loaderVersion: BUILTIN_LOADER_VERSION,
    blocks: blocks ?? [{ page: 1, text }],
  };
}

/** The mandatory builtin provider. text/HTML/CSV natively; image/PDF/spreadsheet via seams. */
export function makeBuiltinCapture(options: BuiltinOptions = {}): CaptureProvider {
  return {
    name: 'builtin',
    supports: (mime: string) =>
      /^text\/(plain|html|csv)\b/i.test(mime) ||
      /^image\//i.test(mime) ||
      /^application\/pdf\b/i.test(mime) ||
      SPREADSHEET_MIME.test(mime),
    async load(raw: RawDoc): Promise<CanonicalDoc> {
      // image/* → OCR seam
      if (/^image\//i.test(raw.mime)) {
        if (!options.ocr) {
          throw new Error(
            'builtin capture: image input requires an OCR engine — makeBuiltinCapture({ ocr })'
          );
        }
        const { text } = await options.ocr.recognize(raw.bytes, { mime: raw.mime });
        return toCanonicalDoc(raw, canonicalizeText(text));
      }
      // application/pdf → PDF loader (text-layer or scanned handoff)
      if (/^application\/pdf\b/i.test(raw.mime)) {
        const { text, blocks } = await loadPdf(raw, options);
        return toCanonicalDoc(raw, text, blocks);
      }
      // spreadsheet → XLSX loader
      if (SPREADSHEET_MIME.test(raw.mime)) {
        const { text, blocks } = await loadXlsx(raw, options);
        return toCanonicalDoc(raw, text, blocks);
      }
      // text / HTML / CSV
      const s = decodeUtf8(raw.bytes);
      const text = /html/i.test(raw.mime)
        ? htmlToCanonicalText(s)
        : /csv/i.test(raw.mime)
          ? csvToCanonicalText(s)
          : canonicalizeText(s);
      return toCanonicalDoc(raw, text);
    },
  };
}

/** The default builtin provider (text/HTML/CSV; image/PDF/spreadsheet require their engines). */
export const builtinCapture: CaptureProvider = makeBuiltinCapture();

/** A typed seam for a vendor adapter; throws until an endpoint is configured + wired. */
function externalCaptureStub(config: CaptureConfig): CaptureProvider {
  return {
    name: config.provider,
    supports: () => true,
    async load(): Promise<CanonicalDoc> {
      throw new Error(
        `CaptureProvider '${config.provider}' is a configured seam but not yet wired ` +
          `(set endpoint + apiKeyRef and implement the adapter). Builtin remains the default.`
      );
    },
  };
}

/** Select a provider by config. Unknown/undefined falls back to the mandatory builtin. */
export function selectCaptureProvider(
  config: CaptureConfig,
  options: BuiltinOptions = {}
): CaptureProvider {
  switch (config.provider) {
    case 'ibm-datacap':
    case 'watsonx':
    case 'generic-http':
      return externalCaptureStub(config);
    case 'builtin':
    default:
      return makeBuiltinCapture(options);
  }
}
