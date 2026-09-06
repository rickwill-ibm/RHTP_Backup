// src/app/api/cdp-intake/inspect/route.ts — dry-run preview (net-new, deletable).
//
// Read-only: classifies the bundled sample source folder and returns the PHI-safe
// receipt + routing plan (which door each file would take) WITHOUT ingesting. This is
// the entry point that wires the cdp-intake tree; the real run route + live telemetry
// land in increment 2. Synthetic sample data only — no auth surface, no PHI.

import { NextResponse, type NextRequest } from 'next/server';
import { join } from 'node:path';
import { planIntake } from '@/lib/cdp-intake';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAMPLE_DIR = join(process.cwd(), 'src', 'lib', 'cdp-intake', 'sample-sources');

export async function GET(_req: NextRequest): Promise<NextResponse> {
  if (process.env.CDP_INTAKE_LIVE !== '1') {
    return NextResponse.json(
      { ok: false, error: 'cdp-intake disabled (set CDP_INTAKE_LIVE=1)' },
      { status: 404 }
    );
  }
  try {
    const { receipt, plan } = planIntake(SAMPLE_DIR, { receivedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true, receipt, plan });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
