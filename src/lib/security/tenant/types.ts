/**
 * Tenant / plan / line-of-business boundary — types (HW-SEC / I13).
 *
 * The keystone data-model concept of the hardening program (program-spine
 * contract C-TEN). A payer platform is multi-tenant: an operational reviewer with
 * organization-wide reach (MemberScope 'org') must STILL be bounded to their
 * tenant / plan / line-of-business. Today's `canAccessMember` allows any member
 * under 'org' scope — the security lens flagged this as the cross-tenant / cross-LOB
 * isolation gap (2 Crit). This module adds the tenant dimension ABOVE member scope,
 * fail-closed, seam-gated so the single-tenant demo is unaffected.
 */

/** Regulated lines of business a payer plan runs under. */
export const LINES_OF_BUSINESS = Object.freeze([
  'medicare-advantage',
  'medicaid',
  'commercial',
  'aca-exchange',
  'dsnp', // dual-eligible special needs
  'unknown',
] as const);
export type LineOfBusiness = (typeof LINES_OF_BUSINESS)[number];

/** The tenant/plan/LOB a resource (member record) belongs to. */
export interface TenantContext {
  /** The isolating boundary — the health plan / payer organization id. */
  tenantId: string;
  /** The specific benefit plan / contract within the tenant, when known. */
  planId?: string;
  /** The line of business the plan runs under. */
  lob: LineOfBusiness;
}

/**
 * The set of tenants an acting principal is authorized within.
 *  - single : bounded to exactly one tenant (the production norm — from IdP claims).
 *  - multi  : an explicit set (a cross-plan ops role, rare, must be enumerated).
 *  - demo   : the MOCK disposition — the single demo tenant, permissive so the
 *             frontend-only demo is unaffected (constraint #2/#3). Never used in production.
 */
export interface TenantScope {
  kind: 'single' | 'multi' | 'demo';
  tenantIds: string[];
  /** Optional LOB restriction: when set, access is further bounded to these LOBs. */
  lobs?: LineOfBusiness[];
}

/** A tenant access decision, PHI-safe (reason names the boundary, never member data). */
export interface TenantAccessDecision {
  allow: boolean;
  reason: string;
}

/** The single demo tenant id — every authored demo member resolves here. */
export const DEMO_TENANT_ID = 'tenant-demo';
