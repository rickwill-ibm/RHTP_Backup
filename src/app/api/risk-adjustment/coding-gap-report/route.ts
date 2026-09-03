/**
 * BFF: Da Vinci Risk Adjustment **$report** — a member's Coding Gap MeasureReports (P2).
 *
 * GET /api/risk-adjustment/coding-gap-report?memberId=...[&purpose=...]
 *   → a FHIR searchset `Bundle` of Da Vinci-RA Coding Gap `MeasureReport`s assembled
 *     from the member's projected `CodingGap` subgraph (the inverse of ingest). This is
 *     the report-OUT operation a payer RA engine or data-exchange partner calls.
 *
 * The read SCOPE is decided SERVER-SIDE from the member's Part 2 directives × recipient
 * × purpose (never caller-supplied), so a 42 CFR Part 2 SUD gap is omitted from the
 * report unless the requester is entitled to it — the assembler re-checks consent on
 * every gap and every cited evidence node. Tenant- + reviewer/ops-scoped, audited, and
 * fails CLOSED (503) if the projected-graph read is unavailable. PHI-minimal output.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { ooError } from '@/lib/fhir/operationOutcome';
import { correlationFrom, CORRELATION_HEADER } from '@/lib/server/correlation';
import { getPrincipal } from '@/lib/authz/principal';
import { canAccessMemberTenantAware } from '@/lib/security/tenant';
import { audit } from '@/lib/server/audit';
import { assembleCodingGapReportBundle } from '@/lib/finance/riskAdjustment';
import { resolveConsentDecision } from '@/lib/consent/consentResolver';
import { getSharedProjectionStores } from '@/lib/runtime/projectionRuntime';
import { now } from '@/lib/clock';

export const runtime = 'nodejs';

const RA_ROLES = new Set(['pa-reviewer', 'care-manager', 'payer-ops', 'admin', 'auditor']);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), {
      status: 401,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  }
  const authCtx = await getSessionAuthContext().catch(() => null);
  const principal = getPrincipal(authCtx);
  if (!RA_ROLES.has(principal.role)) {
    return NextResponse.json(
      ooError('Risk-adjustment reporting requires a reviewer/ops role', 'forbidden'),
      {
        status: 403,
        headers: { [CORRELATION_HEADER]: correlationId },
      }
    );
  }
  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!memberId) {
    return NextResponse.json(ooError('memberId is required', 'invalid'), {
      status: 400,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  }
  const access = canAccessMemberTenantAware(principal, authCtx, memberId);
  if (!access.allow) {
    return NextResponse.json(ooError('Member is outside your authorization scope', 'forbidden'), {
      status: 403,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  }

  try {
    // Consent decision (C1): scope is the member's directives × recipient × purpose,
    // decided here — a Part 2 SUD gap is excluded from the report unless entitled.
    const purpose = req.nextUrl.searchParams.get('purpose') || 'risk-adjustment';
    const consent = resolveConsentDecision(
      { memberId, recipient: principal.userId, purpose },
      { now }
    );
    await audit({
      ts: consent.audit.at,
      actor: principal.userId,
      action: `risk-adjustment.consent.${consent.audit.auditClass}`,
      resourceRef: `Patient/${memberId}`,
      correlationId,
      outcome: consent.failClosed ? 'failure' : 'success',
      detail: `${consent.audit.reason} | source=${consent.source} part2=${consent.scope.part2}`,
    });

    const graph = getSharedProjectionStores().graph;
    const bundle = await assembleCodingGapReportBundle(graph, memberId, consent.scope);
    await audit({
      ts: new Date().toISOString(),
      actor: principal.userId,
      action: 'risk-adjustment.coding-gap.report',
      resourceRef: `Patient/${memberId}`,
      correlationId,
      outcome: 'success',
      detail: `reports=${bundle.total}`,
    });
    return NextResponse.json(bundle, {
      status: 200,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  } catch (err) {
    // FAIL CLOSED: an unavailable/unwired graph read returns 503, never a stale 200.
    const name = err instanceof Error ? err.name : 'exception';
    const status = name.includes('NotConfigured') ? 503 : 500;
    return NextResponse.json(ooError('Coding-gap report unavailable', 'exception'), {
      status,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  }
}
