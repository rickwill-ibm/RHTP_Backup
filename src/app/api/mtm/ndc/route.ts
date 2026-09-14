/**
 * BFF Route — POST /api/mtm/ndc
 *
 * Receives: { rxcui: string }
 * Returns:  { ndcList: string[] }
 *
 * Calls FDA openFDA Drug NDC API (free, no API key required):
 *   GET https://api.fda.gov/drug/ndc.json?search=openfda.rxcui:{rxcui}&limit=5
 *
 * INVARIANT: No PHI. No API key. Server-side only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { parseFdaNdcResponse } from '@/lib/agents/mtm/schema';

const FDA_BASE = 'https://api.fda.gov/drug/ndc.json';
const MAX_NDC = 5;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let rxcui: string;
  try {
    const body = (await req.json()) as { rxcui?: unknown };
    rxcui = typeof body.rxcui === 'string' ? body.rxcui.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!rxcui) {
    return NextResponse.json({ ndcList: [] });
  }

  try {
    const url = `${FDA_BASE}?search=openfda.rxcui:${encodeURIComponent(rxcui)}&limit=${MAX_NDC}`;
    const res = await fetch(url, {
      next: { revalidate: 3600 },
      headers: { Accept: 'application/json' },
    });

    // 404 from FDA = no results (not an error)
    if (res.status === 404) {
      return NextResponse.json({ ndcList: [] });
    }
    if (!res.ok) {
      return NextResponse.json({ ndcList: [] }, { status: 502 });
    }

    const raw = await res.json();
    const parsed = parseFdaNdcResponse(raw);

    const ndcList = parsed.results.map((r) => r.product_ndc).slice(0, MAX_NDC);
    return NextResponse.json({ ndcList });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, ndcList: [] }, { status: 502 });
  }
}
