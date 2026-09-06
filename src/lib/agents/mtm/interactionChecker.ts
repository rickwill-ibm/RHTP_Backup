/**
 * Interaction Checker — normalises raw RxNav API interaction data into
 * the domain's DrugInteraction type.
 *
 * This module is BFF-side: it transforms the parsed RxNav schema output
 * (ParsedRxNavInteraction) into the clean DrugInteraction array that the
 * MTM engine consumes.
 *
 * It is also re-exported from index.ts so BFF routes can call normaliseInteractions()
 * and the engine can call normaliseSeverity() independently.
 */
import type { DrugInteraction, MtmSeverity } from './types';
import type { ParsedRxNavInteraction } from './schema';

// DrugInteraction.severity does not include 'info' (interactions are always clinical)
type InteractionSeverity = Exclude<MtmSeverity, 'info'>;

// ── Severity mapping ──────────────────────────────────────────────────────────

const SEVERITY_MAP: Record<string, InteractionSeverity> = {
  contraindicated: 'contraindicated',
  high: 'major',
  major: 'major',
  moderate: 'moderate',
  low: 'minor',
  minor: 'minor',
};

/**
 * Normalise a raw severity string from RxNav into the domain's severity union.
 * Unknown strings default to 'moderate' (conservative fallback).
 */
export function normaliseSeverity(raw: string): InteractionSeverity {
  return SEVERITY_MAP[raw.toLowerCase()] ?? 'moderate';
}

// ── Normaliser ────────────────────────────────────────────────────────────────

/**
 * Transform a parsed RxNav interaction response into DrugInteraction[].
 *
 * @param parsed     - Parsed RxNav interaction response
 * @returns          - Flat list of DrugInteraction (may be empty)
 */
export function normaliseInteractions(parsed: ParsedRxNavInteraction): DrugInteraction[] {
  const findings: DrugInteraction[] = [];

  for (const group of parsed.fullInteractionTypeGroup ?? []) {
    const source = group.sourceName ?? 'Unknown';

    for (const fullType of group.fullInteractionType ?? []) {
      for (const pair of fullType.interactionPair ?? []) {
        const [c1, c2] = pair.interactionConcept;
        findings.push({
          drug1: {
            rxcui: c1.minConceptItem.rxcui,
            name: c1.minConceptItem.name,
          },
          drug2: {
            rxcui: c2.minConceptItem.rxcui,
            name: c2.minConceptItem.name,
          },
          severity: normaliseSeverity(pair.severity ?? 'moderate'),
          description: pair.description ?? '',
          source,
        });
      }
    }
  }

  return findings;
}
