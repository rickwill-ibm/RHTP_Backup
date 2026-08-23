/**
 * BFF: Provider Access opt-out consent (Dev Plan Workstream A).
 *
 * GET  ?memberId=...            -> current consent status
 * POST { memberId, action: 'opt-out' | 'revoke', recordedBy, reason? }
 *
 * Every write requires `recordedBy` — consent changes are always attributed and
 * audited, never silent (same principle as the PAS human-gate in api/pas/submit).
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/server/smartSession';
import { ooError } from '@/lib/fhir/operationOutcome';
import { getProviderAccessConsentStore } from '@/lib/consent/providerAccessOptOut';
import { devMockEnabled } from '@/lib/server/devStubs';

export const runtime = 'nodejs';

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!devMockEnabled() && !(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), { status: 401 });
  }
  const memberId = req.nextUrl.searchParams.get('memberId');
  if (!memberId) {
    return NextResponse.json(ooError('memberId required', 'required'), { status: 400 });
  }
  const record = getProviderAccessConsentStore().getStatus(memberId);
  return NextResponse.json({
    memberId,
    optedOut: record?.optedOut ?? false,
    record,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!devMockEnabled() && !(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as {
    memberId?: string;
    action?: 'opt-out' | 'revoke';
    recordedBy?: string;
    reason?: string;
  } | null;

  if (!body?.memberId || !body?.action) {
    return NextResponse.json(ooError('memberId and action required', 'required'), {
      status: 400,
    });
  }
  const recordedBy = body.recordedBy || req.headers.get('x-recorded-by') || '';
  if (!recordedBy) {
    return NextResponse.json(
      ooError(
        'Consent changes require recordedBy — re-POST with recordedBy set or an x-recorded-by header.',
        'required'
      ),
      { status: 400 }
    );
  }

  const store = getProviderAccessConsentStore();
  const record =
    body.action === 'opt-out'
      ? store.optOut(body.memberId, recordedBy, body.reason)
      : store.revokeOptOut(body.memberId, recordedBy, body.reason);

  return NextResponse.json({ memberId: body.memberId, optedOut: record.optedOut, record });
}
