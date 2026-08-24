/**
 * BFF: whole-person holistic context (HW4-B / I26, WPC-01/02).
 *
 * GET /api/wpc/context?memberId=... → the member's holistic context. Seam-switched:
 * mock/seeded returns the authored engine context (demo intact); production
 * aggregates the real projected graph (503 fail-closed if not wired). Tenant-scoped
 * (C-TEN), reviewer/care-manager authz, audited. This is the real entry point that
 * wires the holistic-context seam (the projected graph previously reached NO route).
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { ooError } from '@/lib/fhir/operationOutcome';
import { correlationFrom, CORRELATION_HEADER } from '@/lib/server/correlation';
import { getPrincipal } from '@/lib/authz/principal';
import { canAccessMemberTenantAware } from '@/lib/security/tenant';
import { audit } from '@/lib/server/audit';
import { resolveHolisticContext } from '@/lib/wpc/holisticContext';

export const runtime = 'nodejs';

const ROLES = new Set(['pa-reviewer', 'care-manager', 'payer-ops', 'admin']);

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
  if (!ROLES.has(principal.role)) {
    return NextResponse.json(
      ooError('Holistic context requires a reviewer/care-manager role', 'forbidden'),
      { status: 403, headers: { [CORRELATION_HEADER]: correlationId } }
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
    const result = resolveHolisticContext(memberId);
    await audit({
      ts: new Date().toISOString(),
      actor: principal.userId,
      action: 'wpc.context.view',
      resourceRef: `Patient/${memberId}`,
      correlationId,
      outcome: 'success',
      detail: `source=${result.source}`,
    });
    return NextResponse.json(result, {
      status: 200,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.name : 'exception';
    const status = detail.includes('NotConfigured') ? 503 : 500;
    return NextResponse.json(ooError('Holistic context unavailable', 'exception'), {
      status,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  }
}
