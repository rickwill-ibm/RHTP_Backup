/**
 * BFF: dead-letter / held-review ops queue — list (NS-01).
 *
 * GET /api/ops/dead-letter?kind=&status= → the open dead-letter items (quarantine,
 * held-identity, failed-outbox) a reliability operator must resolve. Before this
 * subsystem these records were built then DROPPED; now they land durably and this
 * is the surface that surfaces them.
 *
 * Ops-scoped authz: the acting principal must hold an ops/admin role (isOpsPrincipal
 * — payer-ops or admin), NOT the clinical pa-reviewer (this is a DISTINCT surface
 * from the clinical work queue, not a second inbox). BFF-only, PHI-safe bodies.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { ooError } from '@/lib/fhir/operationOutcome';
import { correlationFrom } from '@/lib/server/correlation';
import { getPrincipal, isOpsPrincipal } from '@/lib/authz/principal';
import { audit } from '@/lib/server/audit';
import { getDeadLetterStore, isDeadLetterKind, isDeadLetterStatus } from '@/lib/deadLetter';
import { listOpenItems } from '@/lib/deadLetter/review';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), { status: 401 });
  }

  const principal = getPrincipal(await getSessionAuthContext().catch(() => null));
  if (!isOpsPrincipal(principal)) {
    await audit({
      ts: new Date().toISOString(),
      actor: principal.userId,
      action: 'dead-letter.list.denied',
      correlationId,
      outcome: 'failure',
      detail: `role=${principal.role} is not ops-scoped`,
    });
    return NextResponse.json(ooError('Dead-letter review requires an ops role', 'forbidden'), {
      status: 403,
    });
  }

  const url = new URL(req.url);
  const kindParam = url.searchParams.get('kind');
  const statusParam = url.searchParams.get('status');
  if (kindParam !== null && !isDeadLetterKind(kindParam)) {
    return NextResponse.json(ooError(`invalid kind "${kindParam}"`, 'invalid'), { status: 400 });
  }
  if (statusParam !== null && !isDeadLetterStatus(statusParam)) {
    return NextResponse.json(ooError(`invalid status "${statusParam}"`, 'invalid'), {
      status: 400,
    });
  }

  try {
    const store = getDeadLetterStore();
    // Default: open items. An explicit status param overrides (e.g. see resolved).
    const filter = {
      ...(kindParam !== null && isDeadLetterKind(kindParam) ? { kind: kindParam } : {}),
      ...(statusParam !== null && isDeadLetterStatus(statusParam) ? { status: statusParam } : {}),
    };
    const items =
      statusParam !== null ? await store.list(filter) : await listOpenItems(store, filter);
    await audit({
      ts: new Date().toISOString(),
      actor: principal.userId,
      action: 'dead-letter.list',
      correlationId,
      outcome: 'success',
      detail: `count=${items.length}; kind=${kindParam ?? 'all'}; status=${statusParam ?? 'open'}`,
    });
    return NextResponse.json({ count: items.length, items }, { status: 200 });
  } catch {
    return NextResponse.json(ooError('Failed to list dead-letter items', 'exception'), {
      status: 500,
    });
  }
}
