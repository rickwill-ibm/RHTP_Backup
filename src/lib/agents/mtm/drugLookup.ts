/**
 * Drug Lookup — client-side helper.
 *
 * Calls the BFF route /api/mtm/drug-lookup; never calls external APIs directly.
 * The BFF enforces the no-key-in-browser invariant.
 *
 * CONTRACT: all network calls go through /api/* — never rxnav.nlm.nih.gov directly.
 */
import type { DrugLookupResult } from './types';

interface DrugLookupResponse {
  results: DrugLookupResult[];
  error?: string;
}

/**
 * Typeahead search — returns up to 8 drug results for the given search term.
 * Returns empty array on network error (caller shows no suggestions).
 */
export async function searchDrugs(term: string): Promise<DrugLookupResult[]> {
  const trimmed = term.trim();
  if (trimmed.length < 2) return [];

  try {
    const res = await fetch('/api/mtm/drug-lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ term: trimmed }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as DrugLookupResponse;
    return data.results ?? [];
  } catch {
    return [];
  }
}

/**
 * Fetch NDC codes for a given RxCUI via BFF.
 * Returns empty array on error.
 */
export async function fetchNdcForRxcui(rxcui: string): Promise<string[]> {
  if (!rxcui.trim()) return [];

  try {
    const res = await fetch('/api/mtm/ndc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rxcui }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { ndcList: string[] };
    return data.ndcList ?? [];
  } catch {
    return [];
  }
}
