/**
 * Criteria list-structure parser — the marker-classification + nesting logic that turns a scoped run
 * of medical-necessity lines into nested {@link CriteriaGroup}s. Split out of `criteria.ts` so the
 * extractor orchestrator stays under the size cap; behavior is unchanged. Deterministic, payer-agnostic
 * — it recognizes enumeration STYLE (roman/letter/number), never any tenant's wording.
 */
import type { Line, CriteriaGroup, CriterionNode } from './criteria';

const CONNECTOR_RE = /^(and|or)$/i;

/** A line that OPENS a medical-necessity determination ("… following …:" with a necessity/following
 *  cue). Shared by the region opener and the continuation-boundary lookahead. Payer-agnostic. */
function isGroupStartLine(t: string): boolean {
  return /following.*:?\s*$/i.test(t) && /necessary|following/i.test(t);
}

/** The next meaningful (non-blank, non-connector) line's trimmed text after index `from`, or null. */
function nextMeaningful(lines: Line[], from: number): string | null {
  for (let k = from + 1; k < lines.length; k += 1) {
    const s = lines[k].text.trim();
    if (s.length === 0 || CONNECTOR_RE.test(s)) continue;
    return s;
  }
  return null;
}

export function logicOf(s: string): 'all' | 'any' | null {
  if (/all of the following/i.test(s)) return 'all';
  if (/one of the following|either of the following|any of the following/i.test(s)) return 'any';
  return null;
}

/**
 * A list marker at the head of a line: a lettered (A. / a.), numbered (1.), or roman-numeral (I. / II.)
 * item. Payer-agnostic — the enumeration STYLE, not any tenant's wording.
 */
type MarkerClass = 'ROMAN' | 'UPPER' | 'LOWER' | 'NUMBER';
interface Marker {
  cls: MarkerClass;
  label: string;
  text: string;
}

const MARKER_RE = /^([A-Za-z]+|\d{1,2})[.)]\s+(.*)$/;
const ROMAN_SET = new Set([
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XI',
  'XII',
  'XIII',
  'XIV',
  'XV',
]);

/**
 * Classify a line's leading marker. `isFirst` disambiguates a lone "I": as the FIRST marker of a region
 * it opens a roman sequence (I, II, …); anywhere else a single uppercase letter is an ordinary A/B/C
 * label. Multi-letter uppercase tokens are markers only when they are roman numerals (so a stray
 * "NOTE." is treated as prose, not a label).
 */
function markerOf(t: string, isFirst: boolean): Marker | null {
  const m = MARKER_RE.exec(t);
  if (!m) return null;
  const tok = m[1];
  const text = m[2].trim();
  if (/^\d{1,2}$/.test(tok)) return { cls: 'NUMBER', label: tok, text };
  if (/^[a-z]$/.test(tok)) return { cls: 'LOWER', label: tok, text };
  if (/^[A-Z]$/.test(tok)) {
    if (tok === 'I' && isFirst) return { cls: 'ROMAN', label: tok, text };
    return { cls: 'UPPER', label: tok, text };
  }
  if (ROMAN_SET.has(tok)) return { cls: 'ROMAN', label: tok, text };
  return null; // a multi-letter uppercase word (e.g. "NOTE.") is not a list marker
}

/**
 * Parse a run of criteria lines (already scoped to one MN region) into groups.
 *
 * Nesting is inferred from the ORDER in which marker STYLES first appear, not from a fixed
 * letter→number→letter ladder. The first style seen in a group is depth 0; each new style nests one
 * level deeper than the current stack. This generalizes across payer conventions — A/B/C→1/2/3→a/b/c
 * (letters first) and I/II→A/B→1/2 (roman first) both parse correctly — and top-level numbered
 * criteria (1./2./3.) are no longer dropped.
 */
export function parseCriteria(lines: Line[]): CriteriaGroup[] {
  const groups: CriteriaGroup[] = [];
  let group: CriteriaGroup | null = null;
  let classDepth = new Map<MarkerClass, number>();
  let stack: CriterionNode[] = [];
  let firstMarkerSeen = false;

  const startGroup = (heading: string): CriteriaGroup => {
    const g: CriteriaGroup = { heading: heading.trim(), logic: logicOf(heading), criteria: [] };
    groups.push(g);
    classDepth = new Map();
    stack = [];
    firstMarkerSeen = false;
    return g;
  };

  for (let li = 0; li < lines.length; li += 1) {
    const line = lines[li];
    const t = line.text.trim();
    if (t.length === 0 || CONNECTOR_RE.test(t)) continue;

    const marker = markerOf(t, !firstMarkerSeen);

    // A "…following:" intro (not itself a marker) starts a group.
    if (!marker && isGroupStartLine(t)) {
      group = startGroup(t);
      continue;
    }
    if (!group) {
      group = startGroup(t.endsWith(':') ? t : 'Medically necessary when the following are met:');
    }

    if (!marker) {
      // A footnote line (*, †, ‡, §) is a policy note, never criterion text — don't fold it.
      if (/^[*†‡§]\s/.test(t)) continue;
      // A SHORT standalone heading that introduces the NEXT determination (e.g. "Reoperation" right
      // before "… is considered medically necessary …") is a section label, not continuation of the
      // previous criterion — skip it so it never bleeds onto the last item. Guarded tightly (≤40 chars,
      // ≤3 words, title-case, no sentence-ending punctuation, and the next line opens a determination)
      // so a genuinely wrapped criterion fragment is never dropped.
      const looksLikeHeading =
        t.length <= 40 && /^[A-Z]/.test(t) && !/[.,:;]$/.test(t) && t.split(/\s+/).length <= 3;
      const next = nextMeaningful(lines, li);
      if (looksLikeHeading && next !== null && isGroupStartLine(next)) continue;
      // Continuation line — fold into the deepest open criterion.
      const top = stack[stack.length - 1];
      if (top) top.text = `${top.text} ${t}`.trim();
      continue;
    }

    firstMarkerSeen = true;
    let depth = classDepth.get(marker.cls);
    if (depth === undefined) {
      depth = stack.length; // a new marker style nests below the current open item
      classDepth.set(marker.cls, depth);
    }
    stack.length = depth; // pop back to this level
    // Anchor the criterion to where its text begins in the source (falsifiable span).
    const rel = line.text.indexOf(marker.text);
    const span =
      rel >= 0
        ? { start: line.start + rel, end: line.start + rel + marker.text.length }
        : undefined;
    const node: CriterionNode = { label: marker.label, text: marker.text, children: [], span };
    if (depth === 0) group.criteria.push(node);
    else stack[depth - 1].children.push(node);
    stack[depth] = node;
  }
  return groups;
}
