import { describe, it, expect } from 'vitest';
import { WORKLIST, scopedWorklist } from '@/app/care-manager/worklistData';

describe('scopedWorklist (caseload whose-book filter)', () => {
  it("'mine' returns only the current user's patients", () => {
    const mine = scopedWorklist(WORKLIST, 'mine', 'Sarah Johnson');
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((p) => p.careManager === 'Sarah Johnson')).toBe(true);
  });
  it("'unassigned' returns only ownerless patients", () => {
    const un = scopedWorklist(WORKLIST, 'unassigned', 'Sarah Johnson');
    expect(un.every((p) => !p.careManager)).toBe(true);
  });
  it("'team' ⊇ 'mine' and 'all' is the full list", () => {
    const mine = scopedWorklist(WORKLIST, 'mine', 'Sarah Johnson');
    const team = scopedWorklist(WORKLIST, 'team', 'Sarah Johnson');
    const all = scopedWorklist(WORKLIST, 'all', 'Sarah Johnson');
    expect(team.every((p) => !!p.careManager)).toBe(true);
    expect(team.length).toBeGreaterThanOrEqual(mine.length);
    expect(all.length).toBe(WORKLIST.length);
  });
});
