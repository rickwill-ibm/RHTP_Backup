import { describe, expect, it } from 'vitest';
import { resolveIdentity, findBestMatch } from '@/lib/identity/resolveIdentity';
import { mockIdentitySource } from '@/lib/identity/identitySource';
import type { IdentityTraits } from '@/lib/identity/mpiTypes';

describe('resolveIdentity — cross-source resolution (Dev Plan Workstream A3)', () => {
  it('resolves a known member deterministically via the genuine global medicaidId', () => {
    // R2 Option B: cross-source consolidation is anchored on a GENUINE GLOBAL key
    // (the Medicaid id the payer + state-agency records carry) — never name+dob.
    const input: IdentityTraits = {
      firstName: 'Maria',
      lastName: 'Redhawk',
      dob: '1985-04-12',
      sex: 'female',
      zip: '57104',
      phone: '605-555-0142',
      medicaidId: 'SD-MEDICAID-88213',
    };
    const result = resolveIdentity(input, 'emr', mockIdentitySource);
    expect(result.resolvedId).toMatch(/^mpi-/);
    expect(result.bestMatch.tier).toBe('deterministic');
    expect(result.matchedSources).toContain('payer');
  });

  it('does not resolve an unrelated person', () => {
    const stranger: IdentityTraits = {
      firstName: 'John',
      lastName: 'Smith',
      dob: '1970-11-02',
      zip: '10001',
    };
    const result = resolveIdentity(stranger, 'emr', mockIdentitySource);
    expect(result.resolvedId).toBe('');
    expect(result.bestMatch.tier).toBe('no-match');
    expect(result.matchedSources).toEqual([]);
  });

  it('never includes raw PHI (name/DOB) in the audit summary', () => {
    const input: IdentityTraits = {
      firstName: 'Maria',
      lastName: 'Redhawk',
      dob: '1985-04-12',
    };
    const result = resolveIdentity(input, 'emr', mockIdentitySource);
    expect(result.auditSummary).not.toContain('Maria');
    expect(result.auditSummary).not.toContain('Redhawk');
    expect(result.auditSummary).not.toContain('1985-04-12');
    expect(result.auditSummary).toContain('tier=');
    expect(result.auditSummary).toContain('confidence=');
  });

  it('only searches source systems other than the origin', () => {
    const input: IdentityTraits = {
      firstName: 'Maria',
      lastName: 'Redhawk',
      dob: '1985-04-12',
    };
    const result = resolveIdentity(input, 'payer', mockIdentitySource);
    // originating from "payer" should not match against the payer's own record as a "source"
    expect(result.matchedSources.every((s) => s !== 'payer')).toBe(true);
  });

  it('findBestMatch returns no-match with a null candidate for an empty candidate list', () => {
    const input: IdentityTraits = { firstName: 'A', lastName: 'B', dob: '2000-01-01' };
    const result = findBestMatch(input, []);
    expect(result.tier).toBe('no-match');
    expect(result.candidate).toBeNull();
  });

  it('is deterministic and reproducible given the same inputs', () => {
    const input: IdentityTraits = {
      firstName: 'Maria',
      lastName: 'Redhawk',
      dob: '1985-04-12',
    };
    const a = resolveIdentity(input, 'emr', mockIdentitySource);
    const b = resolveIdentity(input, 'emr', mockIdentitySource);
    expect(a.bestMatch.tier).toBe(b.bestMatch.tier);
    expect(a.bestMatch.confidence).toBe(b.bestMatch.confidence);
    expect(a.matchedSources).toEqual(b.matchedSources);
  });
});
