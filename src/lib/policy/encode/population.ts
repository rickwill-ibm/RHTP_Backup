/**
 * E2 / E7 — population + special-population encoders (RHTP Policy Engine, encoding layer).
 *
 * E2: age gate + adolescent pathway. The adolescent branch is its OWN pathway (never a threshold
 * modifier); where a document handles under-18 only by escalation ("contact a Medical Director"),
 * that is a `manual-review` pathway with no synthesized criteria (spec §1.8, F10/F12).
 * E7: special-population threshold variants (Asian-ancestry ±2.5) are applied ATOMICALLY across all
 * affected thresholds and are ALWAYS attested — never CQL-derived from the US Core race extension
 * (spec §1.6, F9).
 *
 * Design authority: docs/policy-encoder-spec.md §4 (E2/E7), §1.
 */
import type { PopulationPredicate, ThresholdVariant } from './ir';

/** Detect an escalation-only handling ("contact a Medical Director" / "separately reviewed"). */
export function isManualReview(text: string): boolean {
  return /request further consideration|contact(?:ing)? (?:a )?medical director|will be separately reviewed|reviewed by a medical director/i.test(
    text
  );
}

/** Detect the stated maturity construct for an adolescent/under-18 clause. */
export function detectMaturityConstruct(
  text: string
): PopulationPredicate['definition'] | undefined {
  if (/bone(?:\s|-)?(?:age|growth)|completed bone growth/i.test(text))
    return { kind: 'bone-age', sourceText: text.trim() };
  if (/skeletal (?:growth|maturity)|full skeletal/i.test(text))
    return { kind: 'skeletal-growth', sourceText: text.trim() };
  if (/under 18|younger than 18|less than 18 years|adolescen|pediatric/i.test(text))
    return { kind: 'chronological-age', sourceText: text.trim() };
  return undefined;
}

/** Build an adolescent population predicate from a clause, encoding the STATED construct verbatim. */
export function adolescentPopulation(text: string): PopulationPredicate {
  const def = detectMaturityConstruct(text);
  const pred: PopulationPredicate = {
    concept: 'adolescent',
    sourceText: text.trim(),
    derivation: 'asked',
  };
  if (def) pred.definition = def;
  return pred;
}

/**
 * Parse a special-population threshold variant, e.g. "(or ≥ 37.5 for Asian ancestry)" alongside
 * "(or ≥ 32.5 Asian)". Collects ALL substitutions so they apply atomically. Returns null if none.
 */
export function parseThresholdVariant(text: string, field = 'bmi'): ThresholdVariant | null {
  if (!/asian/i.test(text)) return null;
  const subs: { field: string; value: number; value2?: number }[] = [];
  const re =
    /(?:or\s*)?(?:≥|>=|greater than or equal to)?\s*(\d+(?:\.\d+)?)\s*(?:kg\/m²|kg\/m2)?\s*(?:for\s*)?(?:persons of\s*)?asian(?:\s*ancestry|\s*americans)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    subs.push({ field, value: parseFloat(m[1]) });
  }
  if (!subs.length) return null;
  return {
    population: {
      concept: 'asian-ancestry',
      sourceText: text.trim(),
      derivation: 'asked', // NEVER derived from US Core race
    },
    substitutions: subs,
    derivation: 'asked',
  };
}

/** Detect a diabetes-gated pathway population ("For members with diabetes and BMI > 30"). */
export function diabetesPopulation(text: string): PopulationPredicate | null {
  if (!/diabet/i.test(text)) return null;
  return {
    concept: 'diabetic',
    sourceText: text.trim(),
    derivation: 'asked',
    definition: { kind: 'condition', sourceText: text.trim() },
  };
}
