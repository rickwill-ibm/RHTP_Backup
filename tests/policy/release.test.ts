/**
 * Release summary — the promotion conclusion. Deterministic given the clock: the version, the next
 * release window, the effective date (window + provider notice), and the change id are all reproducible.
 */
import { describe, it, expect } from 'vitest';
import { buildReleaseSummary } from '@/lib/policy/workflow/release';

const AUG_29 = new Date(Date.UTC(2026, 7, 29, 15, 0, 0)); // 2026-08-29

describe('buildReleaseSummary', () => {
  it('stamps a calendar version and queues the next monthly release window', () => {
    const r = buildReleaseSummary({ now: AUG_29, policyId: 'p1', guidelineId: 'CG-SURG-83' });
    expect(r.version).toBe('2026.08.1');
    expect(r.releaseWindow).toBe('2026-09-01'); // first of the NEXT month
  });

  it('sets the effective date to the window + provider-notice period', () => {
    const r = buildReleaseSummary({ now: AUG_29, policyId: 'p1', noticeDays: 60 });
    expect(r.noticeDays).toBe(60);
    expect(r.effectiveDate).toBe('2026-10-31'); // 2026-09-01 + 60 days
    // notice defaults to 60 when omitted
    expect(buildReleaseSummary({ now: AUG_29, policyId: 'p1' }).effectiveDate).toBe('2026-10-31');
  });

  it('is deterministic — same inputs produce the same change id and dates', () => {
    const a = buildReleaseSummary({ now: AUG_29, policyId: 'p1', guidelineId: 'CG-SURG-83' });
    const b = buildReleaseSummary({ now: AUG_29, policyId: 'p1', guidelineId: 'CG-SURG-83' });
    expect(a).toEqual(b);
    expect(a.changeId).toMatch(/^CHG-2026-\d{4}$/);
  });

  it('carries the maker/checker references and marks an initial release', () => {
    const r = buildReleaseSummary({
      now: AUG_29,
      policyId: 'p1',
      submittedBy: 'Practitioner/maker',
      approvedBy: 'Practitioner/medical-director',
    });
    expect(r.submittedBy).toBe('Practitioner/maker');
    expect(r.approvedBy).toBe('Practitioner/medical-director');
    expect(r.supersedes).toBeNull(); // no prior version ⇒ initial release
    expect(
      buildReleaseSummary({ now: AUG_29, policyId: 'p1', priorVersion: '2026.05.0' }).supersedes
    ).toBe('2026.05.0');
  });

  it('distributes to the operational stakeholder queues (modeled, each with a reason)', () => {
    const r = buildReleaseSummary({ now: AUG_29, policyId: 'p1' });
    const teams = r.notifications.map((n) => n.team);
    expect(teams).toEqual([
      'UM Operations',
      'Provider Network',
      'Configuration / IT',
      'Compliance',
    ]);
    expect(r.notifications.every((n) => n.reason.length > 0)).toBe(true);
  });
});
