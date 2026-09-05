import { describe, it, expect } from 'vitest';
import { referralTaskToRecord, liveManualReferrals } from '@/lib/referrals/fromReferralTask';
import type { ReferralTask } from '@/lib/appContext';

const baseTask: ReferralTask = {
  id: 'rt-1',
  patientId: 'MEM-100',
  citizenName: 'Jordan Rivers',
  action: 'Enroll in Food Security Program',
  category: 'Food Insecurity',
  cboName: 'Feeding SD',
  keystone: true,
  status: 'pending',
  source: 'manual',
  createdAt: '2026-09-05T14:30:00.000Z',
};

describe('referralTaskToRecord', () => {
  it('maps a manual ReferralTask into a submitted ReferralRecord', () => {
    const r = referralTaskToRecord(baseTask);
    expect(r.id).toBe('rt-1');
    expect(r.patientName).toBe('Jordan Rivers');
    expect(r.patientId).toBe('MEM-100');
    expect(r.status).toBe('Pending');
    expect(r.outcome).toBe('Pending');
    expect(r.assignedProvider).toBe('Feeding SD');
    expect(r.specialty).toBe('Food Insecurity');
    expect(r.icdDescription).toBe('Enroll in Food Security Program');
    expect(r.submissionChannel).toBe('RHTP Run Play');
    expect(r.referralDate).toBe('2026-09-05');
    expect(r.daysOpen).toBe(0);
    expect(r.appointmentDate).toBeNull();
    expect(r.closedDate).toBeNull();
  });
});

describe('liveManualReferrals', () => {
  it('keeps manual tasks, dedupes by id AND by intent, keeps distinct intents', () => {
    const tasks: ReferralTask[] = [
      baseTask, // rt-1
      { ...baseTask, id: 'rt-1b' }, // same intent (patient+action+category) -> collapsed
      { ...baseTask, id: 'rt-2', source: 'screening' }, // non-manual -> excluded
      { ...baseTask, id: 'rt-3', patientId: 'MEM-200' }, // distinct intent -> kept
    ];
    const out = liveManualReferrals(tasks);
    expect(out.map((r) => r.id)).toEqual(['rt-1', 'rt-3']);
  });

  it('returns an empty array when there are no manual tasks', () => {
    expect(liveManualReferrals([{ ...baseTask, source: 'screening' }])).toEqual([]);
  });
});
