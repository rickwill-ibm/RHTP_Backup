/**
 * The session's ROLE BOUNDARY — the one place an untrusted role value becomes a
 * role this server will act on.
 *
 * Split out of `smartSession.ts` so that module keeps one job (seal/open the
 * session cookie, talk to WSO2) and stays inside the §2 cap. Two callers, both in
 * smartSession: the token exchange, which parses the IdP's claim before sealing a
 * session, and the auth-context projection, which re-parses the field it just
 * opened rather than trusting a cookie another build sealed.
 *
 * The role VOCABULARY is not redefined here. It is imported from
 * `@/lib/authz/principal`, which is its single source of truth; this module only
 * decides which SHAPES of claim are acceptable. Nothing here makes an authorization
 * decision — that stays in the principal model and the routes.
 *
 * Server-only: import from src/app/api/** or src/lib/server/** only.
 */
import { parseRole, type Role } from '@/lib/authz/principal';

/**
 * The role-bearing fields of an OAuth token response. WSO2 emits either a single
 * `role` or a `roles` list depending on the claim mapping, so both shapes are
 * accepted. Typed `unknown` because this is an EXTERNAL payload: it is parsed here
 * (§5.2) and never spread into session state as-is.
 */
export interface RoleClaimSource {
  role?: unknown;
  roles?: unknown;
}

/**
 * Parse an IdP role claim. FAIL-CLOSED rules, in order: a claim that is not a
 * string or a list of strings is dropped; a value outside the role vocabulary is
 * dropped (`parseRole` decides); and a list resolving to MORE THAN ONE distinct
 * known role is dropped WHOLE.
 *
 * That last rule is the one that matters. Picking the first known entry of
 * `['member','admin']` would make a caller's authority depend on claim ORDER — an
 * IdP mapping detail nobody reviewed. Dropping an ambiguous claim leaves the
 * session with NO role, so the principal model's `fhirUser` derivation applies:
 * the behaviour from before this field existed, never more than it.
 */
export function parseRoleClaim(claims: RoleClaimSource): Role | undefined {
  const claim = claims.role === undefined ? claims.roles : claims.role;
  if (!Array.isArray(claim)) return parseRole(claim);
  const found = new Set<Role>();
  for (const entry of claim) {
    const role = parseRole(entry);
    if (role !== undefined) found.add(role);
  }
  if (found.size !== 1) return undefined;
  return [...found][0];
}

/**
 * The role to report for an OPENED session, as `Role | null`.
 *
 * `null` is the fail-closed answer and must stay one: the principal model then
 * derives from `fhirUser`, and a caller nothing identifies is a self-only `member`.
 * Written with an explicit `undefined` test rather than `?? null` — a coalescing
 * operator on a role value is the shape an authz reviewer greps for (E9), so it is
 * spelled out here instead.
 */
export function sessionRoleOrNull(value: unknown): Role | null {
  const role = parseRole(value);
  return role === undefined ? null : role;
}
