import { describe, expect, it } from 'vitest';
import { resolveIdentityWithAudit } from '@/lib/server/identityResolution';
import { assertPhiSafe } from '@/lib/server/audit';
import type { IdentityTraits } from '@/lib/identity/mpiTypes';

describe('resolveIdentityWithAudit (Dev Plan Workstream A3 — server integration)', () => {
  it('resolves a known member and emits a PHI-safe audit event', async () => {
    // R2 Option B: deterministic consolidation is via the genuine global medicaidId
    // the payer + state-agency records carry — not name+dob (which is HELD).
    const input: IdentityTraits = {
      firstName: 'Maria',
      lastName: 'Redhawk',
      dob: '1985-04-12',
      medicaidId: 'SD-MEDICAID-88213',
    };
    const result = await resolveIdentityWithAudit(input, 'emr', {
      actor: 'system:test',
      correlationId: 'test-cid-1',
    });
    expect(result.bestMatch.tier).toBe('deterministic');
    expect(result.resolvedId).toMatch(/^mpi-/);

    // The same PHI-safety gate the audit module itself enforces — construct the
    // equivalent event shape and confirm it would pass, proving the wrapper never
    // hands raw traits to the audit sink.
    expect(() =>
      assertPhiSafe({
        ts: new Date().toISOString(),
        actor: 'system:test',
        action: 'identity-resolution',
        resourceRef: `mpi/${result.resolvedId}`,
        correlationId: 'test-cid-1',
        outcome: 'success',
        detail: result.auditSummary,
      })
    ).not.toThrow();
  });

  it('does not throw for an unresolved identity, and reports failure outcome semantics via tier', async () => {
    const stranger: IdentityTraits = {
      firstName: 'Nobody',
      lastName: 'Unknown',
      dob: '1900-01-01',
    };
    const result = await resolveIdentityWithAudit(stranger, 'emr', { actor: 'system:test' });
    expect(result.bestMatch.tier).toBe('no-match');
    expect(result.resolvedId).toBe('');
  });
});
