/**
 * GET /api/health/liveness — process liveness probe (iteration 9 wave B).
 *
 * A CHEAP process check: if this handler runs, the Node process is up and able
 * to serve. It deliberately does NOT run the readiness preflight, touch env
 * config, or reach any backend — a liveness probe answers "is the process
 * alive", not "is the deployment correctly configured" (that is readiness).
 * Always 200 while the process can respond; an orchestrator uses a liveness
 * failure (no response) to RESTART, and readiness (503) to stop routing traffic.
 *
 * Body is a fixed PHI-safe shape: status + uptime + pid + timestamp.
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      status: 'alive',
      uptimeSeconds: Math.round(process.uptime()),
      pid: process.pid,
      ts: new Date().toISOString(),
    },
    { status: 200 },
  );
}
