/**
 * BFF Route — POST /api/mtm/drug-lookup
 *
 * Receives: { term: string }
 * Returns:  { results: DrugLookupResult[] }
 *
 * Calls NLM RxNorm REST API (free, no API key required):
 *   1. /REST/drugs?name={term}    — search by name
 *   2. /REST/rxcui/{id}/related   — brand→generic resolution
 *   3. /REST/rxclass/...          — ATC class fallback
 *
 * SAFETY: Multi-drug pack concepts (BPCK/GPCK) are excluded — a single
 * MedicationRequest represents one drug, not a combination pack.
 * Pack names like "{4 (amoxicillin 500 MG Oral Capsule) / 2 (...)}" are
 * stripped to extract the primary ingredient for class resolution.
 *
 * INVARIANT: No PHI or API keys stored. All external calls server-side only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { parseRxNormDrugs, parseRxNormRelated } from '@/lib/agents/mtm/schema';
import type { DrugLookupResult } from '@/lib/agents/mtm/types';
import { lookupDrugClass, extractIngredient } from '@/lib/agents/mtm/drugClassTable';

const RXNORM_BASE = 'https://rxnav.nlm.nih.gov/REST';
const RXCLASS_BASE = 'https://rxnav.nlm.nih.gov/REST/rxclass';
const MAX_RESULTS = 8;

// TTY codes to EXCLUDE — multi-drug packs are never a single MedicationRequest
const EXCLUDED_TTY = new Set(['BPCK', 'GPCK']);
// TTY codes to PREFER — single-ingredient clinical drugs and branded drugs
const PREFERRED_TTY = new Set(['SCD', 'SBD', 'SCDG']);

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    next: { revalidate: 3600 },
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`RxNorm ${res.status}: ${url}`);
  return res.json();
}

/**
 * Resolve ATC class for a given RxCUI via RxClass API.
 * Returns the first ATC Level-4 code found, or null on failure.
 */
async function resolveAtcClass(rxcui: string): Promise<string | null> {
  try {
    const url = `${RXCLASS_BASE}/class/byRxcui.json?rxcui=${encodeURIComponent(rxcui)}&relaSource=ATC`;
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (typeof data !== 'object' || data === null) return null;
    const root = data as Record<string, unknown>;
    const rxclassDrugInfoList = root['rxclassDrugInfoList'] as Record<string, unknown> | undefined;
    const infoList = rxclassDrugInfoList?.['rxclassDrugInfo'];
    if (!Array.isArray(infoList)) return null;
    for (const item of infoList) {
      if (typeof item !== 'object' || item === null) continue;
      const info = item as Record<string, unknown>;
      const classInfo = info['rxclassMinConceptItem'] as Record<string, unknown> | undefined;
      const classId = classInfo?.['classId'];
      if (typeof classId === 'string' && classId.length >= 5) {
        return classId.slice(0, 5).toUpperCase();
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Resolve generic name + RxCUI for a brand RxCUI. */
async function resolveGeneric(rxcui: string): Promise<{ rxcui: string; name: string } | null> {
  try {
    const raw = await fetchJson(`${RXNORM_BASE}/rxcui/${rxcui}/related?tty=SCD`);
    const parsed = parseRxNormRelated(raw);
    if (!parsed) return null;
    for (const g of parsed.relatedGroup.conceptGroup ?? []) {
      const first = g.conceptProperties?.[0];
      if (first) return { rxcui: first.rxcui, name: first.name };
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let term: string;
  try {
    const body = (await req.json()) as { term?: unknown };
    term = typeof body.term === 'string' ? body.term.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (term.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const raw = await fetchJson(`${RXNORM_BASE}/drugs?name=${encodeURIComponent(term)}`);
    const parsed = parseRxNormDrugs(raw);
    if (!parsed) return NextResponse.json({ results: [] });

    // Sort: preferred TTYs first, then others; exclude multi-drug packs entirely
    const allConcepts =
      parsed.drugGroup.conceptGroup?.flatMap((g) =>
        (g.conceptProperties ?? []).map((c) => ({ ...c, tty: g.tty }))
      ) ?? [];

    const preferred = allConcepts.filter(
      (c) => PREFERRED_TTY.has(c.tty) && !EXCLUDED_TTY.has(c.tty)
    );
    const others = allConcepts.filter((c) => !PREFERRED_TTY.has(c.tty) && !EXCLUDED_TTY.has(c.tty));
    const concepts = [...preferred, ...others];

    const seen = new Set<string>();
    const results: DrugLookupResult[] = [];

    for (const c of concepts) {
      if (seen.has(c.rxcui) || results.length >= MAX_RESULTS) break;
      seen.add(c.rxcui);

      // Extract primary ingredient name from pack-style names
      const ingredientName = extractIngredient(c.name);

      const isBrand = c.tty === 'BN' || c.tty === 'SBD';
      let genericName: string | undefined;
      let genericRxcui = c.rxcui;

      if (isBrand) {
        const generic = await resolveGeneric(c.rxcui);
        if (generic) {
          genericName = generic.name;
          genericRxcui = generic.rxcui;
        }
      }

      const canonicalName = isBrand ? (genericName ?? ingredientName) : ingredientName;

      // Resolve pharmacological class — table first (deterministic), RxClass API fallback
      // Try both the compound RxCUI and the extracted ingredient name
      const classInfo =
        lookupDrugClass(genericRxcui, canonicalName) ??
        lookupDrugClass(genericRxcui, ingredientName);
      let atcLevel4 = classInfo?.atcLevel4;
      if (!atcLevel4) atcLevel4 = (await resolveAtcClass(genericRxcui)) ?? undefined;

      results.push({
        rxcui: genericRxcui,
        name: canonicalName,
        isGeneric: !isBrand,
        brandName: isBrand ? c.name : undefined,
        genericName: isBrand ? genericName : undefined,
        suggestedSig: '',
        ndcList: [],
        atcLevel4,
        allergyClasses: classInfo?.allergyClasses ?? [],
      });
    }

    return NextResponse.json({ results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, results: [] }, { status: 502 });
  }
}
