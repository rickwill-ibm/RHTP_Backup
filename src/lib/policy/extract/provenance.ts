/**
 * Provenance anchoring — the one genuinely-useful primitive carried over from the
 * retired S0 work, rebuilt minimal and falsifiable.
 *
 * A `FieldProvenance` ties an extracted value to the exact character span in the
 * source text it came from. `verifyAnchor` is the falsifiable check: slice the
 * source at the span and it must equal the recorded value. A wrong span fails —
 * that is what makes this evidence rather than decoration. No hashing, no ledger,
 * no model calls; just an offset a human (or a UI) can re-check against the source.
 */

export interface Span {
  start: number;
  end: number;
}

export interface FieldProvenance {
  /** Dotted path of the field this value populates, e.g. "codes.cptCovered[0]". */
  field: string;
  /** The extracted value, verbatim. */
  value: string;
  /** Character offsets into the source `TextSource.text`. */
  span: Span;
  /** A window of surrounding source text, for human display (the research drawer + the assistant
   *  citation). Wide enough that a reviewer can read the code IN CONTEXT — the sentence/table row it
   *  sits in — not just a few characters either side. Display-only; verification is span-based. */
  snippet: string;
}

// A code in a coding table or an inline sentence needs a full line of context on each side for a
// reviewer to actually verify it — 24 chars showed barely three words and sliced words in half.
const SNIPPET_PAD = 100;

/** Build and validate a span against the text it indexes into. Throws if out of range. */
export function makeSpan(text: string, start: number, end: number): Span {
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new Error(`span offsets must be integers: (${start}, ${end})`);
  }
  if (start < 0 || end > text.length || start > end) {
    throw new Error(`span (${start}, ${end}) out of range for text length ${text.length}`);
  }
  return { start, end };
}

function snippetAround(text: string, span: Span): string {
  const from = Math.max(0, span.start - SNIPPET_PAD);
  const to = Math.min(text.length, span.end + SNIPPET_PAD);
  // Only a truncated side gets an ellipsis; a side that reaches the text edge is whole.
  const leftCut = from > 0;
  const rightCut = to < text.length;
  // If a cut lands INSIDE a word, the edge token is a fragment ("roux" → "ux"). Snap it away so the
  // excerpt begins/ends on a whole word. Decide from the raw neighbour chars (positions shift once
  // whitespace is collapsed). The code sits centred in the window, so snapping never touches it.
  const leftMidWord = leftCut && /\S/.test(text[from - 1] ?? '') && /\S/.test(text[from] ?? '');
  const rightMidWord = rightCut && /\S/.test(text[to - 1] ?? '') && /\S/.test(text[to] ?? '');
  let body = text.slice(from, to).replace(/\s+/g, ' ').trim();
  if (leftMidWord) {
    const sp = body.indexOf(' ');
    if (sp > 0) body = body.slice(sp + 1);
  }
  if (rightMidWord) {
    const sp = body.lastIndexOf(' ');
    if (sp > 0) body = body.slice(0, sp);
  }
  return `${leftCut ? '…' : ''}${body}${rightCut ? '…' : ''}`.trim();
}

/**
 * Anchor a value to its first occurrence in `text` at or after `fromIndex`.
 * Returns null when the value is not present — the caller decides whether that is
 * a warning or a hard skip. Never invents a span.
 */
export function anchorValue(
  text: string,
  value: string,
  field: string,
  fromIndex = 0
): FieldProvenance | null {
  if (value.length === 0) return null;
  const idx = text.indexOf(value, Math.max(0, fromIndex));
  if (idx < 0) return null;
  const span = makeSpan(text, idx, idx + value.length);
  return { field, value, span, snippet: snippetAround(text, span) };
}

/**
 * Build provenance from a known span. The value is the VERBATIM source slice, so
 * it always verifies — even when the record stores a normalized (e.g. upper-cased)
 * form of the same code. Use this when the span is already known (from a scan);
 * use `anchorValue` when only the value is known and must be located.
 */
export function makeProvenance(text: string, field: string, span: Span): FieldProvenance {
  const safe = makeSpan(text, span.start, span.end);
  return {
    field,
    value: text.slice(safe.start, safe.end),
    span: safe,
    snippet: snippetAround(text, safe),
  };
}

/** The falsifiable check: the source text at the span must equal the recorded value. */
export function verifyAnchor(text: string, p: FieldProvenance): boolean {
  if (p.span.start < 0 || p.span.end > text.length || p.span.start > p.span.end) return false;
  return text.slice(p.span.start, p.span.end) === p.value;
}

/** Verify every provenance entry against the source. Returns the failing entries. */
export function findBrokenAnchors(text: string, ps: readonly FieldProvenance[]): FieldProvenance[] {
  return ps.filter((p) => !verifyAnchor(text, p));
}
