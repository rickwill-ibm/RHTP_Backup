import { describe, it, expect, afterEach } from 'vitest';
import {
  resolveApprovalAuthority,
  isApprovalAuthorizedRole,
  setApproverIdentityResolver,
} from '@/lib/authz/approvalAuthority';
import type { Principal } from '@/lib/authz/principal';

function principal(role: Principal['role'], userId: string): Principal {
  return { userId, role, authorizedMemberScope: { kind: 'org' } };
}

afterEach(() => setApproverIdentityResolver(null)); // restore demo directory

describe('approvalAuthority — role vocabulary', () => {
  it('permits reviewer / payer-ops / admin, denies member & provider & care-manager', () => {
    expect(isApprovalAuthorizedRole('pa-reviewer')).toBe(true);
    expect(isApprovalAuthorizedRole('payer-ops')).toBe(true);
    expect(isApprovalAuthorizedRole('admin')).toBe(true);
    expect(isApprovalAuthorizedRole('member')).toBe(false);
    expect(isApprovalAuthorizedRole('provider')).toBe(false);
    expect(isApprovalAuthorizedRole('care-manager')).toBe(false);
  });
});

describe('approvalAuthority — dynamic association (same path in mock & prod)', () => {
  it('resolves the demo session identity to a named reviewer of record', () => {
    const d = resolveApprovalAuthority({ principal: principal('pa-reviewer', 'Practitioner/dev') });
    expect(d.authorized).toBe(true);
    expect(d.approver).toEqual({
      reference: 'Practitioner/dev',
      display: 'Dr. Alex Rivera, UM Reviewer',
      npi: '1730154782',
    });
  });

  it('uses a registered production resolver identically (no mode branch)', () => {
    setApproverIdentityResolver((ref) =>
      ref === 'Practitioner/rev-9'
        ? { reference: ref, display: 'Dr. Jordan Lee', npi: '1999999984' }
        : null
    );
    const d = resolveApprovalAuthority({
      principal: principal('pa-reviewer', 'Practitioner/rev-9'),
    });
    expect(d.authorized).toBe(true);
    expect(d.approver?.display).toBe('Dr. Jordan Lee');
  });
});

describe('approvalAuthority — fail-closed cases', () => {
  it('DENIES a placeholder principal (session-user) even with an approval role', () => {
    // closes the "bound in name only" hole: role passes but identity is a placeholder
    const d = resolveApprovalAuthority({ principal: principal('payer-ops', 'session-user') });
    expect(d.authorized).toBe(false);
    expect(d.approver).toBeNull();
    expect(d.reason).toContain('no resolvable identity');
  });

  it('DENIES an authorized role the resolver cannot resolve (production strict, fail-closed)', () => {
    setApproverIdentityResolver(() => null); // strict resolver: resolves nobody
    const d = resolveApprovalAuthority({
      principal: principal('pa-reviewer', 'Practitioner/unknown'),
    });
    expect(d.authorized).toBe(false);
    expect(d.approver).toBeNull();
    expect(d.reason).toContain('could not be resolved');
  });

  it('demo resolver is permissive: any authenticated practitioner resolves to a reviewer', () => {
    const d = resolveApprovalAuthority({
      principal: principal('pa-reviewer', 'Practitioner/reviewer-dev'),
    });
    expect(d.authorized).toBe(true);
    expect(d.approver?.reference).toBe('Practitioner/reviewer-dev');
  });

  it('DENIES an unauthorized role even when it resolves to a real identity', () => {
    setApproverIdentityResolver((ref) => ({ reference: ref, display: 'Some Member' }));
    for (const role of ['member', 'provider', 'care-manager', 'auditor'] as const) {
      const d = resolveApprovalAuthority({ principal: principal(role, 'Patient/patient-001') });
      expect(d.authorized).toBe(false);
      expect(d.reason).toContain('not authorized');
    }
  });

  it('NEVER derives the approver from a caller string — the input has no such field', () => {
    // The type has only { principal } — there is no client-supplied approver to trust.
    const d = resolveApprovalAuthority({ principal: principal('pa-reviewer', 'Practitioner/dev') });
    expect(d.approver?.display).not.toBe('Dr. Sarah Johnson MD');
  });
});
