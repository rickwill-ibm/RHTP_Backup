/**
 * DEFAULT coverage disposition per harvested code, inferred from document STRUCTURE (payer-agnostic).
 *
 * The workbench used to arrive at Generate with every code `pending-review`, because the coverage seam
 * refuses to fabricate 'covered'. This module supplies an honest STARTING disposition the human maker
 * confirms or overrides — inferred from WHERE the code sits, never guessed from payer wording:
 *   • named in an explicit not-medically-necessary / investigational statement → not-covered or
 *     investigational (by the statement's basis);
 *   • enumerated in a coverage-determinable section of a medical-necessity guideline — the policy's own
 *     coding table (`coding-appendix`) or its prior-authorization requirements table
 *     (`requirements-table`) → covered·PA;
 *   • a bare inline-prose mention, or an untagged code → pending (undetermined).
 *
 * INVARIANT: `covered-pa` is defaulted ONLY for a code physically enumerated in the policy's own code
 * table — never from a loose prose mention — so this is inferred-from-section carried with provenance
 * (the `sourceSection` tag), not a coverage guess. Defaults are never counted as human decisions for
 * the sign-off gate; the maker still confirms or overrides every coverage-determination code.
 */
import type { GuidelineCode } from '@/lib/policy/extract/criteria';
import { classifyBasis } from '@/lib/policy/encode/procedure';
import { excludingStatement, descriptorFlagsExclusion } from './codeRouting';
import type { CodeDisposition } from '@/lib/policy/crd/coverageDisposition';

export function defaultDispositions(
  codes: GuidelineCode[] | undefined,
  notMedicallyNecessary: string[] | undefined
): Record<string, CodeDisposition> {
  const nmn = notMedicallyNecessary ?? [];
  const out: Record<string, CodeDisposition> = {};
  for (const c of codes ?? []) {
    // The exclusion cue can sit in a separate statement OR in the code's OWN descriptor (an unlisted
    // code qualified "[when specified as … not medically necessary …]"). Either way the honest default
    // is not-covered / investigational — NEVER covered-pa — so the maker starts from the policy's own
    // stance instead of a covered default they must remember to overturn. Same predicate as routing.
    const stmt = nmn.length > 0 ? excludingStatement(c.code, nmn) : undefined;
    const evidence = stmt ?? (descriptorFlagsExclusion(c.description) ? c.description : undefined);
    if (evidence) {
      out[c.code] =
        classifyBasis(evidence) === 'experimental-investigational'
          ? 'investigational'
          : 'not-covered';
      continue;
    }
    out[c.code] =
      c.sourceSection === 'requirements-table' || c.sourceSection === 'coding-appendix'
        ? 'covered-pa'
        : 'pending';
  }
  return out;
}

/** One code the checker must individually spot-check. `overrideFrom` is set when the maker moved a
 *  code the POLICY defaulted off-coverage back ONTO coverage — the highest-risk override, which a
 *  one-directional "denied codes only" check would miss. */
export interface RestrictedCode {
  code: string;
  disposition: CodeDisposition;
  overrideFrom?: CodeDisposition;
}
/** What the maker decided, summarized for the checker's sign-off screen. `restricted` is the set the
 *  checker MUST spot-check before approving — every code the maker took OFF standard coverage
 *  (not-covered / investigational) AND every code the maker pulled ONTO coverage against the policy's
 *  own not-medically-necessary / investigational default. Both directions carry the highest cost when
 *  wrong, so both are surfaced. Pure. */
export interface DispositionSummary {
  total: number;
  counts: Record<CodeDisposition, number>;
  restricted: RestrictedCode[];
}
const isOffCoverage = (d: CodeDisposition | undefined): boolean =>
  d === 'not-covered' || d === 'investigational';
export function summarizeDispositions(
  dispositions: Record<string, CodeDisposition>,
  defaults?: Record<string, CodeDisposition>
): DispositionSummary {
  const counts: Record<CodeDisposition, number> = {
    'covered-pa': 0,
    'not-covered': 0,
    investigational: 0,
    pending: 0,
  };
  const restricted: RestrictedCode[] = [];
  const codes = Object.keys(dispositions).sort();
  for (const code of codes) {
    const d = dispositions[code];
    counts[d] += 1;
    const def = defaults?.[code];
    if (isOffCoverage(d)) {
      restricted.push({ code, disposition: d });
    } else if (isOffCoverage(def)) {
      // Maker overrode the policy's off-coverage default back onto coverage — the checker must see this.
      restricted.push({ code, disposition: d, overrideFrom: def });
    }
  }
  return { total: codes.length, counts, restricted };
}
