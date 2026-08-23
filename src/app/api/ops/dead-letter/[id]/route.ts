/**
 * BFF: dead-letter / held-review ops queue — resolve / retry / dismiss (NS-01).
 *
 * POST /api/ops/dead-letter/:id  body { action: 'resolve' | 'retry' | 'dismiss' }
 *   resolve  → close the item (reviewer handled it out of band).
 *   dismiss  → close the item as not-actionable.
 *   retry    → re-submit the held/quarantined/failed record through the registered
 *              lane; the item is marked 'retried' only when the lane accepts it.
 *
 * Ops-scoped authz (isOpsPrincipal — payer-ops or admin, NOT pa-reviewer). Every
 * action is audited PHI-safe (the audit detail carries the kind + reason code,
 * never member data). BFF-only, PHI-safe bodies.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { ooError } from '@/lib/fhir/operationOutcome';
import { correlationFrom } from '@/lib/server/correlation';
import { getPrincipal, isOpsPrincipal } from '@/lib/authz/principal';
import { audit } from '@/lib/server/audit';
import { getDeadLetterStore, isResolutionAction } from '@/lib/deadLetter';
import { reviewAction, getRetryLaneRouter } from '@/lib/deadLetter/review';
import { getIdempotencyStore } from '@/lib/idempotency';

export const runtime = 'nodejs';

/** Machine reason → HTTP status for a failed review action. */
function statusForReason(reason: string | undefined): number {
  switch (reason) {
    case 'not-found':
      return 404;
    case 'invalid-action':
      return 400;
    case 'retry-lane-not-configured':
      return 503;
    case 'retry-lane-rejected':
      return 502;
    default:
      return 409;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), { status: 401 });
  }

  const principal = getPrincipal(await getSessionAuthContext().catch(() => null));
  if (!isOpsPrincipal(principal)) {
    await audit({
      ts: new Date().toISOString(),
      actor: principal.userId,
      action: 'dead-letter.action.denied',
      correlationId,
      outcome: 'failure',
      detail: `role=${principal.role} is not ops-scoped`,
    });
    return NextResponse.json(
      ooError('Dead-letter review requires an ops role', 'forbidden'),
      { status: 403 },
    );
  }

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  const action = body?.action;
  if (!isResolutionAction(action)) {
    return NextResponse.json(
      ooError('body.action must be one of retry | resolve | dismiss', 'invalid'),
      { status: 400 },
    );
  }

  try {
    const store = getDeadLetterStore();
    // The idempotency store guards a double-clicked / replayed review command so a
    // retry does not re-inject and resolve/dismiss does not double-transition.
    const result = await reviewAction(
      store,
      { id, action, actor: principal.userId },
      getRetryLaneRouter(),
      getIdempotencyStore(),
    );
    // Audit every attempt, success or failure, PHI-safe (kind + reason, no member data).
    await audit({
      ts: new Date().toISOString(),
      actor: result.audit.actor,
      action: result.audit.action,
      resourceRef: result.audit.resourceRef,
      correlationId,
      outcome: result.audit.outcome,
      detail: result.audit.detail,
    });
    if (!result.ok) {
      return NextResponse.json(
        ooError(`dead-letter ${action} failed: ${result.reason}`, 'processing'),
        { status: statusForReason(result.reason) },
      );
    }
    return NextResponse.json({ ok: true, record: result.record }, { status: 200 });
  } catch {
    return NextResponse.json(ooError('Failed to action dead-letter item', 'exception'), { status: 500 });
  }
}
