/**
 * BFF: verify the tamper-evident audit ledger (HW2 / I15, AUD-01).
 *
 * GET /api/ops/audit/verify → recomputes the audit hash-chain and reports whether
 * it is intact (and where it first breaks, if tampered). Ops/auditor-scoped. This
 * is the operable surface for the tamper-evidence guarantee: a compliance auditor
 * (or a scheduled integrity check) proves the trail has not been altered.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { ooError } from '@/lib/fhir/operationOutcome';
import { correlationFrom, CORRELATION_HEADER } from '@/lib/server/correlation';
import { getPrincipal, isOpsPrincipal } from '@/lib/authz/principal';
import { audit } from '@/lib/server/audit';
import { getAuditLedger } from '@/lib/server/auditLedger';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), {
      status: 401,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  }

  const principal = getPrincipal(await getSessionAuthContext().catch(() => null));
  // Ops OR auditor may verify the trail (auditor is the compliance reviewer role).
  if (!isOpsPrincipal(principal) && principal.role !== 'auditor') {
    return NextResponse.json(ooError('Audit verification requires an ops or auditor role', 'forbidden'), {
      status: 403,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  }

  try {
    const ledger = getAuditLedger(process.env.AUDIT_LEDGER === 'durable');
    const verification = await ledger.verify();
    const head = await ledger.head();
    await audit({
      ts: new Date().toISOString(),
      actor: principal.userId,
      action: 'audit.ledger.verify',
      correlationId,
      outcome: verification.ok ? 'success' : 'failure',
      detail: `intact=${verification.ok}; count=${verification.count}${verification.ok ? '' : `; brokenAt=${verification.brokenAt}`}`,
    });
    return NextResponse.json({ ...verification, head }, {
      status: verification.ok ? 200 : 409,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.name : 'exception';
    const status = detail.includes('NotConfigured') ? 503 : 500;
    return NextResponse.json(ooError('Audit verification failed', 'exception'), {
      status,
      headers: { [CORRELATION_HEADER]: correlationId },
    });
  }
}
