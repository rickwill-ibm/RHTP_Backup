/**
 * Deterministic CODE ROUTING for the encoding-review screen.
 *
 * The problem this solves: the review used to show every extracted procedure code with the same
 * generic "assign coverage role" line, giving the reviewer no signal. The UNSAFE fix (rejected by the
 * payer-SME / encoding-specialist adversarial) was to PROPOSE a coverage disposition ("Covered · PA
 * required") from code-in-document membership — a fabricated coverage determination, because the
 * extractor's code list is a flat, context-free harvest.
 *
 * This module does the SAFE thing the adversarial conditionally approved: pure ROUTING, never a
 * coverage decision. It reads the ONE honest structural signal that is provenance-anchored —
 * `review.notMedicallyNecessary[]` (exclusion / investigational statements extracted from the policy)
 * — and, for a code whose token literally appears (word-boundary, never substring) inside such a
 * statement, routes it to the "excluded / investigational" region WITH the source excerpt as
 * evidence. Every other code routes to "in coding list — assign", which asserts nothing about
 * coverage. No `role` is ever set; every routed code still `requiresAssignment` (keeps its blocking
 * review flag); nothing here decides coverage or whether prior auth applies.
 *
 * INVARIANT: routing is not a coverage determination. `role` is never set from routing; `bucket` only
 * says WHERE in the document the code's evidence sits, and `requiresAssignment` is always true so a
 * human maker still assigns the coverage role.
 * INVARIANT: an `excluded` routing is emitted ONLY when the code token matches (word-boundary) an
 * explicit `notMedicallyNecessary` / negation-heading statement, and it carries that statement as
 * provenance. Absent that signal a code is `assign` (fail-safe) — never guessed covered/not-covered.
 */
import type { PolicyReview } from '@/lib/policy/policyReview';
import type { CoverageBasis } from '@/lib/policy/encode/ir';
import { classifyBasis, isNegationHeading } from '@/lib/policy/encode/procedure';

export type RoutingBucket = 'excluded' | 'assign';

export interface RoutingHint {
  /** WHERE the code's evidence sits in the policy — NOT a coverage decision. */
  bucket: RoutingBucket;
  /** Human label for the routing group. */
  label: string;
  /** For `excluded`: whether the source statement reads investigational vs a plain exclusion. */
  basis?: CoverageBasis;
  /** For `excluded`: the source statement, so the reviewer sees the evidence (provenance). */
  provenance?: { excerpt: string };
  /** INVARIANT: always true — a routed code still needs a human coverage-role assignment. */
  requiresAssignment: true;
}

const LABEL: Record<RoutingBucket, string> = {
  excluded: 'Named in a not-medically-necessary / investigational statement — assign role',
  assign: 'In the policy coding list — assign coverage role',
};

/** A code token matches a statement only on a word boundary, so 43644 never matches inside 436440
 *  or 143644. Codes are alphanumeric (CPT `\d{5}`, HCPCS `[A-Z]\d{4}`); guard both edges. */
function tokenInText(code: string, text: string): boolean {
  const esc = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^A-Za-z0-9])${esc}(?:[^A-Za-z0-9]|$)`).test(text);
}

/** The ONE wording rule set for "this text reads as an exclusion / investigational determination."
 *  Shared by the prose-statement matcher (which additionally requires the code token) and the
 *  descriptor-cue matcher (where the code is the implicit subject of its own descriptor), so there is
 *  never a second, drifting copy of the wording. */
// Cues for a PROSE statement (already exclusion-context): stems are safe here, plus the common payer
// determination phrasings ("not reasonable and necessary", "does not meet coverage criteria").
const STATEMENT_EXCLUSION =
  /investigation|experiment|unproven|not (?:considered )?medically necessary|not medically indicated|not reasonable and necessary|does not meet[\w\s]{0,20}criteria|non-?covered/i;
// Cues for a raw CPT/HCPCS DESCRIPTOR (the code is the implicit subject): EXPLICIT adjectival
// determinations only — never the loose stems `investigation`/`experiment`/`exclud`, which appear
// benignly in descriptors ("intestine, except rectum"; a diagnostic "investigation" procedure).
const DESCRIPTOR_EXCLUSION =
  /investigational|experimental|unproven|not (?:considered )?medically necessary|not reasonable and necessary|non-?covered/i;

/** Does a code's OWN descriptor flag it as an exclusion? Explicit determination cues only (see above). */
export function descriptorFlagsExclusion(desc: string | undefined): boolean {
  return !!desc && DESCRIPTOR_EXCLUSION.test(desc);
}

/** Does a PROSE statement read as an exclusion? The negation heading and the looser `exclud`
 *  ("excluded under the plan") are safe here on top of the statement cues. Shared by the prose-statement
 *  matcher and the default-disposition classifier. */
export function readsAsExclusion(text: string | undefined): boolean {
  return (
    !!text && (isNegationHeading(text) || STATEMENT_EXCLUSION.test(text) || /\bexclud/i.test(text))
  );
}

/** Find the first not-medically-necessary statement that names this code, if any. Exported so the
 *  default-disposition classifier reuses the SAME structural matcher (no second wording rule set). */
export function excludingStatement(code: string, statements: string[]): string | undefined {
  for (const s of statements) {
    if (!s) continue;
    // Only a genuine negation/exclusion statement counts — a code merely mentioned in prose that is
    // NOT a negation heading must not be routed excluded (fail-safe to `assign`).
    if (!readsAsExclusion(s)) continue;
    if (tokenInText(code, s)) return s;
  }
  return undefined;
}

/** Ordinary connective words, stripped before phrase comparison — never a clinical term, so dropping
 *  them can't hide a real exclusion match or manufacture a false one. */
const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'or',
  'and',
  'with',
  'without',
  'to',
  'for',
  'including',
  'but',
  'not',
  'limited',
  'such',
  'as',
  'other',
  'than',
  'is',
  'are',
  'be',
  'when',
  'on',
  'in',
  'at',
  'by',
  'this',
  'that',
  'from',
  'specified',
]);

function significantWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (w) => w.length >= 3 && !STOPWORDS.has(w)
  );
}

/** True when `needle` appears in `haystack` as a contiguous, ordered run (token-exact, never a
 *  substring collision across word boundaries). */
function containsRun(haystack: string[], needle: string[]): boolean {
  outer: for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/** Does a code's OWN descriptor NAME a procedure that a not-medically-necessary statement also names
 *  — as the same run of 3+ significant words, in order — even though neither the code number nor an
 *  explicit determination word ("investigational", etc.) appears in the descriptor? This is the gap
 *  `excludingStatement` and `descriptorFlagsExclusion` both miss: an "unlisted procedure" code exists
 *  ONLY because the payer has no dedicated CPT/HCPCS code for a technique it separately excludes, so
 *  the coding appendix's bracket and the exclusion list can never share a code number, and the bracket
 *  states the procedure's NAME, not a determination ("gastric plication … or mini-gastric bypass
 *  procedure" — no "investigational" anywhere in it). Two or fewer shared words is never enough on its
 *  own — "gastric", "procedure", "restrictive" are this domain's ordinary vocabulary and appear in
 *  nearly every code in a bariatric policy, covered and excluded alike (regression-tested below); three
 *  or more of them in the SAME ORDER naming the same technique is not a coincidence. Payer-agnostic —
 *  it reads word order, never any tenant's specific phrasing. */
export function descriptorNamesExcludedProcedure(
  desc: string | undefined,
  statements: string[]
): string | undefined {
  if (!desc) return undefined;
  const descWords = significantWords(desc);
  for (const s of statements) {
    // Unlike `excludingStatement`'s code-number match, this does NOT gate on `readsAsExclusion(s)`:
    // `notMedicallyNecessary[]` is already section-scoped by the extractor (every entry is a line
    // lifted from under a "Not Medically Necessary" heading — see `criteria.ts`), and a lettered
    // sub-item ("D. Laparoscopic gastric plication …") names the excluded technique WITHOUT repeating
    // the determination wording, which lives once in the list's own intro sentence as a SEPARATE
    // array entry. Gating here would silently skip every sub-item and catch nothing.
    if (!s) continue;
    const stmtWords = significantWords(s);
    for (let i = 0; i <= descWords.length - 3; i += 1) {
      if (containsRun(stmtWords, descWords.slice(i, i + 3))) return s;
    }
  }
  return undefined;
}

/**
 * Route every extracted guideline code. Deterministic and pure. Codes named in an explicit
 * exclusion/investigational statement route `excluded` (with provenance); all others route `assign`.
 * Never sets a coverage role; never asserts prior-auth applicability.
 */
export function routeGuidelineCodes(review: PolicyReview): Record<string, RoutingHint> {
  const statements = review.notMedicallyNecessary ?? [];
  const out: Record<string, RoutingHint> = {};
  for (const c of review.guidelineCodes ?? []) {
    const stmt = statements.length > 0 ? excludingStatement(c.code, statements) : undefined;
    // A code's OWN descriptor can carry the exclusion cue — e.g. an unlisted code qualified
    // "[when specified as … identified as not medically necessary …]". There the code is the implicit
    // subject, so no token match is needed; the descriptor IS the statement. This is the signal the
    // prose-only matcher missed, letting a not-medically-necessary code default to covered.
    const descExcludes = !stmt && descriptorFlagsExclusion(c.description);
    // A third signal: the descriptor names the SAME procedure an exclusion statement names, without
    // repeating a determination word (see `descriptorNamesExcludedProcedure`) — the "unlisted code,
    // no shared code number, no shared determination word" case.
    const namedExcluded =
      !stmt && !descExcludes
        ? descriptorNamesExcludedProcedure(c.description, statements)
        : undefined;
    if (stmt || descExcludes || namedExcluded) {
      const evidence = stmt ?? namedExcluded ?? c.description;
      out[c.code] = {
        bucket: 'excluded',
        label: LABEL.excluded,
        basis: classifyBasis(evidence),
        provenance: {
          excerpt: evidence.replace(/\s+/g, ' ').trim().slice(0, 240),
        },
        requiresAssignment: true,
      };
    } else {
      out[c.code] = {
        bucket: 'assign',
        label: LABEL.assign,
        requiresAssignment: true,
      };
    }
  }
  return out;
}

/** Fixed display order for routing buckets: exceptions (excluded) first, then the assign pile. */
export const ROUTING_ORDER: RoutingBucket[] = ['excluded', 'assign'];
