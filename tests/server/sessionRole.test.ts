/**
 * The session ROLE BOUNDARY (src/lib/server/sessionRole.ts) — public-surface
 * coverage (§14.1) for the one place an untrusted role value becomes a role this
 * server will act on.
 *
 * Every case here is a FAIL-CLOSED rule. The module has no happy path worth
 * asserting on its own: what matters is that a malformed, unknown or AMBIGUOUS
 * claim yields no role at all, so the principal model falls back to its `fhirUser`
 * derivation instead of acting on a value nobody reviewed.
 */
import { describe, it, expect } from 'vitest';
import { parseRoleClaim, sessionRoleOrNull } from '@/lib/server/sessionRole';

describe('parseRoleClaim — a single role claim', () => {
  it('accepts a known role', () => {
    expect(parseRoleClaim({ role: 'payer-ops' })).toBe('payer-ops');
    expect(parseRoleClaim({ role: 'auditor' })).toBe('auditor');
  });

  it('drops a role outside the vocabulary', () => {
    expect(parseRoleClaim({ role: 'super-admin' })).toBeUndefined();
    expect(parseRoleClaim({ role: 'Internal/everyone' })).toBeUndefined();
    expect(parseRoleClaim({ role: 'PAYER-OPS' })).toBeUndefined(); // case is exact
  });

  it('drops a claim that is not a string', () => {
    for (const claim of [42, true, null, {}, { role: 'admin' }, () => 'admin']) {
      expect(parseRoleClaim({ role: claim })).toBeUndefined();
    }
  });

  it('drops an absent claim', () => {
    expect(parseRoleClaim({})).toBeUndefined();
    expect(parseRoleClaim({ role: undefined })).toBeUndefined();
  });
});

describe('parseRoleClaim — a roles LIST', () => {
  it('reads `roles` when `role` is absent', () => {
    expect(parseRoleClaim({ roles: ['admin'] })).toBe('admin');
  });

  it('prefers `role` over `roles` when both are present', () => {
    expect(parseRoleClaim({ role: 'auditor', roles: ['admin'] })).toBe('auditor');
  });

  it('resolves a list whose only KNOWN entry is one role, ignoring IdP noise', () => {
    // A WSO2 claim mapping commonly emits internal groups alongside app roles.
    expect(parseRoleClaim({ roles: ['Internal/everyone', 'payer-ops'] })).toBe('payer-ops');
    // Duplicates are the same single role, not an ambiguity.
    expect(parseRoleClaim({ roles: ['admin', 'admin'] })).toBe('admin');
  });

  it('drops an AMBIGUOUS list WHOLE — authority may not depend on claim order', () => {
    // This is the rule that matters. Taking the first known entry would make the
    // caller's authority depend on the ORDER the IdP happens to emit, which is a
    // claim-mapping detail nobody reviewed: ['member','admin'] would be a member
    // and ['admin','member'] an admin, from the same account.
    expect(parseRoleClaim({ roles: ['member', 'admin'] })).toBeUndefined();
    expect(parseRoleClaim({ roles: ['admin', 'member'] })).toBeUndefined();
    expect(parseRoleClaim({ roles: ['auditor', 'payer-ops', 'member'] })).toBeUndefined();
  });

  it('drops a list with no known entry', () => {
    expect(parseRoleClaim({ roles: [] })).toBeUndefined();
    expect(parseRoleClaim({ roles: ['Internal/everyone', 'Application/rhtp'] })).toBeUndefined();
  });
});

describe('sessionRoleOrNull — the role of an OPENED session', () => {
  it('returns a known role', () => {
    expect(sessionRoleOrNull('payer-ops')).toBe('payer-ops');
  });

  it('returns null — not a role — for anything unrecognised', () => {
    // null is the fail-closed answer: getPrincipal then derives from fhirUser and,
    // with nothing identifying the caller, yields the self-only `member` role.
    for (const value of ['super-admin', '', undefined, null, 7, ['admin']]) {
      expect(sessionRoleOrNull(value)).toBeNull();
    }
  });
});
