import { describe, it, expect } from 'vitest';
import { resolveScreenContext, showsMemberSwitcher } from '@/lib/context/screenFrames';

describe('screenFrames registry (context-frame resolution)', () => {
  it('resolves known routes to their declared frame', () => {
    expect(resolveScreenContext('/care-manager').frame).toBe('caseload');
    expect(resolveScreenContext('/executive-outcomes-dashboard').frame).toBe('population');
    expect(resolveScreenContext('/whole-person-care-summary').frame).toBe('member');
  });
  it('shows the member switcher only on member-subject frames', () => {
    expect(showsMemberSwitcher('member')).toBe(true);
    expect(showsMemberSwitcher('population')).toBe(false);
    expect(showsMemberSwitcher('caseload')).toBe(false);
    expect(showsMemberSwitcher('platform')).toBe(false);
  });
  it('fails safe for an unregistered route (returns a context, no switcher)', () => {
    const ctx = resolveScreenContext('/definitely-not-a-registered-route-xyz');
    expect(ctx).toBeTruthy();
    expect(showsMemberSwitcher(ctx.frame)).toBe(false);
  });
});
