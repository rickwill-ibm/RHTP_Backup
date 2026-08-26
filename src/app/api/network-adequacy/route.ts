/**
 * BFF: Network Adequacy (increment NA-2).
 *
 * GET  ?state=SD           -> adequacy summary (metrics + prioritized gaps)
 * POST { query, defaultState } -> interactive assistant answer (deterministic)
 *
 * Authenticated + flag-gated + audited. Operates on provider/geo aggregates
 * (no member PHI). The AI/LLM narration layer is gated separately by
 * `networkAdequacyAI` (not required -- the assistant is deterministic).
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { getPrincipal } from '@/lib/authz/principal';
import { ooError } from '@/lib/fhir/operationOutcome';
import { correlationFrom } from '@/lib/server/correlation';
import { audit } from '@/lib/server/audit';
import { flag } from '@/lib/flags/flags';
import { loadMockNetwork, computeMetrics, computeGaps, runAssistant } from '@/lib/networkAdequacy';

export const runtime = 'nodejs';

function guard(): NextResponse | null {
  if (!flag('networkAdequacy')) {
    return NextResponse.json(ooError('Network Adequacy not enabled', 'not-supported'), {
      status: 404,
    });
  }
  return null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const blocked = guard();
  if (blocked) return blocked;
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), { status: 401 });
  }
  const state = req.nextUrl.searchParams.get('state') || undefined;
  const specialty = req.nextUrl.searchParams.get('specialty') || undefined;
  const net = loadMockNetwork();
  const metrics = computeMetrics(net, { state, specialty });
  const gaps = computeGaps(net, { state, specialty });
  return NextResponse.json({ state: state ?? 'ALL', metrics, gaps }, { status: 200 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = guard();
  if (blocked) return blocked;
  const correlationId = correlationFrom(req.headers);
  if (!(await isAuthenticated().catch(() => false))) {
    return NextResponse.json(ooError('Not authenticated', 'login'), { status: 401 });
  }

  // Attributable audit (CMS-0057-F accounting-of-disclosures): the resolved acting
  // principal, not a hardcoded 'session-user' placeholder.
  const actorId = getPrincipal(await getSessionAuthContext().catch(() => null)).userId;
  const body = (await req.json().catch(() => null)) as {
    query?: unknown;
    defaultState?: unknown;
  } | null;
  if (!body || typeof body.query !== 'string' || body.query.trim().length === 0) {
    return NextResponse.json(ooError('query (string) required', 'required'), { status: 400 });
  }
  if (body.query.length > 500) {
    return NextResponse.json(ooError('query too long', 'invalid'), { status: 400 });
  }
  try {
    const defaultState = typeof body.defaultState === 'string' ? body.defaultState : undefined;
    const response = runAssistant(body.query, loadMockNetwork(), { defaultState });
    await audit({
      ts: new Date().toISOString(),
      actor: actorId,
      action: 'network-adequacy.assist',
      correlationId,
      outcome: 'success',
      detail: `intent=${response.intent} scope=${JSON.stringify(response.scope)}`,
    });
    return NextResponse.json(response, { status: 200 });
  } catch {
    return NextResponse.json(ooError('Failed to run assistant', 'exception'), { status: 500 });
  }
}
