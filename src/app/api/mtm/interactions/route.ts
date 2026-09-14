/**
 * BFF Route — POST /api/mtm/interactions
 *
 * Receives: { rxcuis: string[] }
 * Returns:  { interactions: DrugInteraction[] }
 *
 * Calls RxNav Drug Interaction API (NLM, free, no API key):
 *   GET https://rxnav.nlm.nih.gov/REST/interaction/list.json?rxcuis={csv}
 *
 * The API checks all pairwise interactions among the submitted RxCUIs.
 * Pass the patient's current med RxCUIs PLUS the new drug's RxCUI.
 *
 * INVARIANT: No PHI stored. No keys. Server-side only. Errors → empty list (fail-open
 *            for interaction checks; hard failures bubble to UI as 502).
 */
import { NextRequest, NextResponse } from 'next/server';
import { parseRxNavInteraction } from '@/lib/agents/mtm/schema';
import { normaliseInteractions } from '@/lib/agents/mtm/interactionChecker';
import type { DrugInteraction } from '@/lib/agents/mtm/types';

const RXNAV_BASE = 'https://rxnav.nlm.nih.gov/REST/interaction';

export async function POST(req: NextRequest): Promise<NextResponse> {
  let rxcuis: string[];
  try {
    const body = (await req.json()) as { rxcuis?: unknown };
    if (!Array.isArray(body.rxcuis)) {
      return NextResponse.json({ error: 'rxcuis must be an array' }, { status: 400 });
    }
    rxcuis = body.rxcuis
      .filter((r): r is string => typeof r === 'string' && r.trim().length > 0)
      .map((r) => r.trim());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Need at least 2 RxCUIs to check interactions
  if (rxcuis.length < 2) {
    return NextResponse.json({ interactions: [] });
  }

  try {
    const csv = rxcuis.join('+');
    const url = `${RXNAV_BASE}/list.json?rxcuis=${encodeURIComponent(csv)}`;
    const res = await fetch(url, {
      next: { revalidate: 300 }, // 5 min cache — interaction data changes less often
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      // RxNav returns 400 for unknown RxCUIs — treat as no interactions found
      return NextResponse.json({ interactions: [] });
    }

    const raw = await res.json();
    const parsed = parseRxNavInteraction(raw);

    const interactions: DrugInteraction[] = normaliseInteractions(parsed);
    return NextResponse.json({ interactions });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, interactions: [] }, { status: 502 });
  }
}
