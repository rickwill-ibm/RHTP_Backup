/**
 * Corpus family N — Multi-member household & pediatric-adjacent. Executable
 * scenario for the identity-supported half of UC-68 (newborn onto the household
 * record) driving the REAL match engine.
 *
 * DP-7 discipline: a newborn is a NEW identity, NOT a merge. The acceptance
 * clause "no clinical content from the mother's record attaches to the child"
 * rests, at the identity layer, on the match engine NEVER linking the newborn to
 * the mother — which is exactly what this proves. The household related-person
 * link record + care-plan transition are deferred to the record store and
 * registered pending under those capabilities.
 *
 * Other N cases (65/66/67) need graph household links, record provenance, or
 * read-time segmentation → registered pending in the coverage registry.
 */
import { describe, it, expect } from 'vitest';
import { runDeterministicRules, scoreProbabilisticMatch, tierForScore, MATCH_THRESHOLDS } from '@/lib/identity/matchEngine';
import { findBestMatch } from '@/lib/identity/resolveIdentity';
import type { IdentityTraits, SourceIdentityRecord } from '@/lib/identity/mpiTypes';

describe('UC-68 | Newborn onto the household record (new identity, not a merge)', () => {
  const mother: SourceIdentityRecord = {
    sourceSystem: 'payer',
    sourceRecordId: 'mother-enroll-5521',
    traits: {
      firstName: 'Sofia',
      lastName: 'Nightingale',
      dob: '1994-03-08',
      sex: 'female',
      zip: '57201',
      medicaidId: 'SD-MOM-5521',
    },
  };

  // The 834 add for the newborn: shares household surname + zip, but is a
  // distinct person (own given name, own DOB, own/none subscriber id).
  const newborn: IdentityTraits = {
    firstName: 'Baby',
    lastName: 'Nightingale',
    dob: '2026-08-20',
    sex: 'female',
    zip: '57201',
  };

  it('never deterministically merges the newborn into the mother', () => {
    const det = runDeterministicRules(newborn, mother.traits);
    expect(det.hit).toBe(false); // different name + dob, no shared id
  });

  it('does not auto-link the newborn to the mother — a distinct identity anchors', () => {
    const result = findBestMatch(newborn, [mother]);
    // Shared surname + zip + sex alone stays below the possible-match floor:
    // the engine treats the newborn as its own person, so no mother content
    // could cross-attach at the identity layer.
    expect(result.tier).toBe('no-match');
    expect(result.confidence).toBeLessThan(MATCH_THRESHOLDS.possibleMatchMin);
  });

  it('is a CLASS property — any newborn sharing only household surname/zip stays distinct', () => {
    for (const given of ['Infant', 'Baby Boy', 'Aiyana', 'Nova']) {
      const nb: IdentityTraits = { ...newborn, firstName: given };
      const s = scoreProbabilisticMatch(nb, mother.traits);
      expect(tierForScore(s.score, false)).toBe('no-match');
    }
  });
});
