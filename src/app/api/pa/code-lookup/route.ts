/**
 * BFF Route — POST /api/pa/code-lookup
 *
 * Receives: { code: string, system: 'CPT' | 'HCPCS' }
 * Returns:  { display?: string }
 *
 * CPT has no free lookup source here — full CPT long descriptions are AMA-copyrighted
 * and require a licensed data source, so CPT resolution stays local (see
 * `@/lib/pa/procedureCodeLookup`, which checks the seeded terminology table first and
 * never reaches this route for CPT). This route only proxies HCPCS Level II codes to
 * NLM's free public Clinical Table Search Service.
 *
 * CONTRACT: all network calls go through /api/* — never clinicaltables.nlm.nih.gov
 * directly from the browser.
 *
 * INVARIANT: no PHI in the request; a bare procedure code is not patient data.
 */
import { NextRequest, NextResponse } from 'next/server';

const HCPCS_SEARCH_URL = 'https://clinicaltables.nlm.nih.gov/api/hcpcs/v3/search';

/**
 * The NLM Clinical Table Search Service always answers with the same 4-element shape:
 * [totalCount, codes[], extraFieldsObjOrNull, displayStrings[]]. `displayStrings[i]` is
 * either a single string (one default display field) or an array of field values (when
 * multiple display fields are returned) — the exact field id NLM uses for the long
 * description is not pinned here, so this parses defensively rather than assuming one.
 */
function extractDisplay(raw: unknown, code: string): string | undefined {
  if (!Array.isArray(raw) || raw.length < 4) return undefined;
  const codes = raw[1];
  const displays = raw[3];
  if (!Array.isArray(codes) || !Array.isArray(displays)) return undefined;
  const idx = codes.findIndex(
    (c) => typeof c === 'string' && c.toUpperCase() === code.toUpperCase()
  );
  const row = displays[idx >= 0 ? idx : 0];
  if (typeof row === 'string') return row.trim() || undefined;
  if (Array.isArray(row)) {
    // Prefer the longest string field that isn't just the code itself — the description
    // is reliably the longest field in every NLM clinical table response shape.
    const candidates = row.filter(
      (v): v is string => typeof v === 'string' && v.toUpperCase() !== code.toUpperCase()
    );
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0]?.trim() || undefined;
  }
  return undefined;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let code: string;
  let system: string;
  try {
    const body = (await req.json()) as { code?: unknown; system?: unknown };
    code = typeof body.code === 'string' ? body.code.trim() : '';
    system = typeof body.system === 'string' ? body.system.trim().toUpperCase() : '';
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!code || system !== 'HCPCS') {
    // Only HCPCS is proxied here (see file header) — anything else is a no-match, not an error.
    return NextResponse.json({ display: undefined });
  }

  // Bound the user-controlled term before it reaches NLM: a real HCPCS Level II code is short and
  // alphanumeric. Rejecting anything else caps abuse/amplification against our workers and NLM.
  if (!/^[A-Za-z0-9]{1,8}$/.test(code)) {
    return NextResponse.json({ display: undefined });
  }

  try {
    const url = `${HCPCS_SEARCH_URL}?terms=${encodeURIComponent(code)}&sf=code&maxList=1`;
    const res = await fetch(url, {
      next: { revalidate: 86400 },
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(2500), // never let a slow/hung NLM tie up a worker
    });
    if (!res.ok) return NextResponse.json({ display: undefined });
    const raw = (await res.json()) as unknown;
    return NextResponse.json({ display: extractDisplay(raw, code) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, display: undefined }, { status: 502 });
  }
}
