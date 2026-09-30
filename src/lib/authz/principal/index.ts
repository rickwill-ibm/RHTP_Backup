/**
 * Session-principal role model (plan Iteration 3, security closeout).
 *
 * getPrincipal(session)  — derive the acting principal (user + role + authorized
 *                          member scope) from non-secret session facts.
 * canAccessMember(p, id) — decide whether that principal may access a member,
 *                          scope-checked: a member is self-only, a reviewer is
 *                          allowed within their authorized scope (panel or org).
 *
 * This REPLACES the hardcoded `role:'pa-reviewer'` and the request-supplied
 * member id that the evidence + financial-clearance routes previously trusted.
 * Pure and unit-testable: no I/O, no cookies. The route reads the session facts
 * via smartSession.getSessionAuthContext() and passes them in.
 */
import type { Role } from '@/lib/authz/guard';
import type { Principal, PrincipalSession, MemberScope, AccessDecision } from './types';

export type { Principal, PrincipalSession, MemberScope, AccessDecision, Role } from './types';

/**
 * The runtime role vocabulary — the SINGLE source of truth for role parsing.
 * Exported so the session layer parses an IdP claim against this list rather than
 * keeping a second copy that could drift (§5.4, one shape / one source).
 */
export const KNOWN_ROLES: readonly Role[] = [
  'member',
  'provider',
  'payer-ops',
  'pa-reviewer',
  'care-manager',
  'admin',
  'auditor',
];

/**
 * Parse an UNTRUSTED role value — an IdP claim, a field opened out of a session
 * cookie — into the role vocabulary (§5.3, parse at the boundary). Anything that
 * is not exactly one known role yields `undefined`; the caller then holds NO role
 * and must fall back to a fail-closed derivation. This is the one place a string
 * becomes authority, so it is the one place that decides what a role may be.
 */
export function parseRole(value: unknown): Role | undefined {
  if (typeof value !== 'string') return undefined;
  return KNOWN_ROLES.find((known) => known === value);
}

/**
 * Roles whose authorization envelope is a single member (self-access only).
 * Everything else is an operational role with panel/org reach.
 */
function isSelfOnlyRole(role: Role): boolean {
  return role === 'member';
}

/**
 * Derive the role from the session. An explicit IdP-supplied role wins; else we
 * read the SMART fhirUser resource type (Practitioner => reviewer-class,
 * Patient/RelatedPerson => member). When nothing identifies the caller we fail
 * SECURE and treat them as a self-only member.
 *
 * A role the session ASSERTS is authority, so it is parsed, never trusted — and a
 * present-but-UNRECOGNISED value fails CLOSED to the self-only `member` role
 * instead of falling through to the fhirUser derivation. The fall-through would
 * promote a Practitioner session to `pa-reviewer` on the strength of a role string
 * the vocabulary just rejected, which is a misconfigured claim silently buying
 * more authority than an absent one.
 */
function deriveRole(session: PrincipalSession): Role {
  if (session.role !== undefined && session.role !== null) {
    const parsed = parseRole(session.role);
    return parsed === undefined ? 'member' : parsed;
  }
  const fhirUser = (session.fhirUser ?? '').trim();
  if (fhirUser.startsWith('Practitioner/')) return 'pa-reviewer';
  if (fhirUser.startsWith('Patient/') || fhirUser.startsWith('RelatedPerson/')) {
    return 'member';
  }
  return 'member';
}

function deriveUserId(session: PrincipalSession, role: Role): string {
  const fhirUser = (session.fhirUser ?? '').trim();
  if (fhirUser) return fhirUser;
  if (role === 'member' && session.patient) return `Patient/${session.patient}`;
  return 'session-user';
}

function deriveScope(session: PrincipalSession, role: Role): MemberScope {
  if (isSelfOnlyRole(role)) {
    return { kind: 'self', memberId: session.patient ?? undefined };
  }
  const panel = session.panel?.filter((m) => typeof m === 'string' && m.length > 0);
  if (panel && panel.length > 0) return { kind: 'panel', panel };
  return { kind: 'org' };
}

/** Derive the acting principal from non-secret session facts. */
export function getPrincipal(session: PrincipalSession | null | undefined): Principal {
  const s = session ?? {};
  const role = deriveRole(s);
  return {
    userId: deriveUserId(s, role),
    role,
    authorizedMemberScope: deriveScope(s, role),
  };
}

/**
 * Decide whether the principal may access the given member record.
 * PHI-safe: the reason string names the scope decision, never member data.
 */
export function canAccessMember(
  principal: Principal,
  memberId: string | null | undefined
): AccessDecision {
  if (!memberId) {
    return { allow: false, reason: 'no target member resolved' };
  }
  const scope = principal.authorizedMemberScope;
  switch (scope.kind) {
    case 'self': {
      const ok = !!scope.memberId && scope.memberId === memberId;
      return {
        allow: ok,
        reason: ok ? 'member self-access' : 'member may only access their own record',
      };
    }
    case 'panel': {
      const ok = !!scope.panel && scope.panel.includes(memberId);
      return {
        allow: ok,
        reason: ok
          ? `${principal.role} panel access`
          : `${principal.role} requested member outside assigned panel`,
      };
    }
    case 'org':
      return { allow: true, reason: `${principal.role} organization-wide access` };
  }
}

/**
 * Ops-scoped roles: an operational/admin principal that may work the reliability
 * surfaces (the dead-letter / held-review ops queue, NS-01). Deliberately EXCLUDES
 * pa-reviewer — the clinical PA reviewer is a distinct surface (no second inbox),
 * and a member/provider is never ops. `payer-ops` and `admin` are the existing
 * operational roles in the guard vocabulary; no new role is introduced.
 */
const OPS_ROLES: readonly Role[] = ['payer-ops', 'admin'];

/** True when the principal holds an ops/admin role (dead-letter ops authz). */
export function isOpsPrincipal(principal: Principal): boolean {
  return OPS_ROLES.includes(principal.role);
}

/**
 * The permitted-purpose to pass to canReadMemberData for a principal's role, so
 * the existing role/purpose policy (src/lib/authz/guard.ts) runs as a second,
 * defense-in-depth gate driven by the REAL session role (not a constant).
 */
export function purposeForRole(role: Role): import('@/lib/authz/guard').Purpose {
  switch (role) {
    case 'member':
      return 'patient-request';
    case 'provider':
    case 'care-manager':
      return 'treatment';
    case 'auditor':
      return 'audit';
    default:
      return 'operations';
  }
}

/**
 * References that are PLACEHOLDERS, not a real human of record.
 *
 * ONE list, because there were three. `approvalAuthority.isNonIdentity`,
 * `decisionGate.isNonAutomatedDecider` and `credentialing.assertReviewerQualified` each encoded
 * `'' | 'session-user' | 'unknown'` as literals, and they did not normalise the same way — one
 * lowercased first, two did not, so `'Session-User'` was refused by one and accepted by another.
 * They then produced DIFFERENT refusal codes, and the code is what member appeal rights turn on.
 *
 * The wave that fixed "two reviewer-authorization mechanisms disagreeing about the placeholder
 * identity" shipped a third. This is that, undone.
 *
 * `'session-user'` is what `deriveUserId` returns when a session carries no `fhirUser` — a real,
 * reachable value on the dev path, not a hypothetical.
 */
export const PLACEHOLDER_IDENTITIES: ReadonlySet<string> = new Set(['', 'session-user', 'unknown']);

/** Is this reference a placeholder rather than a person? Normalises once, for every caller. */
export function isPlaceholderIdentity(reference: string | null | undefined): boolean {
  return PLACEHOLDER_IDENTITIES.has((reference ?? '').trim().toLowerCase());
}
