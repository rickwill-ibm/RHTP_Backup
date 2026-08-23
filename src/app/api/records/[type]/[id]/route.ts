/**
 * BFF: record correction / void lifecycle (HW3 / I17, CRUD-02 + RP-01).
 *
 * PUT    /api/records/:type/:id  → submit a corrected/amended version. Content-hash
 *                                  classified: an identical resend is a no-op
 *                                  ('unchanged'), changed content is a 'correction'
 *                                  that RE-projects (RP-01).
 * DELETE /api/records/:type/:id  → mark entered-in-error ('void'); retracts prior
 *                                  state (CRUD-02). Never a hard row delete.
 *
 * Tenant-scoped (C-TEN) + reviewer/ops authz, audited to the tamper-evident ledger
 * (C-AUD). Demo-safe: the in-memory lifecycle store needs no backend.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { ooError } from '@/lib/fhir/operationOutcome';
import { correlationFrom, CORRELATION_HEADER } from '@/lib/server/correlation';
import { getPrincipal } from '@/lib/authz/principal';
import { canAccessMemberTenantAware } from '@/lib/security/tenant';
import { audit } from '@/lib/server/audit';
import { now } from '@/lib/clock';
import { getDataMode } from '@/lib/config/dataMode';
import { contentHash, getRecordLifecycleStore } from '@/lib/lifecycle';

export const runtime = 'nodejs';

const WRITE_ROLES = new Set(['pa-reviewer', 'care-manager', 'payer-ops', 'admin']);

async function authorize(req: NextRequest, memberId: string | undefined) {
  if (!(await isAuthenticated().catch(() => false))) return { ok: false as const, status: 401, reason: 'Not authenticated' };
  const authCtx = await getSessionAuthContext().catch(() => null);
  const principal = getPrincipal(authCtx);
  if (!WRITE_ROLES.has(principal.role)) return { ok: false as const, status: 403, reason: 'Record write requires a reviewer/ops role' };
  if (memberId) {
    const access = canAccessMemberTenantAware(principal, authCtx, memberId);
    if (!access.allow) return { ok: false as const, status: 403, reason: access.reason };
  }
  return { ok: true as const, principal };
}

function durable(): boolean {
  return getDataMode('wpcRecord') === 'production';
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ type: string; id: string }> }): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  const { type, id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { memberId?: string; payload?: unknown } | null;
  const auth = await authorize(req, body?.memberId);
  if (!auth.ok) return NextResponse.json(ooError(auth.reason, auth.status === 401 ? 'login' : 'forbidden'), { status: auth.status, headers: { [CORRELATION_HEADER]: correlationId } });
  if (!body || body.payload === undefined) {
    return NextResponse.json(ooError('payload is required', 'invalid'), { status: 400, headers: { [CORRELATION_HEADER]: correlationId } });
  }

  const key = `${type}/${id}`;
  const store = getRecordLifecycleStore(durable());
  const result = await store.record({ key, hash: contentHash(body.payload), status: 'active', nowMs: now() });
  await audit({
    ts: new Date().toISOString(), actor: auth.principal.userId, action: `record.${result.disposition}`,
    resourceRef: key, correlationId, outcome: 'success',
    detail: `disposition=${result.disposition}; reproject=${result.reproject}; v${result.version}`,
  });
  return NextResponse.json(
    { key, disposition: result.disposition, reproject: result.reproject, version: result.version },
    { status: result.disposition === 'new' ? 201 : 200, headers: { [CORRELATION_HEADER]: correlationId } },
  );
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ type: string; id: string }> }): Promise<NextResponse> {
  const correlationId = correlationFrom(req.headers);
  const { type, id } = await ctx.params;
  const memberId = req.nextUrl.searchParams.get('memberId') ?? undefined;
  const auth = await authorize(req, memberId);
  if (!auth.ok) return NextResponse.json(ooError(auth.reason, auth.status === 401 ? 'login' : 'forbidden'), { status: auth.status, headers: { [CORRELATION_HEADER]: correlationId } });

  const key = `${type}/${id}`;
  const store = getRecordLifecycleStore(durable());
  // entered-in-error: content hash is irrelevant to a void; pass a stable marker.
  const result = await store.record({ key, hash: 'entered-in-error', status: 'entered-in-error', nowMs: now() });
  await audit({
    ts: new Date().toISOString(), actor: auth.principal.userId, action: `record.${result.disposition}`,
    resourceRef: key, correlationId, outcome: 'success',
    detail: `entered-in-error; retract=${result.retract}; v${result.version}`,
  });
  return NextResponse.json(
    { key, disposition: result.disposition, retract: result.retract, version: result.version },
    { status: 200, headers: { [CORRELATION_HEADER]: correlationId } },
  );
}
