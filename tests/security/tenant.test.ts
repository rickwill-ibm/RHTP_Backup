/**
 * HW-SEC / I13 — tenant/plan/LOB boundary (C-TEN) tests.
 *
 * Proves: the demo (mock) stays permissive/single-tenant; production enforces
 * cross-tenant and cross-LOB isolation fail-closed even for an org-scoped reviewer
 * (the 2-Crit security gap); and the composed member gate denies BOLA across tenants.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  assertTenantScope,
  canAccessMemberTenantAware,
  resolveMemberTenant,
  resolveActorTenantScope,
  lobFromPayer,
  DEMO_TENANT_ID,
  type TenantScope,
} from '../../src/lib/security/tenant';
import { setSessionDataMode, clearSessionDataModes } from '../../src/lib/config/dataMode';
import type { Principal, PrincipalSession } from '../../src/lib/authz/principal';

const orgReviewer: Principal = {
  userId: 'Practitioner/rev-1',
  role: 'pa-reviewer',
  authorizedMemberScope: { kind: 'org' },
};

afterEach(() => clearSessionDataModes());

describe('LOB derivation', () => {
  it('maps payer strings to regulated lines of business', () => {
    expect(lobFromPayer('CMS / Medicare Advantage')).toBe('medicare-advantage');
    expect(lobFromPayer('Medicaid MCO')).toBe('medicaid');
    expect(lobFromPayer('ACA Exchange')).toBe('aca-exchange');
    expect(lobFromPayer('Commercial Group')).toBe('commercial');
    expect(lobFromPayer(undefined)).toBe('unknown');
  });
});

describe('demo (mock) disposition — demo preserved (constraint #2)', () => {
  it('every member resolves to the demo tenant and an org reviewer reaches them', () => {
    const memberTenant = resolveMemberTenant('patient-002');
    expect(memberTenant.tenantId).toBe(DEMO_TENANT_ID);
    const scope = resolveActorTenantScope(orgReviewer, {});
    expect(scope.kind).toBe('demo');
    expect(assertTenantScope(scope, memberTenant).allow).toBe(true);
    expect(canAccessMemberTenantAware(orgReviewer, {}, 'patient-002').allow).toBe(true);
  });
});

describe('production disposition — cross-tenant isolation (the 2-Crit gap)', () => {
  it('an org reviewer of tenant A cannot read tenant B under production', () => {
    setSessionDataMode('tenancy', 'production');
    const sessionA: PrincipalSession & { tenantId: string } = {
      fhirUser: 'Practitioner/rev-1',
      tenantId: 'tenant:Plan-A',
    };
    // member resolves to its own payer-derived tenant; A's reviewer must not match B
    const scopeA = resolveActorTenantScope(orgReviewer, sessionA);
    expect(scopeA.tenantIds).toEqual(['tenant:Plan-A']);
    const memberB = resolveMemberTenant('patient-002'); // demo payer => tenant:CMS / Medicare
    expect(memberB.tenantId).not.toBe('tenant:Plan-A');
    expect(assertTenantScope(scopeA, memberB).allow).toBe(false);
    expect(canAccessMemberTenantAware(orgReviewer, sessionA, 'patient-002').allow).toBe(false);
  });

  it('a reviewer WITH the matching tenant claim is allowed', () => {
    setSessionDataMode('tenancy', 'production');
    const member = resolveMemberTenant('patient-001');
    const session = { fhirUser: 'Practitioner/rev-1', tenantId: member.tenantId };
    expect(canAccessMemberTenantAware(orgReviewer, session, 'patient-001').allow).toBe(true);
  });

  it('fails CLOSED when the session carries no tenant claim', () => {
    setSessionDataMode('tenancy', 'production');
    const scope = resolveActorTenantScope(orgReviewer, { fhirUser: 'Practitioner/rev-1' });
    expect(scope.tenantIds).toEqual([]);
    expect(assertTenantScope(scope, resolveMemberTenant('patient-001')).allow).toBe(false);
  });
});

describe('LOB sub-scoping', () => {
  it('denies a member whose LOB is outside the actor LOB restriction', () => {
    const scope: TenantScope = { kind: 'single', tenantIds: ['t1'], lobs: ['medicaid'] };
    expect(assertTenantScope(scope, { tenantId: 't1', lob: 'medicare-advantage' }).allow).toBe(false);
    expect(assertTenantScope(scope, { tenantId: 't1', lob: 'medicaid' }).allow).toBe(true);
  });
});
