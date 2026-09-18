/**
 * Session-principal role model — types (plan Iteration 3, security closeout).
 *
 * A Principal is the ACTING identity derived from the session: who is calling
 * (userId), in what role, and which members they are authorized to touch
 * (authorizedMemberScope). This replaces the hardcoded `role:'pa-reviewer'` and
 * the request-supplied member id that the evidence + financial-clearance routes
 * previously trusted (cycle-3 IDOR / MEDIUM #3).
 *
 * Roles reuse the existing authz vocabulary (src/lib/authz/guard.ts) so this
 * model does not introduce a second, conflicting role system.
 */
import type { Role } from '@/lib/authz/guard';

export type { Role };

/**
 * The authorization envelope of a principal over member records.
 *  - self  : may only touch their own member record (member role).
 *  - panel : may touch an explicitly assigned set of members (a reviewer /
 *            care-manager working a bounded panel).
 *  - org   : may touch any member in the organization (an unbounded ops role).
 *
 * `org` is the current production default for reviewer roles (the demo runs a
 * reviewer workflow with organization-wide reach); `panel` is the enforced,
 * narrower model for when panel-assignment data is wired (see README remainder).
 */
export interface MemberScope {
  kind: 'self' | 'panel' | 'org';
  /** For kind 'self': the single member the session is scoped to. */
  memberId?: string;
  /** For kind 'panel': the explicit set of authorized member ids. */
  panel?: string[];
}

/** The acting principal derived from a session. */
export interface Principal {
  /** Stable id of the acting user (the fhirUser reference, or a safe fallback). */
  userId: string;
  role: Role;
  authorizedMemberScope: MemberScope;
}

/**
 * The non-secret session facts getPrincipal derives a Principal from. All fields
 * are ids / scopes / references — never a token. Mirrors what
 * smartSession.getSessionAuthContext() exposes.
 */
export interface PrincipalSession {
  /** launch/patient context — the member a member-scoped session may read. */
  patient?: string | null;
  /** SMART fhirUser reference, e.g. 'Practitioner/x' (reviewer) or 'Patient/x' (member). */
  fhirUser?: string | null;
  /** SMART granted scopes (reserved for future scope narrowing). */
  scope?: string | null;
  /** Explicit assigned member panel for a reviewer, when available. */
  panel?: string[] | null;
  /** Explicit role from the IdP, when the session carries one (wins over derivation). */
  role?: Role | null;
}

/** Result of an access decision, PHI-safe (reason carries no member data). */
export interface AccessDecision {
  allow: boolean;
  reason: string;
}

// ── I8A-iii Wave A (value-set governance roles) — appended block ───────────────
// Governance-specific role set for the terminology value-set lifecycle. Kept
// ADDITIVE and separate from the core authz `Role` union (guard.ts) so the
// exhaustive ALLOWED_PURPOSE record is not disturbed. A `value-set-steward`
// authors and submits draft versions (the MAKER); a `value-set-reviewer`
// approves or rejects a version under review (the CHECKER). Waves B (UI) and C
// (routes) consume these two roles + GovernancePrincipal.
export const GOVERNANCE_ROLES = Object.freeze(['value-set-steward', 'value-set-reviewer'] as const);
export type GovernanceRole = (typeof GOVERNANCE_ROLES)[number];

/** The acting identity for a value-set governance action (id + governance role). */
export interface GovernancePrincipal {
  /** Stable id of the acting user (matched for separation-of-duties). */
  userId: string;
  role: GovernanceRole;
}

/** True when a value is one of the two governance roles. */
export function isGovernanceRole(value: unknown): value is GovernanceRole {
  return typeof value === 'string' && (GOVERNANCE_ROLES as readonly string[]).includes(value);
}
