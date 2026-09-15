/**
 * BFF: DTR medical-necessity evaluation.
 * POST { patientId, cptCode, procedureName }
 *
 * In dev-mock mode returns a patient-aware scenario (each patient has their
 * own primary PA scenario in devStubs). In live mode forwards to the Policy
 * Engine at POLICY_ENGINE_URL.
 */
import { NextRequest, NextResponse } from 'next/server';
import { devMockEnabled, devDtrEvaluation } from '@/lib/server/devStubs';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as {
    patientId?: string;
    cptCode?: string;
    procedureName?: string;
  } | null;

  if (!body?.cptCode) {
    return NextResponse.json({ error: 'cptCode required' }, { status: 400 });
  }

  // Dev mock mode — patient-aware scenario
  if (devMockEnabled()) {
    await new Promise((r) => setTimeout(r, 600));
    try {
      const result = await devDtrEvaluation(body.patientId ?? 'MARIA_SD_001', body.cptCode);
      return NextResponse.json(result);
    } catch (e) {
      // A registered live policy failed to evaluate (missing/broken PDF asset, misconfigured row, or an
      // unsupported policy shape). FAIL LOUD — never silently serve an unrelated canned scenario.
      return NextResponse.json(
        {
          error: 'DTR policy evaluation unavailable',
          detail: String((e as Error).message ?? e),
          cptCode: body.cptCode,
        },
        { status: 502 }
      );
    }
  }

  // Live mode — forward to Policy Engine
  const policyEngineUrl = process.env.POLICY_ENGINE_URL ?? 'http://localhost:8083';
  try {
    const res = await fetch(`${policyEngineUrl}/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patientId: body.patientId, cptCode: body.cptCode }),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 502 });
  } catch {
    // Policy Engine offline — fall through to patient-aware mock
    await new Promise((r) => setTimeout(r, 600));
    try {
      const result = await devDtrEvaluation(body.patientId ?? 'MARIA_SD_001', body.cptCode);
      return NextResponse.json(result);
    } catch (e) {
      return NextResponse.json(
        {
          error: 'DTR policy evaluation unavailable',
          detail: String((e as Error).message ?? e),
          cptCode: body.cptCode,
        },
        { status: 502 }
      );
    }
  }
}
