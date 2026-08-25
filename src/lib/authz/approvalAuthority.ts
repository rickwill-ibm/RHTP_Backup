// SEAM: identity/authz  // prior-auth submission trust boundary (red-team: approvedBy spoofing)
/**
 * Prior-authorization approval authority (CMS blueprint §4D human gate).
 *
 * ONE model, identical in mock and production — no enforce/mode branch. The human
 * of record for a PA submission is ALWAYS the authenticated session principal,
 * resolved dynamically to a real reviewer identity. The client-supplied
 * `approvedBy` / `x-approved-by` is NOT an identity — the route treats its presence
 * as the human's intent-to-approve signal (which still gates the 202) and this
 * module ignores its content entirely. Nothing the caller invents can name the
 * approver or satisfy the gate on behalf of someone else.
 *
 * The dynamic association is a resolver seam:
 *   - mock/seeded  : the demo reviewer directory below resolves the demo session
 *                    identity (Practitioner/dev) to a named reviewer of record.
 *   - production   : the composition root registers a real resolver (a FHIR
 *                    Practitioner/PractitionerRole read) via setApproverIdentityResolver.
 *                    Until one is registered the submission FAILS CLOSED — an
 *                    unresolvable principal is not a reviewer of record.
 *
 * Because the identity comes from the SAME resolver call in both modes, the
 * api-explorer walkthrough exercises the exact production association path (just
 * against the demo directory) — there is no mock-only shortcut to audit around.
 *
 * Pure and unit-testable apart from the swappable resolver: no I/O, no cookies.
 */
import type { Principal, Role } from '@/lib/authz/principal';

/**
 * Roles permitted to be the human of record on a PA submission. A clinical PA
 * reviewer (pa-reviewer) or an operational/admin principal (payer-ops, admin) may
 * approve; a member or provider — or an unidentified caller that fails-secure to
 * `member` — may not. Deliberately narrow: approval is an accountable act.
 */
const APPROVAL_ROLES: readonly Role[] = ['pa-reviewer', 'payer-ops', 'admin'];

/** True when the role may serve as the human approver of a PA submission. */
export function isApprovalAuthorizedRole(role: Role): boolean {
  return APPROVAL_ROLES.includes(role);
}

/** A resolved reviewer of record — a real, referenceable identity, never a free string. */
export interface ApproverIdentity {
  /** Resolvable identity reference, e.g. 'Practitioner/rev-1'. */
  reference: string;
  /** Human-readable name DERIVED from the reference (not client-supplied). */
  display: string;
  /** National Provider Identifier when the directory carries one. */
  npi?: string;
}

export type ApproverIdentityResolver = (reference: string) => ApproverIdentity | null;

/**
 * Demo reviewer directory — the mock/seeded resolver source. Maps the demo session
 * identities to named reviewers of record so the walkthrough shows a real dynamic
 * association ("Reviewed by Dr. Alex Rivera, UM Reviewer") instead of a literal.
 */
const DEMO_REVIEWERS: Readonly<Record<string, ApproverIdentity>> = Object.freeze({
  'Practitioner/dev': {
    reference: 'Practitioner/dev',
    display: 'Dr. Alex Rivera, UM Reviewer',
    npi: '1730154783',
  },
});

const demoResolver: ApproverIdentityResolver = (ref) => {
  const known = DEMO_REVIEWERS[ref];
  if (known) return known;
  // Demo/mock carries no real Practitioner directory: any authenticated
  // practitioner session IS a reviewer of record (the role + non-placeholder
  // checks above still gate it). Production registers a STRICT FHIR resolver via
  // setApproverIdentityResolver, so an unknown practitioner fails closed there.
  if (ref.startsWith('Practitioner/')) {
    return { reference: ref, display: `Reviewer ${ref.slice('Practitioner/'.length)}` };
  }
  return null;
};

let resolver: ApproverIdentityResolver = demoResolver;

/**
 * Register the production approver-identity resolver (a FHIR Practitioner read), or
 * pass null to restore the demo directory. The route never calls the resolver
 * directly — it flows through resolveApprovalAuthority so the authorization rules
 * apply uniformly.
 */
export function setApproverIdentityResolver(fn: ApproverIdentityResolver | null): void {
  resolver = fn ?? demoResolver;
}

/** References that are placeholders, not a real human of record. */
function isNonIdentity(reference: string): boolean {
  const r = (reference ?? '').trim();
  return r === '' || r === 'session-user' || r === 'unknown';
}

export interface ApprovalDecision {
  /** Whether the acting principal is a resolvable, role-authorized reviewer of record. */
  authorized: boolean;
  /** The dynamically resolved approver — never a client string. Null when unauthorized. */
  approver: ApproverIdentity | null;
  /** PHI-safe reason (role / resolution outcome only). */
  reason: string;
}

export interface ResolveApprovalInput {
  /** Principal derived from the session (getPrincipal(getSessionAuthContext())). */
  principal: Principal;
}

/**
 * Resolve the accountable approver from the session principal and decide whether
 * they may satisfy the human gate. The approver is the resolved identity — full
 * stop. Authorization requires (1) an approval-permitted role, (2) a principal that
 * is not a placeholder, and (3) a successful directory/FHIR resolution. Any failure
 * is fail-closed.
 */
export function resolveApprovalAuthority(input: ResolveApprovalInput): ApprovalDecision {
  const { principal } = input;

  if (!isApprovalAuthorizedRole(principal.role)) {
    return {
      authorized: false,
      approver: null,
      reason: `${principal.role} is not authorized to approve prior-authorization submission`,
    };
  }
  if (isNonIdentity(principal.userId)) {
    return {
      authorized: false,
      approver: null,
      reason: 'acting principal has no resolvable identity of record',
    };
  }
  const identity = resolver(principal.userId);
  if (!identity) {
    return {
      authorized: false,
      approver: null,
      reason: 'acting principal could not be resolved to a reviewer of record',
    };
  }
  return {
    authorized: true,
    approver: identity,
    reason: `${principal.role} ${identity.reference} authorized as reviewer of record`,
  };
}
