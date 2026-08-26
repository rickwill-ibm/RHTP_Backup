/**
 * BFF: invoke CRD (CDS Hooks) — plan Slice 4.
 * POST { hookId, hookRequest } → cards.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { getPrincipal } from '@/lib/authz/principal';
import { invokeCrd } from '@/lib/server/cdsClient';
import { correlationFrom } from '@/lib/server/correlation';
import { ooError } from '@/lib/fhir/operationOutcome';
import { devMockEnabled, devCrdCards } from '@/lib/server/devStubs';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), { status: 401 });
  }

  // Attributable audit (CMS-0057-F accounting-of-disclosures): the resolved acting
  // principal, not a hardcoded 'session-user' placeholder.
  const actorId = getPrincipal(await getSessionAuthContext().catch(() => null)).userId;
  // Extract patientId from the hook request context for patient-aware mock data
  const bodyForContext = (await req
    .clone()
    .json()
    .catch(() => null)) as { hookRequest?: { context?: { patientId?: string } } } | null;
  const hookPatientId = bodyForContext?.hookRequest?.context?.patientId ?? undefined;
  if (devMockEnabled()) {
    return NextResponse.json({ cards: devCrdCards(hookPatientId), correlationId });
  }
  const body = (await req.json().catch(() => null)) as {
    hookId?: string;
    hookRequest?: unknown;
  } | null;
  if (!body?.hookId) {
    return NextResponse.json(ooError('hookId required', 'required'), { status: 400 });
  }
  const result = await invokeCrd(body.hookId, body.hookRequest ?? {}, {
    actor: actorId,
    correlationId,
  });
  return NextResponse.json(
    { cards: result.cards, correlationId: result.correlationId },
    {
      status: result.ok ? 200 : result.status || 502,
    }
  );
}
