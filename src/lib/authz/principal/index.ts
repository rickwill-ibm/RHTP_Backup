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
import type {
  Principal,
  PrincipalSession,
  MemberScope,
  AccessDecision,
} from './types';

export type {
  Principal,
  PrincipalSession,
  MemberScope,
  AccessDecision,
  Role,
} from './types';

const KNOWN_ROLES: readonly Role[] = [
  'member',
  'provider',
  'payer-ops',
  'pa-reviewer',
  'care-manager',
  'admin',
  'auditor',
];

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
 */
function deriveRole(session: PrincipalSession): Role {
  if (session.role && KNOWN_ROLES.includes(session.role)) return session.role;
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
        reason: ok
          ? 'member self-access'
          : 'member may only access their own record',
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
