/**
 * PatientContext keystone — the membership→coverage spine.
 * Lenses: identity-not-conflated (H7: patientId ≠ memberId), guards-fail-closed
 * (eligibility never assumed), one-universe (same patients live + portal).
 */
import { describe, it, expect } from 'vitest';
import {
  DEMO_PATIENT_CONTEXTS,
  getPatientContext,
  getPatientContextByMemberId,
  isCoverageActive,
  patientBannerFrom,
  type PatientContext,
} from '@/lib/pa/patientContext';

describe('patient identity is not conflated with member id (H7)', () => {
  it('every demo patient has a Patient id distinct from the coverage member id', () => {
    for (const c of DEMO_PATIENT_CONTEXTS) {
      expect(c.patientId).not.toBe(c.coverage.memberId);
      expect(c.coverage.memberId.length).toBeGreaterThan(0);
    }
  });

  it('member ids are unique across the demo set (portal keys on them)', () => {
    const ids = DEMO_PATIENT_CONTEXTS.map((c) => c.coverage.memberId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('lookup is one universe', () => {
  it('resolves by patient id and by member id to the same context', () => {
    const maria = getPatientContext('MARIA_SD_001');
    expect(maria?.name).toBe('Maria Redhawk');
    if (!maria) throw new Error('seed');
    const byMember = getPatientContextByMemberId(maria.coverage.memberId);
    expect(byMember).toBe(maria);
  });

  it('unknown ids resolve to undefined (no silent default persona)', () => {
    expect(getPatientContext('nobody')).toBeUndefined();
    expect(getPatientContext(null)).toBeUndefined();
    expect(getPatientContextByMemberId('0000')).toBeUndefined();
  });
});

describe('eligibility is evidence, never assumed (guards-fail-closed)', () => {
  const base: PatientContext = {
    patientId: 'p1',
    name: 'Test',
    dob: '1980-01-01',
    coverage: {
      payer: 'Payer',
      payerId: 'payer',
      plan: 'Plan',
      memberId: 'M1',
      subscriberId: 'M1',
      coverageStatus: 'active',
      eligibilityVerifiedOn: '2026-07-01',
    },
  };

  it('active + verified on/before service date ⇒ eligible', () => {
    expect(isCoverageActive(base, '2026-07-20')).toBe(true);
    expect(isCoverageActive(base, '2026-07-01')).toBe(true);
  });

  it('verification AFTER the service date does not count as evidence for it', () => {
    expect(isCoverageActive(base, '2026-06-01')).toBe(false);
  });

  it('inactive or unknown status is never eligible, regardless of date', () => {
    expect(
      isCoverageActive(
        { ...base, coverage: { ...base.coverage, coverageStatus: 'inactive' } },
        '2026-07-20'
      )
    ).toBe(false);
    expect(
      isCoverageActive({ ...base, coverage: { ...base.coverage, coverageStatus: 'unknown' } })
    ).toBe(false);
  });

  it('active without asOf is eligible (no date to contradict)', () => {
    expect(isCoverageActive(base)).toBe(true);
  });
});

describe('banner derives from context', () => {
  it('maps context → the UI banner shape using the coverage member id', () => {
    const maria = getPatientContext('MARIA_SD_001');
    if (!maria) throw new Error('seed');
    expect(patientBannerFrom(maria)).toEqual({
      name: 'Maria Redhawk',
      dob: '1978-04-12',
      memberId: maria.coverage.memberId,
    });
  });
});
