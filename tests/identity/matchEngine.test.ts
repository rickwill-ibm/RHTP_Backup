import { describe, expect, it } from 'vitest';
import {
  runDeterministicRules,
  scoreProbabilisticMatch,
  tierForScore,
  MATCH_THRESHOLDS,
} from '@/lib/identity/matchEngine';
import type { IdentityTraits } from '@/lib/identity/mpiTypes';

const MARIA: IdentityTraits = {
  firstName: 'Maria',
  lastName: 'Redhawk',
  dob: '1985-04-12',
  sex: 'female',
  zip: '57104',
  medicaidId: 'SD-MEDICAID-88213',
};

describe('MPI matching engine — deterministic rules (Dev Plan Workstream A1/A2)', () => {
  it('matches on exact medicaidId regardless of other fields', () => {
    const other: IdentityTraits = { ...MARIA, firstName: 'M.', dob: '1900-01-01' };
    const result = runDeterministicRules(MARIA, other);
    expect(result.hit).toBe(true);
    expect(result.rule).toBe('medicaidId-exact');
  });

  it('matches on ssnLast4 + dob', () => {
    const a: IdentityTraits = {
      firstName: 'A',
      lastName: 'B',
      dob: '1990-01-01',
      ssnLast4: '1234',
    };
    const b: IdentityTraits = {
      firstName: 'X',
      lastName: 'Y',
      dob: '1990-01-01',
      ssnLast4: '1234',
    };
    expect(runDeterministicRules(a, b)).toEqual({ hit: true, rule: 'ssnLast4+dob-exact' });
  });

  it('name + dob alone is NOT deterministic (R2 Option B: no auto cross-person merge)', () => {
    // Identical name + dob with no other agreeing trait must NOT fire a
    // deterministic rule — it is a possible-match, HELD for steward review. This
    // is the PHI-comingling fix: name+dob-exact was DEMOTED out of the rules.
    const a: IdentityTraits = { firstName: 'maria', lastName: 'redhawk', dob: '1985-04-12' };
    const b: IdentityTraits = { firstName: 'Maria', lastName: 'Redhawk', dob: '1985-04-12' };
    const result = runDeterministicRules(a, b);
    expect(result.hit).toBe(false);
    expect(result.rule).toBeNull();
    // And it scores in the possible-match band (30+20+25 = 75), so it is HELD.
    const { score } = scoreProbabilisticMatch(a, b);
    expect(score).toBe(75);
    expect(tierForScore(score, false)).toBe('possible-match');
  });

  it('localId-same-source-exact fires when value AND assigning authority agree', () => {
    const a: IdentityTraits = {
      firstName: 'Al',
      lastName: 'B',
      dob: '1990-01-01',
      localId: { assigningAuthority: 'emr-oak', value: 'MRN-777' },
    };
    const b: IdentityTraits = {
      firstName: 'Different',
      lastName: 'Person',
      dob: '1900-01-01',
      localId: { assigningAuthority: 'emr-oak', value: 'MRN-777' },
    };
    const result = runDeterministicRules(a, b);
    expect(result.hit).toBe(true);
    expect(result.rule).toBe('localId-same-source-exact');
  });

  it('localId does NOT fire when the SAME value is under a DIFFERENT authority (reused MRN)', () => {
    // The crux of R2 Option B: an MRN reused across two source systems is two
    // different people's ids that merely collide — it must never merge them.
    const a: IdentityTraits = {
      firstName: 'Al',
      lastName: 'B',
      dob: '1990-01-01',
      localId: { assigningAuthority: 'emr-oak', value: 'MRN-777' },
    };
    const b: IdentityTraits = {
      firstName: 'Al',
      lastName: 'B',
      dob: '1990-01-01',
      localId: { assigningAuthority: 'clinic-pine', value: 'MRN-777' },
    };
    expect(runDeterministicRules(a, b).hit).toBe(false);
  });

  it('localId does NOT fire on same authority but different value', () => {
    const a: IdentityTraits = {
      firstName: 'Al',
      lastName: 'B',
      dob: '1990-01-01',
      localId: { assigningAuthority: 'emr-oak', value: 'MRN-777' },
    };
    const b: IdentityTraits = {
      firstName: 'Al',
      lastName: 'B',
      dob: '1990-01-01',
      localId: { assigningAuthority: 'emr-oak', value: 'MRN-888' },
    };
    expect(runDeterministicRules(a, b).hit).toBe(false);
  });

  it('does not fire on partial overlap alone', () => {
    const a: IdentityTraits = { firstName: 'Maria', lastName: 'Redhawk', dob: '1985-04-12' };
    const b: IdentityTraits = { firstName: 'Maria', lastName: 'Smith', dob: '1990-01-01' };
    expect(runDeterministicRules(a, b).hit).toBe(false);
  });
});

// Regression tests for the Cycle 2A findings: an exact-match rule never fires on
// blank/absent values, across every deterministic rule (blank-field permutations).
describe('MPI matching engine — blank-field guards (Cycle 2A findings 1 & 2)', () => {
  it('name+dob-exact does not fire when either name is blank/whitespace, even with matching DOB', () => {
    const dob = '1985-04-12';
    // Both names blank on both sides.
    expect(
      runDeterministicRules(
        { firstName: '', lastName: ' ', dob },
        { firstName: '  ', lastName: '', dob }
      ).hit
    ).toBe(false);
    // One blank field is enough to block the rule (last names agree, first names blank).
    expect(
      runDeterministicRules(
        { firstName: '', lastName: 'Redhawk', dob },
        { firstName: '', lastName: 'Redhawk', dob }
      ).hit
    ).toBe(false);
  });

  it('medicaidId-exact and ssnLast4+dob-exact do not fire on blank/whitespace values', () => {
    // Whitespace-only medicaid ids both normalize to '' — must not be treated as equal ids.
    const wsId = runDeterministicRules(
      { firstName: 'A', lastName: 'B', dob: '1990-01-01', medicaidId: '   ' },
      { firstName: 'X', lastName: 'Y', dob: '1970-05-05', medicaidId: ' ' }
    );
    expect(wsId.hit).toBe(false);
    // Matching ssnLast4 with blank DOBs must not fire ssnLast4+dob-exact.
    const blankDob = runDeterministicRules(
      { firstName: 'A', lastName: 'B', dob: '', ssnLast4: '1234' },
      { firstName: 'X', lastName: 'Y', dob: ' ', ssnLast4: '1234' }
    );
    expect(blankDob.hit).toBe(false);
  });

  it('probabilistic scoring gives zero weight to fields blank on both sides (absence is not agreement)', () => {
    const a: IdentityTraits = { firstName: '', lastName: '', dob: '', zip: '   ', phone: '' };
    const b: IdentityTraits = { firstName: ' ', lastName: '', dob: ' ', zip: ' ', phone: '' };
    const { score, ruleHits } = scoreProbabilisticMatch(a, b);
    expect(score).toBe(0);
    expect(ruleHits).toEqual([]);
    // One empty vs one non-empty is also zero, not partial credit.
    const oneSided = scoreProbabilisticMatch(
      { firstName: '', lastName: '', dob: '1985-04-12' },
      { firstName: 'Maria', lastName: 'Redhawk', dob: '1985-04-12' }
    );
    expect(oneSided.ruleHits.filter((h) => h.rule.endsWith('-similarity'))).toEqual([]);
  });
});

describe('MPI matching engine — probabilistic scoring', () => {
  it('scores an exact-trait match at the sum of all weights the fixture carries (MARIA has no phone, so 30+20+25+5+10=90)', () => {
    const { score } = scoreProbabilisticMatch(MARIA, MARIA);
    expect(score).toBe(90);
  });

  it('scores a full-trait exact match (including phone) at 100 (capped)', () => {
    const withPhone: IdentityTraits = { ...MARIA, phone: '605-555-0142' };
    const { score } = scoreProbabilisticMatch(withPhone, withPhone);
    expect(score).toBe(100);
  });

  it('scores a near-miss name (typo) below an exact match but still substantial', () => {
    const typo: IdentityTraits = {
      ...MARIA,
      firstName: 'Marai',
      lastName: 'Redhwak',
      medicaidId: undefined,
    };
    const { score } = scoreProbabilisticMatch(MARIA, typo);
    expect(score).toBeGreaterThan(50);
    expect(score).toBeLessThan(100);
  });

  it('scores an unrelated person low', () => {
    const stranger: IdentityTraits = {
      firstName: 'John',
      lastName: 'Smith',
      dob: '1970-11-02',
      zip: '10001',
    };
    const { score } = scoreProbabilisticMatch(MARIA, stranger);
    expect(score).toBeLessThan(MATCH_THRESHOLDS.possibleMatchMin);
  });

  it('never exceeds 100', () => {
    const { score } = scoreProbabilisticMatch(
      { ...MARIA, phone: '605-555-0142' },
      { ...MARIA, phone: '605-555-0142' }
    );
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('MPI matching engine — tier thresholds', () => {
  it('deterministic hit always yields tier "deterministic" regardless of score arg', () => {
    expect(tierForScore(0, true)).toBe('deterministic');
  });
  it('score at/above autoLinkMin yields probabilistic-auto', () => {
    expect(tierForScore(MATCH_THRESHOLDS.autoLinkMin, false)).toBe('probabilistic-auto');
  });
  it('score in the possible-match band yields possible-match', () => {
    expect(tierForScore(MATCH_THRESHOLDS.possibleMatchMin, false)).toBe('possible-match');
    expect(tierForScore(MATCH_THRESHOLDS.autoLinkMin - 1, false)).toBe('possible-match');
  });
  it('score below possibleMatchMin yields no-match', () => {
    expect(tierForScore(MATCH_THRESHOLDS.possibleMatchMin - 1, false)).toBe('no-match');
  });
});
