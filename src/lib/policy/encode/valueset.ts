/**
 * E4 — value-set / one-of-N encoder (RHTP Policy Engine, encoding layer).
 *
 * "one or more of the following" ⇒ a `choice{min:1}` bound to a value set, gated under its parent
 * branch. "including but not limited to" ⇒ an OPEN set (UI offers Other+specify). A comorbidity set
 * is NEVER `logic:'all'` (spec §1.6, F9). Deny families carry `polarity:'exclusion'` (spec F13).
 *
 * Design authority: docs/policy-encoder-spec.md §4 (E4), §1.
 */
import type { CodedOption, CodedValueSet, EncodedCriterion } from './ir';

/** "one or more of" / "at least one of" ⇒ min 1. "all of the following" ⇒ min = all (n). */
export function detectChoiceMin(headingText: string): number | null {
  const t = headingText.toLowerCase();
  if (/one or more of|at least one of|any (?:one )?of the following|either/.test(t)) return 1;
  if (/all of the following|each of the following/.test(t)) return -1; // sentinel: require all
  return null;
}

/** "including but not limited to" ⇒ open set. */
export function isOpenSet(headingText: string): boolean {
  return /including,?\s*but not limited to|such as|for example|e\.g\./i.test(headingText);
}

export interface OptionInput {
  display: string;
  sourceText: string;
  code?: string;
  system?: string;
  followUp?: EncodedCriterion[];
}

/** Build a value set from an intro heading + its option list. Polarity defaults to inclusion. */
export function buildValueSet(
  id: string,
  concept: string,
  headingText: string,
  options: OptionInput[],
  polarity: 'inclusion' | 'exclusion' = 'inclusion',
  purpose: CodedValueSet['purpose'] = 'eligibility'
): CodedValueSet {
  const opts: CodedOption[] = options.map((o) => {
    const opt: CodedOption = { display: o.display, sourceText: o.sourceText };
    if (o.code) opt.code = o.code;
    if (o.system) opt.system = o.system;
    if (o.followUp && o.followUp.length) opt.followUp = o.followUp;
    return opt;
  });
  return {
    id,
    concept,
    open: isOpenSet(headingText),
    polarity,
    purpose,
    options: opts,
  };
}
