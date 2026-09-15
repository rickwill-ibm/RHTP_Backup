/**
 * GET /api/health/readiness — deployment readiness probe (iteration 9 wave B).
 *
 * Reflects the startup PREFLIGHT (src/lib/deploy): 200 when ready, 503 when not.
 * A 503 body names every unmet requirement (env key or production seam backend)
 * so an operator sees exactly what is unconfigured. The body is PHI-safe and
 * secret-value-free by construction — the preflight records key NAMES and
 * presence, never key values.
 *
 * This is the probe a load balancer / orchestrator points at to decide whether
 * to route traffic. It is deliberately UNAUTHENTICATED (it exposes only config
 * posture, never member data) and cheap-ish: a pure read of env + frozen schema,
 * no backend resolver is touched. E9: never default-ready — a not-ready deploy
 * returns 503, it does not fall through to 200.
 */
import { NextResponse } from 'next/server';
import { runPreflight } from '@/lib/deploy';

export const runtime = 'nodejs';
// Always evaluate live env at request time; never cache a readiness verdict.
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const report = runPreflight();
    return NextResponse.json(report, { status: report.ready ? 200 : 503 });
  } catch (err) {
    // Any unexpected failure in the preflight itself is treated as NOT ready
    // (fail closed), never as ready. The message is a safe, generic string.
    const name = err instanceof Error ? err.name : 'Error';
    return NextResponse.json(
      {
        ready: false,
        environment: 'unknown',
        checkedAt: new Date().toISOString(),
        summary: `not-ready: readiness preflight raised ${name}`,
        unmet: [
          {
            kind: 'schema',
            name: 'preflight',
            reason: `readiness preflight raised ${name} — treated as not-ready (fail closed)`,
          },
        ],
        checks: { envKeysChecked: 0, seamsChecked: 0, productionSeamsChecked: 0 },
      },
      { status: 503 }
    );
  }
}
