/**
 * Value-set governance BFF — shared authz + validation kit (Iteration 8a-iii, Wave C).
 *
 * Keeps every route.ts a THIN authz+validation layer over the governance port.
 * Role-gating maps the governance roles Wave A adds to the authz vocabulary
 * (value-set-steward, value-set-reviewer) onto the two governance capabilities:
 *   - steward  : submit, reject, retire
 *   - reviewer : approve
 *   - both     : replay, history
 *
 * E9 (fail-closed): an unauthenticated or wrong-role governance action returns
 * 401/403 and NEVER default-allows. PHI-safe: bodies are ids/versions/states.
 *
 * The governance role is read from the RAW session auth context so this slice is
 * resilient to Wave A not yet having extended the Role union — the string role
 * ('value-set-steward' | 'value-set-reviewer') is matched directly. The acting
 * user id comes from getPrincipal (fhirUser reference), never PHI.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAuthenticated, getSessionAuthContext } from '@/lib/server/smartSession';
import { getPrincipal } from '@/lib/authz/principal';
import { ooError } from '@/lib/fhir/operationOutcome';
import { correlationFrom } from '@/lib/server/correlation';
import { audit } from '@/lib/server/audit';

/** The two governance capabilities, derived from the authz role. */
export type GovRole = 'steward' | 'reviewer';

/** Brief-specified authz role literals added by Wave A to the guard vocabulary. */
export const ROLE_STEWARD = 'value-set-steward';
export const ROLE_REVIEWER = 'value-set-reviewer';

export interface GovActor {
  /** Stable principal id (fhirUser reference) — used for maker-checker identity. */
  userId: string;
  /** Governance capability, or null when the caller holds neither governance role. */
  govRole: GovRole | null;
}

/** Map a raw session role string onto a governance capability. */
function toGovRole(rawRole: unknown): GovRole | null {
  if (rawRole === ROLE_STEWARD) return 'steward';
  if (rawRole === ROLE_REVIEWER) return 'reviewer';
  return null;
}

/** Resolve the acting governance principal from the session (PHI-free). */
export async function resolveGovActor(): Promise<{ authenticated: boolean; actor: GovActor }> {
  const authed = await isAuthenticated().catch(() => false);
  const ctx = await getSessionAuthContext().catch(() => null);
  const principal = getPrincipal(ctx);
  const rawRole = (ctx as { role?: unknown } | null)?.role;
  return {
    authenticated: authed,
    actor: { userId: principal.userId, govRole: toGovRole(rawRole) },
  };
}

/** 401 fail-closed body (PHI-free). */
export function unauthenticated(): NextResponse {
  return NextResponse.json(ooError('Not authenticated', 'login'), { status: 401 });
}

/** 403 fail-closed body (PHI-free). */
export function forbidden(reason: string): NextResponse {
  return NextResponse.json(ooError(reason, 'forbidden'), { status: 403 });
}

/** 400 validation body (PHI-free). */
export function badRequest(reason: string): NextResponse {
  return NextResponse.json(ooError(reason, 'invalid'), { status: 400 });
}

/** 500 body (PHI-free, never echoes the raw error). */
export function serverError(reason: string): NextResponse {
  return NextResponse.json(ooError(reason, 'exception'), { status: 500 });
}

/**
 * Gate: require authentication AND one of the allowed governance roles.
 * Returns the actor on success, or the fail-closed response to return.
 */
export async function requireGovRole(
  allowed: GovRole[]
): Promise<{ ok: true; actor: GovActor } | { ok: false; res: NextResponse }> {
  const { authenticated, actor } = await resolveGovActor();
  if (!authenticated) return { ok: false, res: unauthenticated() };
  if (!actor.govRole || !allowed.includes(actor.govRole)) {
    return {
      ok: false,
      res: forbidden(
        `governance action requires role ${allowed
          .map((r) => (r === 'steward' ? ROLE_STEWARD : ROLE_REVIEWER))
          .join(' or ')}`
      ),
    };
  }
  return { ok: true, actor };
}

// ── Request body validation (ids/versions only — never PHI) ──────────────────

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export interface ParsedMutation {
  valueSetId: string;
  version: string;
}

/** Parse + validate a { valueSetId, version } body. */
export async function parseMutationBody(
  req: NextRequest,
  requireVersion: boolean
): Promise<{ ok: true; value: ParsedMutation } | { ok: false; res: NextResponse }> {
  const body = (await req.json().catch(() => null)) as {
    valueSetId?: unknown;
    version?: unknown;
  } | null;
  if (!body || typeof body !== 'object') {
    return { ok: false, res: badRequest('JSON body required') };
  }
  const valueSetId = body.valueSetId;
  if (typeof valueSetId !== 'string' || !ID_PATTERN.test(valueSetId)) {
    return { ok: false, res: badRequest('valueSetId is required and must be a valid identifier') };
  }
  const version = typeof body.version === 'string' ? body.version : '';
  if (requireVersion) {
    if (!VERSION_PATTERN.test(version)) {
      return {
        ok: false,
        res: badRequest('version is required and must be a valid version token'),
      };
    }
  } else if (version && !VERSION_PATTERN.test(version)) {
    return { ok: false, res: badRequest('version must be a valid version token') };
  }
  return { ok: true, value: { valueSetId, version } };
}

/** Emit a PHI-free governance audit event. */
export async function auditGov(
  req: NextRequest,
  actor: string,
  action: string,
  valueSetId: string,
  outcome: 'success' | 'failure',
  detail?: string
): Promise<void> {
  await audit({
    ts: new Date().toISOString(),
    actor,
    action,
    resourceRef: `ValueSet/${valueSetId}`,
    correlationId: correlationFrom(req.headers),
    outcome,
    detail,
  });
}

/** PHI-free wire projection of a governance record. */
export function recordToWire(record: {
  valueSetId: string;
  version: string;
  state: string;
  submittedBy?: string;
  approvedBy?: string;
  updatedAt: string;
}): Record<string, unknown> {
  return {
    valueSetId: record.valueSetId,
    version: record.version,
    state: record.state,
    submittedBy: record.submittedBy,
    approvedBy: record.approvedBy,
    updatedAt: record.updatedAt,
  };
}
