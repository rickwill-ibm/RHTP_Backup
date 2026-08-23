/**
 * BFF: $member-match — plan Slice 2 (Provider Access) / Slice 3 (P2P).
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/server/smartSession';
import { memberMatch } from '@/lib/server/memberMatch';
import { correlationFrom } from '@/lib/server/correlation';
import { ooError } from '@/lib/fhir/operationOutcome';
import { devMockEnabled, devMemberMatch } from '@/lib/server/devStubs';
import { getProviderAccessConsentStore } from '@/lib/consent/providerAccessOptOut';
import { audit } from '@/lib/server/audit';

export const runtime = 'nodejs';

/** Pull the MemberPatient id out of a $member-match Parameters body. */
function matchedMemberId(parameters: unknown): string | undefined {
  try {
    const params = parameters as {
      parameter?: { name?: string; resource?: { id?: string } }[];
    };
    return params?.parameter?.find((p) => p.name === 'MemberPatient')?.resource?.id ?? undefined;
  } catch {
    return undefined;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), { status: 401 });
  }
  const parameters = await req.json().catch(() => null);
  const pid = matchedMemberId(parameters);

  // CONSENT GATE (CMS-0057-F): a member who has opted out of Provider Access
  // data sharing must not have their identity released, regardless of treatment
  // relationship. Break-glass emergency access overrides, and is always audited.
  // SEAM: consent — lib/consent/providerAccessOptOut.ts.
  const breakGlass = req.headers.get('x-break-glass') === 'true';
  if (pid && getProviderAccessConsentStore().isOptedOut(pid)) {
    await audit({
      ts: new Date().toISOString(),
      actor: 'session-user',
      action: breakGlass ? 'member-match.break-glass' : 'member-match.consent-denied',
      resourceRef: `Patient/${pid}`,
      correlationId,
      outcome: breakGlass ? 'success' : 'failure',
      detail: 'provider-access opt-out',
    });
    if (!breakGlass) {
      return NextResponse.json(
        ooError('Member has opted out of Provider Access data sharing', 'forbidden'),
        { status: 403 }
      );
    }
  }

  if (devMockEnabled()) {
    return NextResponse.json(devMemberMatch(pid));
  }
  if (!parameters) {
    return NextResponse.json(ooError('Parameters body required', 'required'), { status: 400 });
  }
  const result = await memberMatch(parameters, { actor: 'session-user', correlationId });
  return NextResponse.json(
    result.ok ? result.result : ooError('member-match failed', 'processing'),
    {
      status: result.ok ? 200 : result.status || 502,
    }
  );
}
