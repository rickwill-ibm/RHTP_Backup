/**
 * Server-only document intake for word-processor formats — RTF and DOCX.
 *
 * Payer/state medical policies arrive in whatever a reviewer had on hand: a native PDF, a
 * scanned PDF (→ OCR seam), or a Word save. A "Word document" is, in practice, one of two
 * containers:
 *   • RTF  — `{\rtf1 ...}` markup, often produced when a scanned PDF is re-saved as .doc/.rtf
 *            (Word rebuilds the pages into an RTF text layer). Extension is frequently `.doc`.
 *   • DOCX — an Open-XML ZIP whose body text lives in `word/document.xml`.
 *
 * Both are turned into plain text HERE, at the server edge, so the deterministic extractor core
 * stays dependency-free and format-agnostic. The RTF reader (a self-contained strip-RTF state machine
 * that reconstructs outline numbering) lives in `docIntakeRtf`; DOCX is unzipped with a minimal
 * central-directory reader + `node:zlib`. No library. Structure-driven, payer-agnostic.
 *
 * SERVER ONLY: import from API routes / other server modules, never from a client component.
 */
import { inflateRawSync } from 'node:zlib';
import { latin1, bytesStartWith } from './docIntakeBytes';
import { rtfToText } from './docIntakeRtf';

/* ------------------------------------------------------------------ *
 * Format detection (content magic first, extension second)
 * ------------------------------------------------------------------ */

export type DocFormat = 'rtf' | 'docx' | 'ole-doc' | 'other';

/** Classify an uploaded word-processor file from its bytes, then its filename. Content magic is
 *  authoritative: a `.doc` that is really RTF (a common "save as Word" result) is detected as rtf. */
export function detectDocFormat(bytes: Uint8Array, filename: string): DocFormat {
  const head = latin1(bytes.subarray(0, 8)).replace(/^\uFEFF/, '');
  if (head.startsWith('{\\rtf')) return 'rtf';
  if (bytesStartWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return 'docx'; // "PK\x03\x04" zip
  if (bytesStartWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) return 'ole-doc'; // legacy OLE binary .doc
  if (/\.rtf$/i.test(filename)) return 'rtf';
  if (/\.docx$/i.test(filename)) return 'docx';
  return 'other';
}

/* ------------------------------------------------------------------ *
 * DOCX → text  (minimal ZIP central-directory reader + node:zlib)
 * ------------------------------------------------------------------ */

function u16(b: Uint8Array, o: number): number {
  return b[o] | (b[o + 1] << 8);
}
function u32(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
}

/** Locate a named entry via the ZIP central directory and return its decompressed bytes, or null if
 *  absent. Uses the central directory (authoritative sizes) rather than local-header sizes, which
 *  streaming writers like Word leave zero with the real values in a trailing descriptor. */
function readZipEntry(bytes: Uint8Array, name: string): Uint8Array | null {
  const EOCD_SIG = 0x06054b50;
  let eocd = -1;
  const minEnd = Math.max(0, bytes.length - 22 - 0xffff);
  for (let i = bytes.length - 22; i >= minEnd; i -= 1) {
    if (u32(bytes, i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const cdCount = u16(bytes, eocd + 10);
  let p = u32(bytes, eocd + 16);

  const CDH_SIG = 0x02014b50;
  for (let n = 0; n < cdCount && p + 46 <= bytes.length; n += 1) {
    if (u32(bytes, p) !== CDH_SIG) break;
    const method = u16(bytes, p + 10);
    const compSize = u32(bytes, p + 20);
    const nameLen = u16(bytes, p + 28);
    const extraLen = u16(bytes, p + 32);
    const commentLen = u16(bytes, p + 34);
    const localOff = u32(bytes, p + 42);
    const entryName = latin1(bytes.subarray(p + 46, p + 46 + nameLen));

    if (entryName === name) {
      if (u32(bytes, localOff) !== 0x04034b50) return null;
      const lNameLen = u16(bytes, localOff + 26);
      const lExtraLen = u16(bytes, localOff + 28);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const data = bytes.subarray(dataStart, dataStart + compSize);
      if (method === 0) return data; // stored
      if (method === 8) return new Uint8Array(inflateRawSync(data)); // deflate
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&');
}

/** Turn WordprocessingML (word/document.xml) into text: paragraph/break/tab elements become
 *  whitespace, every other tag is stripped, XML entities decoded. */
export function docxXmlToText(xml: string): string {
  let s = xml.replace(/<w:tab\b[^>]*\/?>/g, '\t');
  s = s.replace(/<w:br\b[^>]*\/?>/g, '\n');
  s = s.replace(/<\/w:p>/g, '\n');
  s = s.replace(/<[^>]+>/g, '');
  return decodeXmlEntities(s);
}

/** Extract the body text of a DOCX (Open-XML ZIP). Throws if it is not a readable DOCX. */
export function docxToText(bytes: Uint8Array): string {
  const doc = readZipEntry(bytes, 'word/document.xml');
  if (!doc) throw new Error('not a readable DOCX: word/document.xml not found');
  return docxXmlToText(new TextDecoder('utf-8').decode(doc));
}

/* ------------------------------------------------------------------ *
 * Unified entry point
 * ------------------------------------------------------------------ */

export class UnsupportedDocError extends Error {
  constructor(
    public readonly format: DocFormat,
    public readonly filename: string
  ) {
    super(
      format === 'ole-doc'
        ? `legacy binary .doc is not supported (${filename}); re-save as .docx, .rtf, or PDF`
        : `no word-processor reader for ${format} (${filename})`
    );
    this.name = 'UnsupportedDocError';
  }
}

/** True when this file should be handled as a word-processor document (RTF/DOCX/legacy .doc). */
export function isWordProcessorDoc(bytes: Uint8Array, filename: string): boolean {
  const fmt = detectDocFormat(bytes, filename);
  return fmt === 'rtf' || fmt === 'docx' || fmt === 'ole-doc';
}

/**
 * Read RTF or DOCX bytes into plain text. Legacy binary `.doc` (OLE) is detected and rejected with a
 * clear, actionable error rather than emitting garbage. Returns raw text; caller normalizes and runs
 * the shared artifact cleanup.
 */
export function docToText(bytes: Uint8Array, filename: string): string {
  const fmt = detectDocFormat(bytes, filename);
  if (fmt === 'rtf') return rtfToText(bytes);
  if (fmt === 'docx') return docxToText(bytes);
  throw new UnsupportedDocError(fmt, filename);
}

// Re-export the RTF reader so existing importers of `docIntake` keep working after the split.
export { rtfToText } from './docIntakeRtf';
