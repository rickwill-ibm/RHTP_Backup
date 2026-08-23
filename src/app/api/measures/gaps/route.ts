/**
 * BFF: care-gap + Stars view from ingested external measures (HW4 / I19, C-MEAS).
 *
 * GET /api/measures/gaps → the normalized care-gap view. Seam-switched: mock/seeded
 * returns the authored demo gaps (demo intact); production ingests the external
 * Da Vinci DEQM MeasureReport feed (503 fail-closed if the feed is not wired). The
 * platform ingests measures — it does not compute them (constraint #4).
 *
 * Reviewer/ops/auditor authz, audited, PHI-safe (aggregate counts only).
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { ooError } from '@/lib/fhir/operationOutcome';
import { correlationFrom, CORRELATION_HEADER } from '@/lib/server/correlation';
import { getPrincipal } from '@/lib/authz/principal';
import { audit } from '@/lib/server/audit';
import { getCareGapView } from '@/lib/measures';

export const runtime = 'nodejs';

const VIEW_ROLES = new Set(['pa-reviewer', 'care-manager', 'payer-ops', 'admin', 'auditor']);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), { status: 401, headers: { [CORRELATION_HEADER]: correlationId } });
  }
  const principal = getPrincipal(await getSessionAuthContext().catch(() => null));
  if (!VIEW_ROLES.has(principal.role)) {
    return NextResponse.json(ooError('Care-gap view requires a reviewer/ops role', 'forbidden'), { status: 403, headers: { [CORRELATION_HEADER]: correlationId } });
  }

  try {
    const view = getCareGapView();
    await audit({
      ts: new Date().toISOString(), actor: principal.userId, action: 'measures.gaps.view',
      correlationId, outcome: 'success',
      detail: `disposition=${view.disposition}; total=${view.summary.total}; open=${view.summary.open}`,
    });
    return NextResponse.json(view, { status: 200, headers: { [CORRELATION_HEADER]: correlationId } });
  } catch (err) {
    const detail = err instanceof Error ? err.name : 'exception';
    const status = detail.includes('NotConfigured') ? 503 : 500;
    return NextResponse.json(ooError('Care-gap view unavailable', 'exception'), { status, headers: { [CORRELATION_HEADER]: correlationId } });
  }
}
