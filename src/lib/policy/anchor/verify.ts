/**
 * Anchoring spine (S0) — the multi-span byte-match verifier that every downstream
 * decision trusts. Guardrail 2: every cited snippet must byte-match its source at its
 * charSpan at ingest AND re-verify before render/decision; any drift fails closed.
 * There is NO fuzzy / closest-span fallback — an anchor that cannot exact-match fails.
 *
 * Pure + deterministic. No PHI, no model, no I/O.
 */
import { createHash } from 'node:crypto';

export type ProvenanceClass = 'authoritative' | 'sample' | 'synthetic';

/** A canonical document the anchor resolves against. charSpans index into `text`. */
export interface CanonicalRef {
  docId: string;
  text: string;
}

/** One byte-anchored span into a single document. `charSpan` is half-open and non-empty. */
export interface AnchorSpan {
  docId: string;
  charSpan: [number, number]; // [start, end) — start < end, into canonical text
  snippet: string; // exact substring captured at ingest
  contentHash: string; // sha256 of the snippet bytes captured at ingest
  page?: number | null;
}

/** A multi-span, multi-doc anchor (SourceAnchorV2). Every span must verify. */
export interface SourceAnchorV2 {
  anchorId: string;
  spans: AnchorSpan[];
  provenanceClass: ProvenanceClass;
}

/** sha256 hex of a UTF-8 string. */
export function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Mint a byte-anchored span from a document + offsets (used at ingest and in tests). */
export function makeSpan(
  doc: CanonicalRef,
  start: number,
  end: number,
  page?: number | null
): AnchorSpan {
  // Require a NON-EMPTY span (start < end): an empty citation carries no provenance and
  // would verify vacuously against any document, so it is rejected at mint time.
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    end > doc.text.length
  ) {
    throw new RangeError(
      `makeSpan: invalid span [${start}, ${end}) for doc ${doc.docId} (len ${doc.text.length})`
    );
  }
  const snippet = doc.text.slice(start, end);
  return {
    docId: doc.docId,
    charSpan: [start, end],
    snippet,
    contentHash: hashText(snippet),
    page: page ?? null,
  };
}

export type SpanFailReason =
  | 'doc-missing'
  | 'duplicate-doc'
  | 'empty-span'
  | 'out-of-bounds'
  | 'snippet-mismatch'
  | 'hash-mismatch';

export interface SpanVerdict {
  ok: boolean;
  docId: string;
  charSpan: [number, number];
  reason?: SpanFailReason;
}

export interface AnchorVerdict {
  ok: boolean; // true only if EVERY span verifies
  spans: SpanVerdict[];
}

/**
 * Build docId → text. A duplicate docId whose text DIFFERS is ambiguous (a shadowing
 * surface that could mask drift), so it is flagged and the whole anchor fails closed.
 */
function buildDocIndex(docs: CanonicalRef[]): { texts: Map<string, string>; conflict: boolean } {
  const texts = new Map<string, string>();
  let conflict = false;
  for (const d of docs) {
    const prev = texts.get(d.docId);
    if (prev !== undefined && prev !== d.text) conflict = true;
    texts.set(d.docId, d.text);
  }
  return { texts, conflict };
}

/** Verify a single span against its document text. */
export function verifySpan(span: AnchorSpan, docTexts: Map<string, string>): SpanVerdict {
  const base = { docId: span.docId, charSpan: span.charSpan };
  const [start, end] = span.charSpan;
  if (start >= end) return { ...base, ok: false, reason: 'empty-span' };
  const text = docTexts.get(span.docId);
  if (text === undefined) return { ...base, ok: false, reason: 'doc-missing' };
  if (start < 0 || end > text.length) return { ...base, ok: false, reason: 'out-of-bounds' };
  const actual = text.slice(start, end);
  if (actual !== span.snippet) return { ...base, ok: false, reason: 'snippet-mismatch' };
  if (hashText(actual) !== span.contentHash) return { ...base, ok: false, reason: 'hash-mismatch' };
  return { ...base, ok: true };
}

/**
 * Verify a multi-span anchor. Returns ok:true ONLY when every span byte-matches AND
 * hash-matches its source — the fail-closed contract. An empty anchor, an empty span, a
 * missing doc, or an ambiguous (conflicting duplicate) docId all fail closed.
 */
export function verifyAnchor(anchor: SourceAnchorV2, docs: CanonicalRef[]): AnchorVerdict {
  const { texts, conflict } = buildDocIndex(docs);
  if (conflict) {
    return {
      ok: false,
      spans: anchor.spans.map((s) => ({
        docId: s.docId,
        charSpan: s.charSpan,
        ok: false,
        reason: 'duplicate-doc' as const,
      })),
    };
  }
  const spans = anchor.spans.map((s) => verifySpan(s, texts));
  return { ok: spans.length > 0 && spans.every((s) => s.ok), spans };
}

/** Line-start offsets, for mapping a char offset back to (line, col). */
export function buildLineIndex(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

/**
 * Map a char offset to a 1-based (line, col). `textLength` bounds the offset so an
 * out-of-range offset fails loudly instead of returning a fabricated position.
 */
export function offsetToLineCol(
  offset: number,
  lineIndex: number[],
  textLength: number
): { line: number; col: number } {
  if (offset < 0 || offset > textLength) {
    throw new RangeError(`offsetToLineCol: offset ${offset} out of range [0, ${textLength}]`);
  }
  let lo = 0;
  let hi = lineIndex.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lineIndex[mid] <= offset) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return { line: ans + 1, col: offset - lineIndex[ans] + 1 };
}
