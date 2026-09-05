import { describe, it, expect } from 'vitest';
import { journeyReferrals, deriveJourneyStatus } from '@/lib/referrals/journeyReferralData';
import { mockReferrals } from '@/lib/referrals/mockReferrals';

describe('mockReferrals (relocated demo cohort)', () => {
  it('exposes the authored referral cohort unchanged', () => {
    expect(mockReferrals.length).toBeGreaterThan(0);
    expect(mockReferrals.every((r) => typeof r.id === 'string')).toBe(true);
  });
});

describe('journeyReferralData (relocated authored demo)', () => {
  it('exposes the authored demo journeys unchanged', () => {
    expect(journeyReferrals.length).toBeGreaterThan(0);
    // every record carries a derived journey status
    for (const r of journeyReferrals) {
      expect(['pending', 'accepted', 'scheduled', 'completed', 'cancelled']).toContain(
        r.journeyStatus
      );
    }
  });

  it('deriveJourneyStatus maps outcome/appointment/provider to a stage', () => {
    const base = {
      status: 'Assigned',
      outcome: null,
      appointmentDate: null,
      assignedProvider: null,
    };
    expect(deriveJourneyStatus({ ...(base as any) })).toBe('pending');
    expect(deriveJourneyStatus({ ...(base as any), assignedProvider: 'Dr X' })).toBe('accepted');
    expect(deriveJourneyStatus({ ...(base as any), appointmentDate: '2026-05-01' })).toBe(
      'scheduled'
    );
    expect(deriveJourneyStatus({ ...(base as any), outcome: 'Seen' })).toBe('completed');
    expect(deriveJourneyStatus({ ...(base as any), status: 'Cancelled' })).toBe('cancelled');
  });
});
