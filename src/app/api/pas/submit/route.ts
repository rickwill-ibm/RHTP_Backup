/**
 * BFF: submit prior authorization (PAS) — plan Slice 4. HUMAN-GATED.
 *
 * Guardrail (blueprint §4D): an agent may PREPARE the Claim bundle, but the actual
 * submission requires an explicit human of record. Two properties, one model in
 * mock and production:
 *
 *  1. INTENT — the caller must signal a human chose to approve. A non-empty
 *     `approvedBy` (body) or `x-approved-by` (header) is that signal; without it the
 *     route returns 202 and does NOT submit. The signal's STRING VALUE is ignored —
 *     it never names the approver.
 *  2. IDENTITY — the accountable approver is resolved dynamically from the
 *     AUTHENTICATED session principal (resolveApprovalAuthority), never from the
 *     caller's string. The principal must be a role-authorized, resolvable reviewer
 *     of record or the submission is refused (403, fail-closed). This is the same
 *     resolver path in the dev-mock demo (Practitioner/dev → "Dr. Alex Rivera, UM
 *     Reviewer") and in production (a registered FHIR Practitioner resolver), so the
 *     api-explorer walkthrough exercises the real association — no mock shortcut.
 *
 * On a successful submission the resolved approver is recorded on the member's
 * Evidence Record (the golden-thread audit spine) as a `pas-submission` entry — a
 * structured reviewer reference, never a free string. Best-effort: evidence
 * recording never blocks or fails the submission itself.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { getPrincipal } from '@/lib/authz/principal';
import { resolveApprovalAuthority } from '@/lib/authz/approvalAuthority';
import type { ApproverIdentity } from '@/lib/authz/approvalAuthority';
import { submitPas } from '@/lib/server/pasClient';
import { getEvidenceStore } from '@/lib/evidence/store';
import { recordPasSubmission, withStatus } from '@/lib/evidence';
import { correlationFrom, newCorrelationId } from '@/lib/server/correlation';
import { ooError, operationOutcome } from '@/lib/fhir/operationOutcome';
import { audit } from '@/lib/server/audit';
import { devMockEnabled, devClaimResponseApproved } from '@/lib/server/devStubs';

export const runtime = 'nodejs';

/** Extract the ordered CPT code from a PAS Claim bundle (defensive; may be absent). */
function codeFromClaimBundle(bundle: unknown): string | undefined {
  try {
    const b = bundle as {
      entry?: { resource?: { item?: { productOrService?: { coding?: { code?: string }[] } }[] } }[];
    };
    return b.entry?.[0]?.resource?.item?.[0]?.productOrService?.coding?.[0]?.code;
  } catch {
    return undefined;
  }
}

/**
 * Append a `pas-submission` entry (resolved approver) to the member's latest
 * Evidence Record. Best-effort — a missing record, an unconfigured production
 * ledger, or any store error is swallowed so it never blocks the submission.
 */
async function recordSubmissionOnEvidence(args: {
  memberId: string | undefined;
  code: string | undefined;
  approver: ApproverIdentity;
  ts: string;
}): Promise<void> {
  const { memberId, code, approver, ts } = args;
  if (!memberId) return;
  try {
    const store = getEvidenceStore();
    const ids = await store.list();
    const byCode = code ? ids.filter((id) => id.startsWith(`ev-${memberId}-${code}-`)) : [];
    const pool = byCode.length ? byCode : ids.filter((id) => id.startsWith(`ev-${memberId}-`));
    if (pool.length === 0) return; // no clearance record yet — nothing to append to
    const latest = pool
      .slice()
      .sort((a, b) => (Number(a.split('-').pop()) || 0) - (Number(b.split('-').pop()) || 0))
      .pop() as string;
    const rec = await store.get(latest);
    if (!rec) return;
    const updated = withStatus(
      recordPasSubmission(rec, {
        id: `${latest}-pas-${Date.parse(ts)}`,
        ts,
        approver: { reference: approver.reference, display: approver.display },
      }),
      'submitted'
    );
    await store.save(updated);
  } catch {
    /* evidence recording must never block a submission */
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    claimBundle?: unknown;
    approvedBy?: string;
    patientId?: string;
  } | null;
  if (!body?.claimBundle) {
    return NextResponse.json(ooError('claimBundle required', 'required'), { status: 400 });
  }

  // (1) INTENT — presence of an approval signal. Value is NOT used as identity.
  const approvalSignal = (body.approvedBy || req.headers.get('x-approved-by') || '').trim();
  if (!approvalSignal) {
    return NextResponse.json(
      operationOutcome([
        {
          severity: 'information',
          code: 'informational',
          diagnostics:
            'Prior-authorization submission requires human approval. Re-POST with approvedBy set.',
        },
      ]),
      { status: 202 }
    );
  }

  // Extract patientId from claimBundle if not provided at top level (also the
  // PHI-safe resource ref for the authorization audit below).
  const claimPatientId =
    body.patientId ??
    (() => {
      try {
        const bundle = body.claimBundle as {
          entry?: { resource?: { patient?: { reference?: string } } }[];
        };
        const ref = bundle.entry?.[0]?.resource?.patient?.reference ?? '';
        return ref.startsWith('Patient/') ? ref.slice(8) : undefined;
      } catch {
        return undefined;
      }
    })();

  // (2) IDENTITY — resolve the accountable approver from the authenticated principal.
  const principal = getPrincipal(await getSessionAuthContext().catch(() => null));
  const approval = resolveApprovalAuthority({ principal });
  if (!approval.authorized || !approval.approver) {
    await audit({
      ts: new Date().toISOString(),
      actor: principal.userId,
      action: 'pas.submit.approval-denied',
      resourceRef: `Patient/${claimPatientId ?? 'unknown'}`,
      correlationId,
      outcome: 'failure',
      detail: approval.reason,
    });
    return NextResponse.json(
      ooError('Acting principal is not a reviewer of record authorized to approve', 'forbidden'),
      { status: 403 }
    );
  }
  const approver = approval.approver;
  const submissionTs = new Date().toISOString();
  const orderCode = codeFromClaimBundle(body.claimBundle);

  // Dev demo: return a canned approved decision. The displayed approver is the
  // RESOLVED reviewer of record (dynamic association), not a client literal.
  if (devMockEnabled()) {
    await recordSubmissionOnEvidence({
      memberId: claimPatientId,
      code: orderCode,
      approver,
      ts: submissionTs,
    });
    return NextResponse.json(devClaimResponseApproved(approver.display, claimPatientId), {
      status: 200,
    });
  }

  const idempotencyKey = req.headers.get('idempotency-key') || newCorrelationId();
  const result = await submitPas(body.claimBundle, {
    actor: approver.reference,
    approvedBy: approver.reference,
    idempotencyKey,
    correlationId,
  });
  if (result.ok) {
    await recordSubmissionOnEvidence({
      memberId: claimPatientId,
      code: orderCode,
      approver,
      ts: submissionTs,
    });
  }
  return NextResponse.json(result.claimResponse ?? ooError('submit failed', 'exception'), {
    status: result.ok ? 200 : result.status || 502,
  });
}
