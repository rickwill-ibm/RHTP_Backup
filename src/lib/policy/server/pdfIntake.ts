/**
 * Server-only PDF intake. Turns uploaded PDF bytes into a `TextSource` the extractor can
 * consume, using `unpdf` (pure-JS, serverless-safe pdf.js). This is the REAL implementation
 * of the PDF reader seam declared in extract/readers.ts — it lives at the server edge so the
 * pure extractor core stays dependency-free.
 *
 * Scanned/image PDFs have NO text layer, so `unpdf` returns (near-)nothing. In that case we
 * fall back to the pluggable OCR seam (ocr.ts) — an external service, configured via env — to
 * recover the text. When no OCR service is configured we return empty text and let the caller
 * report "looks like a scan; configure OCR", rather than silently guessing.
 *
 * SERVER ONLY: import from API routes, never from a client component.
 */
import { extractText, getDocumentProxy } from 'unpdf';
import { normalizeText, cleanDocumentArtifacts } from '../extract/readers';
import type { TextSource } from '../extract/types';
import { selectOcrProvider } from './ocr';
import { detectDocFormat, docToText } from './docIntake';

/** Below this many non-whitespace chars, a PDF is treated as having no usable text layer. */
const NO_TEXT_LAYER_THRESHOLD = 16;

function nonWhitespaceLength(s: string): number {
  return s.replace(/\s/g, '').length;
}

/** Extract the text layer of a PDF into a TextSource (mergePages → one text stream). */
export async function pdfToTextSource(bytes: Uint8Array, sourceFile: string): Promise<TextSource> {
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  const raw = Array.isArray(text) ? text.join('\n') : text;
  let normalized = cleanDocumentArtifacts(normalizeText(raw));
  let viaOcr = false;
  let ocrProvider: string | undefined;

  // No usable text layer → a scanned/image PDF. Try the external OCR seam.
  if (nonWhitespaceLength(normalized) < NO_TEXT_LAYER_THRESHOLD) {
    const provider = selectOcrProvider();
    if (provider.id !== 'none') {
      try {
        const result = await provider.ocr({
          bytes,
          filename: sourceFile,
          mimeType: 'application/pdf',
        });
        const ocrText = cleanDocumentArtifacts(normalizeText(result.text));
        if (nonWhitespaceLength(ocrText) >= NO_TEXT_LAYER_THRESHOLD) {
          normalized = ocrText;
          viaOcr = true;
          ocrProvider = result.provider;
        }
      } catch {
        // Leave the text empty; the caller reports it as a scan needing OCR configuration.
      }
    }
  }

  return {
    sourceFile,
    mimeType: 'application/pdf',
    text: normalized,
    rawTextChars: normalized.length,
    viaOcr,
    ocrProvider,
  };
}

/**
 * Decide how to read an uploaded file into text, by CONTENT then extension:
 *   • PDF (native or scanned→OCR)                     → pdfToTextSource
 *   • word-processor doc (RTF, incl. .doc-that-is-RTF; DOCX) → docToText
 *   • everything else                                 → UTF-8 plain text
 *
 * Content magic wins over the declared mime type / extension, so a `.doc` that is really RTF (a
 * common "Save as Word" result of a scanned PDF) and a mislabeled upload are both handled.
 */
export async function fileToTextSource(
  bytes: Uint8Array,
  filename: string,
  mimeType: string
): Promise<TextSource> {
  const isPdf =
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46; // "%PDF"
  if (isPdf || mimeType === 'application/pdf' || /\.pdf$/i.test(filename)) {
    return pdfToTextSource(bytes, filename);
  }

  const docFormat = detectDocFormat(bytes, filename);
  if (docFormat === 'rtf' || docFormat === 'docx') {
    const text = cleanDocumentArtifacts(normalizeText(docToText(bytes, filename)));
    return {
      sourceFile: filename,
      mimeType:
        docFormat === 'docx'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/rtf',
      text,
      rawTextChars: text.length,
    };
  }

  const text = cleanDocumentArtifacts(normalizeText(new TextDecoder('utf-8').decode(bytes)));
  return {
    sourceFile: filename,
    mimeType: mimeType || 'text/plain',
    text,
    rawTextChars: text.length,
  };
}
