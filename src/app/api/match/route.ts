/**
 * BFF: $member-match — plan Slice 2 (Provider Access) / Slice 3 (P2P).
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { getPrincipal } from '@/lib/authz/principal';
import { memberMatch } from '@/lib/server/memberMatch';
import { correlationFrom } from '@/lib/server/correlation';
import { ooError } from '@/lib/fhir/operationOutcome';
import { devMockEnabled, devMemberMatch } from '@/lib/server/devStubs';
import { getProviderAccessConsentStore } from '@/lib/consent/providerAccessOptOut';
import { audit } from '@/lib/server/audit';
import { getPatientById } from '@/lib/patientRegistry';

export const runtime = 'nodejs';

/** Pull the MemberPatient id out of a $member-match Parameters body. */
function matchedMemberId(parameters: unknown): string | undefined {
  try {
    const params = parameters as {
      parameter?: { name?: string; resource?: { id?: string } }[];
    };
    const id = params?.parameter?.find((p) => p.name === 'MemberPatient')?.resource?.id;
    return typeof id === 'string' && id.trim().length > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}

/** Structural validation of a FHIR `$member-match` Parameters resource: a non-null object with
 *  `resourceType: 'Parameters'` and a `parameter` array. Enforced at the boundary (parse-don't-validate)
 *  BEFORE the mock/consent/engine paths — a malformed body must never be answered with a default
 *  member identity. (The MemberPatient selector itself is checked separately, so an empty/selector-less
 *  envelope is also rejected rather than defaulting to a seed member and silently skipping consent.) */
function isValidParametersBody(
  body: unknown
): body is { resourceType: string; parameter: unknown[] } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const b = body as { resourceType?: unknown; parameter?: unknown };
  return b.resourceType === 'Parameters' && Array.isArray(b.parameter);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), { status: 401 });
  }

  // Attributable audit (CMS-0057-F accounting-of-disclosures): the resolved acting
  // principal, not a hardcoded 'session-user' placeholder.
  const actorId = getPrincipal(await getSessionAuthContext().catch(() => null)).userId;
  const parameters = await req.json().catch(() => null);

  // BOUNDARY VALIDATION (parse-don't-validate, conventions §5): reject a malformed or selector-less
  // Parameters body with a PHI-safe 400 BEFORE the mock/consent/engine paths. Without this, dev-mock
  // short-circuited to a default member identity (200) for a garbage body, and a valid-but-selector-less
  // body both leaked the seed member AND skipped the consent gate (which is keyed on the member id).
  if (!isValidParametersBody(parameters)) {
    return NextResponse.json(
      ooError('A valid $member-match Parameters body is required', 'required'),
      { status: 400 }
    );
  }
  const pid = matchedMemberId(parameters);
  if (!pid) {
    return NextResponse.json(
      ooError('A MemberPatient parameter with a member id is required', 'required'),
      { status: 400 }
    );
  }

  // CONSENT GATE (CMS-0057-F): a member who has opted out of Provider Access
  // data sharing must not have their identity released, regardless of treatment
  // relationship. Break-glass emergency access overrides, and is always audited.
  // SEAM: consent — lib/consent/providerAccessOptOut.ts.
  const breakGlass = req.headers.get('x-break-glass') === 'true';
  if (pid && getProviderAccessConsentStore().isOptedOut(pid)) {
    await audit({
      ts: new Date().toISOString(),
      actor: actorId,
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
    // Resolve the member against the registry BEFORE disclosing. Without this, an unknown-but-well-formed
    // id fell through to `devMemberMatch`'s `?? MARIA_SD_001` default and returned the SEED member's
    // demographics mislabeled under the requested id — a cross-member mis-attribution. An unknown member
    // is a PHI-safe 404, never a defaulted identity. Runs AFTER the consent gate (an opted-out member
    // resolves to 403 first), and is exempted for an audited break-glass emergency override so emergency
    // access is never blocked by registry membership.
    if (!breakGlass && !getPatientById(pid)) {
      return NextResponse.json(ooError('No matching member', 'not-found'), { status: 404 });
    }
    // Accounting-of-disclosures (CMS-0057-F): a successful identity release is a disclosure and must be
    // audited — the live path audits inside memberMatch(); the dev-mock path must not be a silent gap.
    await audit({
      ts: new Date().toISOString(),
      actor: actorId,
      action: 'member-match',
      resourceRef: `Patient/${pid}`,
      correlationId,
      outcome: 'success',
      detail: breakGlass ? 'dev-mock member-match (break-glass)' : 'dev-mock member-match',
    });
    return NextResponse.json(devMemberMatch(pid));
  }
  const result = await memberMatch(parameters, { actor: actorId, correlationId });
  return NextResponse.json(
    result.ok ? result.result : ooError('member-match failed', 'processing'),
    {
      status: result.ok ? 200 : result.status || 502,
    }
  );
}
