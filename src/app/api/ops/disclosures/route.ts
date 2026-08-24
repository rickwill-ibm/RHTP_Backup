/**
 * BFF: accounting of disclosures (HW2-B / I23, AUD-10).
 *
 * GET /api/ops/disclosures?memberId=... → the HIPAA accounting-of-disclosures for a
 * member (who received their PHI, when, purpose). Tenant-scoped (C-TEN), ops/
 * auditor authz, audited. Only ACCOUNTABLE disclosures are returned (treatment/
 * payment/operations are exempt under HIPAA). PHI-safe: references + purpose only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { ooError } from '@/lib/fhir/operationOutcome';
import { correlationFrom, CORRELATION_HEADER } from '@/lib/server/correlation';
import { getPrincipal } from '@/lib/authz/principal';
import { canAccessMemberTenantAware } from '@/lib/security/tenant';
import { audit } from '@/lib/server/audit';
import { getDataMode } from '@/lib/config/dataMode';
import { getDisclosureLog, isAccountable } from '@/lib/server/disclosure';

export const runtime = 'nodejs';

const ROLES = new Set(['payer-ops', 'admin', 'auditor']);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), { status: 401, headers: { [CORRELATION_HEADER]: correlationId } });
  }
  const authCtx = await getSessionAuthContext().catch(() => null);
  const principal = getPrincipal(authCtx);
  if (!ROLES.has(principal.role)) {
    return NextResponse.json(ooError('Accounting of disclosures requires an ops/auditor role', 'forbidden'), { status: 403, headers: { [CORRELATION_HEADER]: correlationId } });
  }
  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!memberId) {
    return NextResponse.json(ooError('memberId is required', 'invalid'), { status: 400, headers: { [CORRELATION_HEADER]: correlationId } });
  }
  const access = canAccessMemberTenantAware(principal, authCtx, memberId);
  if (!access.allow) {
    return NextResponse.json(ooError('Member is outside your authorization scope', 'forbidden'), { status: 403, headers: { [CORRELATION_HEADER]: correlationId } });
  }

  const log = getDisclosureLog(getDataMode('wpcRecord') === 'production');
  const all = await log.accountingFor(memberId);
  const accountable = all.filter((d) => isAccountable(d.purpose));
  await audit({
    ts: new Date().toISOString(), actor: principal.userId, action: 'disclosure.accounting',
    resourceRef: `Patient/${memberId}`, correlationId, outcome: 'success',
    detail: `accountable=${accountable.length} of ${all.length}`,
  });
  return NextResponse.json({ memberId, count: accountable.length, disclosures: accountable }, { status: 200, headers: { [CORRELATION_HEADER]: correlationId } });
}
