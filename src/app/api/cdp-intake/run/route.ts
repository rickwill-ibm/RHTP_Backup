// src/app/api/cdp-intake/run/route.ts — population data-load run (net-new, deletable).
//
// POST runs the demo source folder (the seeded population's source data) through the
// REAL pipeline — EMPI identity resolution, the semantic/terminology gate, projection
// into the shared graph — and returns aggregate load telemetry (members resolved,
// resources admitted per domain, quarantine, per-source outcomes). The CDP Assembly
// screen's "Run live" mode polls/reads this instead of the scripted cascade.
//
// This is the BFF: the engine runs server-side, the browser only sees PHI-safe counts.

import { NextResponse, type NextRequest } from 'next/server';
import { join } from 'node:path';
import { runPopulationLoad } from '@/lib/cdp-intake/wiring';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEMO_DIR = join(process.cwd(), 'src', 'lib', 'cdp-intake', 'sample-sources');

export async function POST(_req: NextRequest): Promise<NextResponse> {
  try {
    const result = await runPopulationLoad(DEMO_DIR);
    return NextResponse.json({
      ok: true,
      receipt: result.receipt,
      totals: result.totals,
      outcomes: result.outcomes.map((o) => ({
        sourceSystem: o.sourceSystem,
        file: o.file,
        memberId: o.memberId,
        held: o.held,
        loaded: o.loaded,
        quarantined: o.quarantined,
        byDomain: o.byDomain,
      })),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
