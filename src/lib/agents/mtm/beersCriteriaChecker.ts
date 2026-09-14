/**
 * Beers Criteria Checker (AGS 2023).
 *
 * Checks whether the proposed new drug appears on the Beers Criteria list of
 * potentially inappropriate medications (PIMs) in older adults (≥65 years).
 *
 * Data source: src/lib/agents/mtm/data/beers-criteria.json
 * Reference  : American Geriatrics Society 2023 Updated AGS Beers Criteria®
 *
 * INVARIANT: only fires when patientAgeYears >= 65. Silently skips for younger
 *            patients and when the drug is not found in the criteria table.
 */
import type { DrugLookupResult, MtmFinding } from './types';
import beersList from './data/beers-criteria.json';

interface BeersCriteriaEntry {
  rxcui: string;
  name: string;
  category: string;
  rationale: string;
  recommendation: string;
}

const BEERS_INDEX = new Map<string, BeersCriteriaEntry>(
  (beersList as BeersCriteriaEntry[]).map((e) => [e.rxcui, e])
);

const MINIMUM_AGE_YEARS = 65;

/**
 * Check whether the proposed drug is a Beers Criteria PIM for the patient's age.
 *
 * @param newDrug         - Proposed new drug
 * @param patientAgeYears - Patient age in years
 * @returns Array of MtmFinding (0 or 1 items)
 */
export function checkBeersCriteria(
  newDrug: DrugLookupResult,
  patientAgeYears: number
): MtmFinding[] {
  if (patientAgeYears < MINIMUM_AGE_YEARS) return [];

  const entry = BEERS_INDEX.get(newDrug.rxcui);
  if (!entry) return [];

  return [
    {
      type: 'beers-criteria',
      severity: 'moderate',
      headline: `Beers Criteria: ${entry.name} (${entry.category})`,
      detail: `${entry.rationale} ${entry.recommendation}`,
      requiresAcknowledgement: true,
      hardBlock: false,
    },
  ];
}
