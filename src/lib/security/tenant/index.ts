/**
 * security/tenant — the tenant/plan/LOB boundary (HW-SEC / I13), program-spine
 * contract C-TEN. Every durable store, graph query, and BFF read that touches a
 * member must be tenant-scoped through this module. Seam-gated (`tenancy`): mock =
 * the single demo tenant (demo intact); production = per-record tenant + IdP-claim
 * actor scope, fail-closed.
 */
export {
  LINES_OF_BUSINESS,
  DEMO_TENANT_ID,
  type LineOfBusiness,
  type TenantContext,
  type TenantScope,
  type TenantAccessDecision,
} from './types';
export { resolveMemberTenant, resolveActorTenantScope, lobFromPayer } from './resolve';
export { assertTenantScope, canAccessMemberTenantAware } from './authz';
