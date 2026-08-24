/**
 * BFF: encounter submission + acknowledgment reconciliation (HW-FIN-B / I24, C-SUB).
 *
 * POST /api/finance/submission            → build a submission batch from
 *                                           submittable encounters.
 * POST /api/finance/submission?reconcile=1 → reconcile a batch against 999/277CA/
 *                                           MAO-002 acknowledgments; returns
 *                                           accepted/rejected/resubmit worklists.
 *
 * Reviewer/ops authz, tenant-scoped per member, audited. Only ACCEPTED encounters
 * earn risk revenue. Seam-gated / demo-safe: pure processing, no backend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { ooError } from '@/lib/fhir/operationOutcome';
import { correlationFrom, CORRELATION_HEADER } from '@/lib/server/correlation';
import { getPrincipal } from '@/lib/authz/principal';
import { canAccessMemberTenantAware } from '@/lib/security/tenant';
import { audit } from '@/lib/server/audit';
import { buildBatch, reconcile, buildResubmission, type SubmissionBatch, type Acknowledgment, type EncounterSubmission } from '@/lib/finance/submission';

export const runtime = 'nodejs';

const ROLES = new Set(['payer-ops', 'admin', 'pa-reviewer']);

async function authorize(req: NextRequest) {
  if (!(await isAuthenticated().catch(() => false))) return { ok: false as const, status: 401, reason: 'Not authenticated' };
  const authCtx = await getSessionAuthContext().catch(() => null);
  const principal = getPrincipal(authCtx);
  if (!ROLES.has(principal.role)) return { ok: false as const, status: 403, reason: 'Encounter submission requires an ops/reviewer role' };
  return { ok: true as const, principal, authCtx };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json(ooError(auth.reason, auth.status === 401 ? 'login' : 'forbidden'), { status: auth.status, headers: { [CORRELATION_HEADER]: correlationId } });
  const reconcileMode = req.nextUrl.searchParams.get('reconcile') === '1';
  const body = (await req.json().catch(() => null)) as
    | { batchId?: string; encounters?: Array<Omit<EncounterSubmission, 'status' | 'attempts'>>; batch?: SubmissionBatch; acks?: Acknowledgment[] }
    | null;
  if (!body) return NextResponse.json(ooError('body required', 'invalid'), { status: 400, headers: { [CORRELATION_HEADER]: correlationId } });

  if (reconcileMode) {
    if (!body.batch || !Array.isArray(body.acks)) {
      return NextResponse.json(ooError('batch and acks[] required to reconcile', 'invalid'), { status: 400, headers: { [CORRELATION_HEADER]: correlationId } });
    }
    const result = reconcile(body.batch, body.acks);
    const resub = result.resubmit.length ? buildResubmission(`${body.batch.batchId}-r`, result.resubmit) : null;
    await audit({
      ts: new Date().toISOString(), actor: auth.principal.userId, action: 'submission.reconcile',
      correlationId, outcome: 'success',
      detail: `accepted=${result.accepted.length}; rejected=${result.rejected.length}; resubmit=${result.resubmit.length}; pending=${result.pending.length}`,
    });
    return NextResponse.json({ accepted: result.accepted, rejected: result.rejected, pending: result.pending, resubmissionBatch: resub }, { status: 200, headers: { [CORRELATION_HEADER]: correlationId } });
  }

  if (!body.batchId || !Array.isArray(body.encounters)) {
    return NextResponse.json(ooError('batchId and encounters[] required', 'invalid'), { status: 400, headers: { [CORRELATION_HEADER]: correlationId } });
  }
  for (const memberId of new Set(body.encounters.map((e) => e.memberId))) {
    const access = canAccessMemberTenantAware(auth.principal, auth.authCtx, memberId);
    if (!access.allow) return NextResponse.json(ooError('A member in the batch is outside your scope', 'forbidden'), { status: 403, headers: { [CORRELATION_HEADER]: correlationId } });
  }
  const batch = buildBatch(body.batchId, body.encounters);
  await audit({
    ts: new Date().toISOString(), actor: auth.principal.userId, action: 'submission.build',
    correlationId, outcome: 'success', detail: `batch=${batch.batchId}; encounters=${batch.encounters.length}`,
  });
  return NextResponse.json({ batch }, { status: 200, headers: { [CORRELATION_HEADER]: correlationId } });
}
