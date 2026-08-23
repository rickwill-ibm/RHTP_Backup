/**
 * BFF: risk-adjustment HCC capture + pre-submission scrub (HW-FIN / I18, C-SUB).
 *
 * POST /api/risk-adjustment/hcc         → validate a batch of captured HCCs for
 *                                          RADV defensibility; returns submittable
 *                                          vs withheld (with deficiencies). Nothing
 *                                          non-defensible/retracted is submittable.
 * DELETE /api/risk-adjustment/hcc?...    → retract a diagnosis pre-submission.
 *
 * Tenant-scoped (C-TEN) + reviewer/ops authz, audited (C-AUD). Demo-safe: pure
 * evaluation, no backend. This is the real entry point that makes the
 * risk-adjustment integrity module reachable.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { ooError } from '@/lib/fhir/operationOutcome';
import { correlationFrom, CORRELATION_HEADER } from '@/lib/server/correlation';
import { getPrincipal } from '@/lib/authz/principal';
import { canAccessMemberTenantAware } from '@/lib/security/tenant';
import { audit } from '@/lib/server/audit';
import { scrubForSubmission, retractDiagnosis, evaluateSubmission, rollupWithheldByCategory, type HccCapture } from '@/lib/finance/riskAdjustment';

export const runtime = 'nodejs';

const RA_ROLES = new Set(['pa-reviewer', 'care-manager', 'payer-ops', 'admin', 'auditor']);

async function authorize(req: NextRequest) {
  if (!(await isAuthenticated().catch(() => false))) return { ok: false as const, status: 401, reason: 'Not authenticated' };
  const authCtx = await getSessionAuthContext().catch(() => null);
  const principal = getPrincipal(authCtx);
  if (!RA_ROLES.has(principal.role)) return { ok: false as const, status: 403, reason: 'Risk-adjustment review requires a reviewer/ops role' };
  return { ok: true as const, principal, authCtx };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json(ooError(auth.reason, auth.status === 401 ? 'login' : 'forbidden'), { status: auth.status, headers: { [CORRELATION_HEADER]: correlationId } });

  const body = (await req.json().catch(() => null)) as { captures?: HccCapture[] } | null;
  if (!body?.captures || !Array.isArray(body.captures)) {
    return NextResponse.json(ooError('captures[] is required', 'invalid'), { status: 400, headers: { [CORRELATION_HEADER]: correlationId } });
  }
  // Tenant check per distinct member in the batch.
  for (const memberId of new Set(body.captures.map((c) => c.memberId))) {
    const access = canAccessMemberTenantAware(auth.principal, auth.authCtx, memberId);
    if (!access.allow) {
      return NextResponse.json(ooError('A member in the batch is outside your authorization scope', 'forbidden'), { status: 403, headers: { [CORRELATION_HEADER]: correlationId } });
    }
  }

  const result = scrubForSubmission(body.captures);
  await audit({
    ts: new Date().toISOString(), actor: auth.principal.userId, action: 'risk-adjustment.scrub',
    correlationId, outcome: 'success',
    detail: `submittable=${result.submitted.length}; withheld=${result.withheld.length}`,
  });
  return NextResponse.json(
    {
      submittable: result.submitted.length,
      withheld: result.withheld,
      // HW6-2: withheld diagnoses rolled up by ICD-10 category for a remediation worklist.
      withheldByCategory: rollupWithheldByCategory(result.withheld),
    },
    { status: 200, headers: { [CORRELATION_HEADER]: correlationId } },
  );
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json(ooError(auth.reason, auth.status === 401 ? 'login' : 'forbidden'), { status: auth.status, headers: { [CORRELATION_HEADER]: correlationId } });

  const body = (await req.json().catch(() => null)) as { capture?: HccCapture } | null;
  if (!body?.capture) {
    return NextResponse.json(ooError('capture is required', 'invalid'), { status: 400, headers: { [CORRELATION_HEADER]: correlationId } });
  }
  const access = canAccessMemberTenantAware(auth.principal, auth.authCtx, body.capture.memberId);
  if (!access.allow) {
    return NextResponse.json(ooError('Member is outside your authorization scope', 'forbidden'), { status: 403, headers: { [CORRELATION_HEADER]: correlationId } });
  }

  const retracted = retractDiagnosis(body.capture);
  await audit({
    ts: new Date().toISOString(), actor: auth.principal.userId, action: 'risk-adjustment.retract',
    resourceRef: `${retracted.hccCode}/${retracted.icdCode}`, correlationId, outcome: 'success',
    detail: 'diagnosis retracted pre-submission',
  });
  return NextResponse.json(
    { retracted: true, submittable: evaluateSubmission(retracted).submittable },
    { status: 200, headers: { [CORRELATION_HEADER]: correlationId } },
  );
}
