/**
 * Tenant resolution — seam-gated (HW-SEC / I13).
 *
 * resolveMemberTenant(memberId): the tenant/plan/LOB a member record belongs to.
 * resolveActorTenantScope(principal, session): the tenants the actor may reach.
 *
 * dataMode seam `tenancy`:
 *  - mock/seeded (demo): every authored member resolves to the single DEMO tenant,
 *    and every actor is scoped to it — so the demo runs exactly as today (constraint #2).
 *  - production: the member's tenant/plan/LOB is derived from the record's payer/
 *    contract, and the actor's scope comes from verified IdP claims (session).
 */

import { getDataMode } from '@/lib/config/dataMode';
import { getPatientById } from '@/lib/patientRegistry';
import type { Principal, PrincipalSession } from '@/lib/authz/principal';
import {
  DEMO_TENANT_ID,
  type TenantContext,
  type TenantScope,
  type LineOfBusiness,
} from './types';

/** Map a free-text payer string to a regulated line of business. */
export function lobFromPayer(payer: string | undefined | null): LineOfBusiness {
  const p = (payer ?? '').toLowerCase();
  if (p.includes('advantage') || p.includes(' ma')) return 'medicare-advantage';
  if (p.includes('dsnp') || p.includes('dual')) return 'dsnp';
  if (p.includes('medicare')) return 'medicare-advantage';
  if (p.includes('medicaid')) return 'medicaid';
  if (p.includes('exchange') || p.includes('aca') || p.includes('marketplace')) return 'aca-exchange';
  if (p.includes('commercial') || p.includes('employer') || p.includes('group')) return 'commercial';
  return 'unknown';
}

/**
 * The tenant context for a member. In demo/mock every member is the demo tenant.
 * In production the tenant is the member's payer organization; plan = contractId;
 * LOB derived from the payer. Fail-closed: an unresolvable member yields the
 * 'unknown' LOB under a distinct per-member tenant so it can never match a real scope.
 */
export function resolveMemberTenant(memberId: string | null | undefined): TenantContext {
  const mode = getDataMode('tenancy');
  if (mode !== 'production') {
    return { tenantId: DEMO_TENANT_ID, planId: 'contract-001', lob: 'medicare-advantage' };
  }
  if (!memberId) return { tenantId: `unresolved:${String(memberId)}`, lob: 'unknown' };
  const member = getPatientById(memberId) as { contractId?: string; payer?: string } | null;
  if (!member) return { tenantId: `unresolved:${memberId}`, lob: 'unknown' };
  // Production tenant id is the payer organization; contract is the plan.
  const tenantId = member.payer ? `tenant:${member.payer}` : `unresolved:${memberId}`;
  return { tenantId, planId: member.contractId, lob: lobFromPayer(member.payer) };
}

/**
 * The tenant scope of an acting principal. Demo/mock -> the single demo tenant
 * (permissive, demo intact). Production -> the verified tenant claim(s) on the
 * session; absent a claim we fail CLOSED to an empty single scope (reaches no member).
 */
export function resolveActorTenantScope(
  principal: Principal,
  session: PrincipalSession | null | undefined,
): TenantScope {
  const mode = getDataMode('tenancy');
  if (mode !== 'production') {
    return { kind: 'demo', tenantIds: [DEMO_TENANT_ID] };
  }
  // Production: the IdP must supply the tenant claim on the session. We read it
  // from an extended session field; absent/blank -> empty scope (fail closed).
  const claim = readTenantClaim(session);
  if (!claim.tenantIds.length) {
    return { kind: 'single', tenantIds: [] };
  }
  return claim;
}

/**
 * Read verified tenant claims off the session. Kept small + explicit: the session
 * may carry `tenantId` (single) or `tenantIds`/`lobs` (an enumerated multi ops role).
 * Only ids that are non-empty strings are honored.
 */
function readTenantClaim(session: PrincipalSession | null | undefined): TenantScope {
  const s = (session ?? {}) as Record<string, unknown>;
  const ids: string[] = [];
  if (typeof s.tenantId === 'string' && s.tenantId) ids.push(s.tenantId);
  if (Array.isArray(s.tenantIds)) {
    for (const t of s.tenantIds) if (typeof t === 'string' && t) ids.push(t);
  }
  const lobs = Array.isArray(s.lobs)
    ? (s.lobs.filter((l) => typeof l === 'string') as LineOfBusiness[])
    : undefined;
  const unique = [...new Set(ids)];
  return { kind: unique.length > 1 ? 'multi' : 'single', tenantIds: unique, lobs };
}
