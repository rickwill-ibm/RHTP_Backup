/**
 * BFF: disparate-impact / fairness report (HW-AI-B / I25).
 *
 * GET /api/ops/fairness → the four-fifths-rule analysis over the current window of
 * AI-influenced decision outcomes: per-cohort favorable rates, the four-fifths
 * ratios, and any flagged cohorts (ratio < 0.8) to investigate. Ops/auditor authz,
 * audited. Reports only — never auto-acts on a disparity. PHI-safe (cohort labels
 * + counts only). Returns 409 when a disparity is flagged (so a monitor can alert).
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { ooError } from '@/lib/fhir/operationOutcome';
import { correlationFrom, CORRELATION_HEADER } from '@/lib/server/correlation';
import { getPrincipal, isOpsPrincipal } from '@/lib/authz/principal';
import { audit } from '@/lib/server/audit';
import { currentDisparateImpact } from '@/lib/agents/governance';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), { status: 401, headers: { [CORRELATION_HEADER]: correlationId } });
  }
  const principal = getPrincipal(await getSessionAuthContext().catch(() => null));
  if (!isOpsPrincipal(principal) && principal.role !== 'auditor') {
    return NextResponse.json(ooError('Fairness report requires an ops/auditor role', 'forbidden'), { status: 403, headers: { [CORRELATION_HEADER]: correlationId } });
  }
  const result = currentDisparateImpact();
  await audit({
    ts: new Date().toISOString(), actor: principal.userId, action: 'fairness.report',
    correlationId, outcome: result.fair ? 'success' : 'failure',
    detail: `fair=${result.fair}; flagged=${result.flagged.join(',') || 'none'}; cohorts=${result.stats.length}`,
  });
  return NextResponse.json(result, { status: result.fair ? 200 : 409, headers: { [CORRELATION_HEADER]: correlationId } });
}
