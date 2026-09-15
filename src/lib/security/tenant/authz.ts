/**
 * Tenant authorization — the fail-closed boundary gate (HW-SEC / I13).
 *
 * assertTenantScope(actorScope, memberTenant): is the member's tenant/LOB within
 * the actor's authorized tenant set? This runs BEFORE (and in addition to) the
 * existing member-scope check, so even an 'org'-scoped reviewer cannot reach a
 * member outside their tenant/LOB. Fail-closed: an empty scope, an unresolved
 * tenant, or an out-of-scope LOB is a DENY.
 */

import type { Principal, PrincipalSession, AccessDecision } from '@/lib/authz/principal';
import { canAccessMember } from '@/lib/authz/principal';
import { resolveMemberTenant, resolveActorTenantScope } from './resolve';
import type { TenantContext, TenantScope, TenantAccessDecision } from './types';

/** Is the member's tenant within the actor's authorized tenant scope? */
export function assertTenantScope(
  actorScope: TenantScope,
  memberTenant: TenantContext
): TenantAccessDecision {
  // The permissive demo disposition: a single demo tenant, everything inside it.
  if (actorScope.kind === 'demo') {
    const ok = memberTenant.tenantId === actorScope.tenantIds[0];
    return { allow: ok, reason: ok ? 'demo single-tenant' : 'member outside demo tenant' };
  }
  if (!actorScope.tenantIds.length) {
    return { allow: false, reason: 'actor has no tenant scope (fail-closed)' };
  }
  const tenantOk = actorScope.tenantIds.includes(memberTenant.tenantId);
  if (!tenantOk) {
    return { allow: false, reason: 'member belongs to a different tenant' };
  }
  if (actorScope.lobs && actorScope.lobs.length && !actorScope.lobs.includes(memberTenant.lob)) {
    return { allow: false, reason: 'member LOB outside actor LOB scope' };
  }
  return { allow: true, reason: 'within tenant scope' };
}

/**
 * The composed, tenant-aware member access decision the routes should call.
 * BOTH gates must allow: the tenant boundary (this iteration) AND the existing
 * member scope (self/panel/org). The tenant gate is evaluated first so a
 * cross-tenant attempt is denied even for an org-scoped principal.
 */
export function canAccessMemberTenantAware(
  principal: Principal,
  session: PrincipalSession | null | undefined,
  memberId: string | null | undefined
): AccessDecision {
  const actorScope = resolveActorTenantScope(principal, session);
  const memberTenant = resolveMemberTenant(memberId);
  const tenant = assertTenantScope(actorScope, memberTenant);
  if (!tenant.allow) {
    return { allow: false, reason: `tenant boundary: ${tenant.reason}` };
  }
  return canAccessMember(principal, memberId);
}
