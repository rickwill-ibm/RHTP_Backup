/**
 * membersForVersion — the current-vs-prior version branch (surfaced by the E13
 * tool fix in HW5). Kills the `version === currentVersion` -> `!==` mutant: a
 * current-version query must return the current members, not fall through to the
 * (absent) prior-version lookup.
 */
import { describe, it, expect } from 'vitest';
import {
  membersForVersion,
  currentMembers,
  declaredCurrentVersion,
} from '@/lib/terminology/validateCode/membership';

describe('membersForVersion: current vs prior version', () => {
  it('a CURRENT-version query returns the current members (not the prior lookup)', () => {
    const cur = declaredCurrentVersion('ICD-10-CM');
    expect(cur).toBe('FY2026');
    const members = membersForVersion('ICD-10-CM', cur!);
    expect(members).toBeDefined();
    expect(members).toEqual(currentMembers('ICD-10-CM'));
    expect(members!.length).toBeGreaterThan(0);
  });

  it('a PRIOR-version query resolves via the version deltas (different from current when deltas exist)', () => {
    const prior = membersForVersion('ICD-10-CM', 'FY2025');
    expect(prior).toBeDefined(); // a declared prior version resolves
  });

  it('an UNKNOWN version is undefined (neither current nor a declared prior)', () => {
    expect(membersForVersion('ICD-10-CM', 'FY1999')).toBeUndefined();
  });
});
