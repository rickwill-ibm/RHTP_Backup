/**
 * Tenant-scope enforcement for the order→cash continuation (Wave-2 W2-3).
 *
 * `requireTenantScope` is the fail-closed READ/WRITE boundary the orchestrator
 * calls BEFORE it appends or persists any financial entry: it resolves the
 * member's tenant/plan/LOB context and asserts the acting principal's tenant scope
 * covers it. On a deny (an empty/cross-tenant actor claim over a tenanted member)
 * it THROWS `TenantScopeRequiredError` so NO ledger row is ever written — the
 * throw happens before `deps.store.save`. On allow it returns the resolved tenant
 * id to stamp onto the entries (defense-in-depth).
 *
 * Seam-gated (`tenancy`): in mock/seeded the demo actor scope matches the single
 * DEMO_TENANT_ID, so this returns `{ tenant: 'tenant-demo' }` and the demo is
 * unchanged. Reuses the existing tenancy seam — no new seam is introduced.
 *
 * PHI-safe: the error message names the tenant boundary decision only, never any
 * member data.
 */
import { resolveMemberTenant, assertTenantScope, type TenantScope } from '@/lib/security/tenant';

/**
 * Raised when a tenanted member is reached by an actor whose tenant scope does not
 * cover it (cross-tenant, or an absent/blank claim in production). Fail-closed: the
 * orchestrator lets this propagate so no evidence row is written. PHI-safe message.
 */
export class TenantScopeRequiredError extends Error {
  constructor(reason: string) {
    super(`tenant scope required to record financial evidence: ${reason}`);
    this.name = 'TenantScopeRequiredError';
  }
}

/**
 * Assert the actor's tenant scope covers the member's tenant and return the tenant
 * id to stamp. Throws `TenantScopeRequiredError` (before any write) on a deny.
 */
export function requireTenantScope(memberId: string, actorScope: TenantScope): { tenant: string } {
  const ctx = resolveMemberTenant(memberId);
  const decision = assertTenantScope(actorScope, ctx);
  if (!decision.allow) {
    throw new TenantScopeRequiredError(decision.reason);
  }
  return { tenant: ctx.tenantId };
}
