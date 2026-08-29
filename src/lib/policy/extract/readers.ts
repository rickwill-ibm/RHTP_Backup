/**
 * Document readers — the bytes→text seam.
 *
 * The extractor CORE reasons over text (`TextSource`). Turning raw document bytes
 * into text is a pluggable seam so heavy/non-deterministic format parsers stay at
 * the edge, behind an interface, out of the deterministic core and its gate.
 *
 * This unit ships ONE real reader — plain / pre-extracted text — which is exactly
 * what the offline `tools/seed/parse_policies.py` already emits. PDF, XLSX, and
 * OCR are declared as seams: a real implementation (or a test fake) is injected
 * via `makeReader`. Until a real reader is registered for a format, an upload of
 * that format yields a clear, non-crashing "reader not wired" signal.
 */
import type { TextSource } from './types';

export interface DocumentReader {
  id: string;
  /** Does this reader handle the given mime type / filename? */
  canRead(mimeType: string, filename: string): boolean;
  /** Turn bytes into a TextSource. May throw on a corrupt document. */
  read(bytes: Uint8Array, filename: string, mimeType: string): TextSource;
}

/** Normalize line endings and strip a leading BOM, leaving other offsets intact. */
export function normalizeText(raw: string): string {
  const noBom = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  return noBom.replace(/\r\n?/g, '\n');
}

/**
 * Collapse a token whose every character is doubled — a common artifact when a PDF text layer
 * (or OCR) renders bold headings by emitting each glyph twice, e.g. "MMeeddiiccaall
 * NNeecceessssiittyy" -> "Medical Necessity". Only fires on fully-paired tokens (>=4 chars, even
 * length, char[i]===char[i+1] across the whole token), so ordinary words with the odd double
 * letter ("committee", "book") are never touched. Structure-driven, payer-agnostic.
 */
function dedoubleToken(tok: string): string {
  if (tok.length < 4 || tok.length % 2 !== 0 || !/\S/.test(tok)) return tok;
  for (let i = 0; i < tok.length; i += 2) {
    if (tok[i] !== tok[i + 1]) return tok;
  }
  let out = '';
  for (let i = 0; i < tok.length; i += 2) out += tok[i];
  return out;
}

/**
 * Clean text-extraction / OCR artifacts that break section detection without shifting meaning:
 * de-double bold-heading tokens (see dedoubleToken). Applied at ingest so every downstream reader
 * sees the same clean text. Deliberately conservative.
 */
export function cleanDocumentArtifacts(text: string): string {
  return text
    .split('\n')
    .map((line) =>
      line
        .split(/(\s+)/)
        .map((tok) => dedoubleToken(tok))
        .join('')
    )
    .join('\n');
}

/** The one real reader: UTF-8 plain text (text/plain, .txt, .csv, pre-extracted text). */
export const plainTextReader: DocumentReader = {
  id: 'plain-text',
  canRead(mimeType: string, filename: string): boolean {
    return (
      mimeType.startsWith('text/') ||
      /\.(txt|csv|md|text)$/i.test(filename) ||
      mimeType === 'application/octet-stream'
    );
  },
  read(bytes: Uint8Array, filename: string, mimeType: string): TextSource {
    const text = normalizeText(new TextDecoder('utf-8').decode(bytes));
    return {
      sourceFile: filename,
      mimeType: mimeType || 'text/plain',
      text,
      rawTextChars: text.length,
    };
  },
};

/**
 * Build a reader from an injected parse function. Real PDF/XLSX/OCR wrappers and
 * test fakes are both created this way — the core never imports a format library.
 */
export function makeReader(
  id: string,
  accept: (mimeType: string, filename: string) => boolean,
  parse: (bytes: Uint8Array, filename: string) => string
): DocumentReader {
  return {
    id,
    canRead: accept,
    read(bytes: Uint8Array, filename: string, mimeType: string): TextSource {
      const text = normalizeText(parse(bytes, filename));
      return { sourceFile: filename, mimeType, text, rawTextChars: text.length };
    },
  };
}

export class ReaderNotWiredError extends Error {
  constructor(
    public readonly mimeType: string,
    public readonly filename: string
  ) {
    super(`no document reader wired for ${mimeType || 'unknown type'} (${filename})`);
    this.name = 'ReaderNotWiredError';
  }
}

/** An ordered set of readers; first match wins. plainText is always present. */
export class ReaderRegistry {
  private readers: DocumentReader[];

  constructor(initial: DocumentReader[] = [plainTextReader]) {
    this.readers = [...initial];
  }

  register(reader: DocumentReader): void {
    if (this.readers.some((r) => r.id === reader.id)) return;
    // Injected format readers take precedence over the plain-text catch-all.
    this.readers.unshift(reader);
  }

  select(mimeType: string, filename: string): DocumentReader | null {
    return this.readers.find((r) => r.canRead(mimeType, filename)) ?? null;
  }

  /** Read a document, or throw ReaderNotWiredError when no reader handles it. */
  read(bytes: Uint8Array, filename: string, mimeType: string): TextSource {
    const reader = this.select(mimeType, filename);
    if (!reader) throw new ReaderNotWiredError(mimeType, filename);
    return reader.read(bytes, filename, mimeType);
  }
}
