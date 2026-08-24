/**
 * BFF: operational health + observability (HW1-B / I22, HS-06 readiness=liveness).
 *
 * GET /api/ops/health → circuit-breaker states, scheduler jobs, metrics snapshot,
 * SLO status, and a LIVENESS flag derived from actual subsystem state (not merely
 * config presence). Ops/auditor authz. This is the real entry point that wires the
 * reliability + observability modules; a monitoring probe reads it.
 *
 * POST /api/ops/health?tick=1 → runs one scheduler tick (drives the projection
 * drain + reconciliation jobs); ops authz. In production a worker/cron drives it.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { ooError } from '@/lib/fhir/operationOutcome';
import { correlationFrom, CORRELATION_HEADER } from '@/lib/server/correlation';
import { getPrincipal, isOpsPrincipal } from '@/lib/authz/principal';
import { now } from '@/lib/clock';
import { breakerSnapshots, getScheduler } from '@/lib/reliability';
import { bootstrapReliability } from '@/lib/reliability/bootstrap';
import { metrics, type SloTarget } from '@/lib/observability';

export const runtime = 'nodejs';

const SLOS: SloTarget[] = [
  { name: 'job.projection-drain', p95BudgetMs: 5_000, maxErrorRatio: 0.05 },
];

function liveness() {
  // Readiness = real subsystem liveness: no breaker stuck open.
  const breakers = breakerSnapshots();
  const openBreakers = breakers.filter((b) => b.state === 'open').map((b) => b.seam);
  return { live: openBreakers.length === 0, openBreakers };
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), {
      status: 401,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  }
  const principal = getPrincipal(await getSessionAuthContext().catch(() => null));
  if (!isOpsPrincipal(principal) && principal.role !== 'auditor') {
    return NextResponse.json(ooError('Health requires an ops or auditor role', 'forbidden'), {
      status: 403,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  }
  bootstrapReliability();
  const live = liveness();
  const body = {
    liveness: live,
    breakers: breakerSnapshots(),
    scheduler: { jobs: getScheduler().ids() },
    metrics: metrics().snapshot(),
    slos: metrics().evaluateSlos(SLOS),
  };
  return NextResponse.json(body, {
    status: live.live ? 200 : 503,
    headers: { [CORRELATION_HEADER]: correlationId },
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), {
      status: 401,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  }
  const principal = getPrincipal(await getSessionAuthContext().catch(() => null));
  if (!isOpsPrincipal(principal)) {
    return NextResponse.json(ooError('Scheduler tick requires an ops role', 'forbidden'), {
      status: 403,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  }
  bootstrapReliability();
  const result = await getScheduler().tick(now());
  return NextResponse.json(result, {
    status: 200,
    headers: { [CORRELATION_HEADER]: correlationId },
  });
}
