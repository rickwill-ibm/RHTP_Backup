/**
 * S1 — CaptureProvider seam. Turns a RawDoc into a CanonicalDoc the S0 anchoring spine can
 * verify against. The BUILTIN provider is MANDATORY and offline (text, HTML, CSV, and — with
 * the injected OCR engine — scanned images, processing Horizon/Elevance/Aetna with no external
 * service). ibm-datacap / watsonx / generic-http are OPTIONAL, config-selected adapters for
 * clients with an existing capture stack. Every provider emits the same CanonicalDoc shape.
 */
import { hashText, type ProvenanceClass } from '../anchor/verify';
import type { CanonicalDoc } from '../pipeline/contracts';
import type { OcrEngine } from './ocr';

export interface RawDoc {
  docId: string;
  sourceFile: string;
  bytes: Uint8Array;
  mime: string; // 'text/plain' | 'text/html' | 'text/csv' | 'image/png' | 'application/pdf' | ...
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

export interface BuiltinOptions {
  ocr?: OcrEngine; // required to load image/* inputs
}

export const BUILTIN_LOADER_VERSION = 'builtin@0.2';

function decodeUtf8(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('utf8');
}

/** Dependency-free HTML → canonical text (offsets index into the returned text). */
export function htmlToCanonicalText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
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
  return parseCsv(csv)
    .map((r) => r.join(' | '))
    .join('\n');
}

function toCanonicalDoc(raw: RawDoc, text: string): CanonicalDoc {
  return {
    docId: raw.docId,
    sourceFile: raw.sourceFile,
    provenanceClass: raw.provenanceClass,
    text,
    // Hash over SOURCE bytes (OCR-stable), not the derived text, per the plan's OCR hardening.
    sourceContentHash: hashText(Buffer.from(raw.bytes).toString('base64')),
    loaderVersion: BUILTIN_LOADER_VERSION,
    blocks: [{ page: 1, text }],
  };
}

/** The mandatory builtin provider. Handles text/HTML/CSV, and image/* when an OCR engine is set. */
export function makeBuiltinCapture(options: BuiltinOptions = {}): CaptureProvider {
  return {
    name: 'builtin',
    supports: (mime: string) => /^text\/(plain|html|csv)\b/i.test(mime) || /^image\//i.test(mime),
    async load(raw: RawDoc): Promise<CanonicalDoc> {
      if (/^image\//i.test(raw.mime)) {
        if (!options.ocr) {
          throw new Error(
            'builtin capture: image input requires an OCR engine — makeBuiltinCapture({ ocr })'
          );
        }
        const { text } = await options.ocr.recognize(raw.bytes, { mime: raw.mime });
        return toCanonicalDoc(raw, text);
      }
      const s = decodeUtf8(raw.bytes);
      const text = /html/i.test(raw.mime)
        ? htmlToCanonicalText(s)
        : /csv/i.test(raw.mime)
          ? csvToCanonicalText(s)
          : s;
      return toCanonicalDoc(raw, text);
    },
  };
}

/** The default builtin provider (text/HTML/CSV; image requires makeBuiltinCapture({ ocr })). */
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
