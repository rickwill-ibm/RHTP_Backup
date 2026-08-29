/**
 * E6 / E9 — exclusion + procedure-applicability encoders (RHTP Policy Engine, encoding layer).
 *
 * E6: negation/experimental headings are matched by STEM (after E0 repair) — "investigation*",
 * "experiment*", "not…medically necessary". Any list under such a heading inherits `exclusion`
 * polarity and can NEVER become an inclusion requirement (spec §1.4, F2). The cross-criteria
 * exclusion ("not MN unless II or III met") becomes the FAIL-CLOSED default, not a parsed sentence
 * (spec §1.1, F14).
 * E9: procedures are keyed by (code, contextQualifier); `experimental` is preserved as a distinct
 * `basis`, not flattened to not-covered (spec F5/F6). A role-precedence lattice makes E6/E9 order
 * immaterial (spec F12).
 *
 * Design authority: docs/policy-encoder-spec.md §4 (E6/E9), §1.
 */
import type { CoverageBasis, CoverageCode, ProcedureRule } from './ir';

/** True when a heading/sentence carries a negation or experimental cue (stem/fuzzy, post-E0). */
export function isNegationHeading(text: string): boolean {
  const t = text.toLowerCase();
  return (
    /not\s+(?:considered\s+)?medically\s+necessary/.test(t) ||
    /investigation/.test(t) || // investigational / investigation*
    /experiment/.test(t) ||
    /\bunproven\b/.test(t) ||
    /not\s+covered/.test(t)
  );
}

/** Classify the coverage basis implied by a negation heading. */
export function classifyBasis(text: string): CoverageBasis {
  const t = text.toLowerCase();
  if (/investigation|experiment|unproven/.test(t)) return 'experimental-investigational';
  if (/benefit exclusion|contract exclusion|excluded (?:under|from) the (?:plan|contract)/.test(t))
    return 'benefit-exclusion';
  if (/unless|not met|criteria .* not/.test(t)) return 'criteria-not-met';
  return 'criteria-not-met';
}

/** The role-precedence lattice: earlier dominates when E6/E9 disagree on a procedure. */
export const ROLE_PRECEDENCE: string[] = [
  'conditional',
  'benefit-exclusion',
  'experimental-investigational',
  'criteria-not-met',
];

/** Choose the dominant of two (coverageCode, basis) writes for the same procedure. */
export function dominantRole(
  a: { coverageCode: CoverageCode; basis?: CoverageBasis },
  b: { coverageCode: CoverageCode; basis?: CoverageBasis }
): { coverageCode: CoverageCode; basis?: CoverageBasis } {
  const rank = (x: { coverageCode: CoverageCode; basis?: CoverageBasis }): number => {
    if (x.coverageCode === 'conditional') return 0;
    const key = x.basis ?? 'criteria-not-met';
    const idx = ROLE_PRECEDENCE.indexOf(key);
    return idx === -1 ? ROLE_PRECEDENCE.length : idx;
  };
  return rank(a) <= rank(b) ? a : b;
}

export interface ProcedureInput {
  code: string;
  system?: ProcedureRule['system'];
  display?: string;
  sourceText: string;
  sourceStart: number;
  sourceEnd: number;
  contextQualifier?: string;
}

/** Build a not-covered/experimental ProcedureRule from a statement under a negation heading. */
export function buildExcludedProcedure(input: ProcedureInput, headingText: string): ProcedureRule {
  const basis = classifyBasis(headingText + ' ' + input.sourceText);
  const rule: ProcedureRule = {
    code: input.code,
    system: input.system ?? 'CPT',
    coverageCode: 'not-covered',
    basis,
    sourceText: input.sourceText,
    sourceSpan: { start: input.sourceStart, end: input.sourceEnd },
  };
  if (input.contextQualifier) rule.contextQualifier = input.contextQualifier;
  return rule;
}

/** Build a covered/conditional ProcedureRule for a listed medically-necessary procedure. */
export function buildCoveredProcedure(
  input: ProcedureInput,
  opts: { conditional?: boolean } = {}
): ProcedureRule {
  const rule: ProcedureRule = {
    code: input.code,
    system: input.system ?? 'CPT',
    coverageCode: opts.conditional ? 'conditional' : 'covered',
    sourceText: input.sourceText,
    sourceSpan: { start: input.sourceStart, end: input.sourceEnd },
  };
  if (opts.conditional) rule.basis = 'conditional-on-criteria';
  if (input.contextQualifier) rule.contextQualifier = input.contextQualifier;
  return rule;
}
