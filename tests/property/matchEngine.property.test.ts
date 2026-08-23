/**
 * Property-style tests — identity match engine (src/lib/identity/matchEngine.ts).
 * Seeded deterministic case generation via tests/property/_prng.ts (mulberry32).
 */
import { describe, expect, it } from 'vitest';
import {
  MATCH_THRESHOLDS,
  runDeterministicRules,
  scoreProbabilisticMatch,
  tierForScore,
} from '@/lib/identity/matchEngine';
import { findBestMatch } from '@/lib/identity/resolveIdentity';
import type { IdentityTraits, SourceIdentityRecord } from '@/lib/identity/mpiTypes';
import { bool, forCases, int, maybe, pick, str, type Rng } from './_prng';

const NAME_ALPHA = 'abcdefghijklmnopqrstuvwxyz';
const FIRSTS = ['maria', 'jose', 'JOSE ', 'Ana', 'li', 'christopher', 'ann', 'Renée'];
const LASTS = ['redhawk', 'garcia-lopez', "o'neal", 'Nguyen', 'smith', 'Two Bulls'];
const SEXES = ['male', 'female', 'other', 'unknown'] as const;

function genDob(rng: Rng): string {
  const y = int(rng, 1930, 2024);
  const m = String(int(rng, 1, 12)).padStart(2, '0');
  const d = String(int(rng, 1, 28)).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function genName(rng: Rng, pool: readonly string[]): string {
  return bool(rng, 0.7) ? pick(rng, pool) : str(rng, NAME_ALPHA, 1, 12);
}

function genTraits(rng: Rng): IdentityTraits {
  return {
    firstName: genName(rng, FIRSTS),
    lastName: genName(rng, LASTS),
    dob: genDob(rng),
    sex: maybe(rng, pick(rng, SEXES), 0.7),
    ssnLast4: maybe(rng, str(rng, '0123456789', 4, 4), 0.4),
    medicaidId: maybe(rng, `SD-${str(rng, '0123456789', 5, 8)}`, 0.4),
    zip: maybe(rng, str(rng, '0123456789', 5, 5), 0.6),
    phone: maybe(rng, str(rng, '0123456789', 10, 10), 0.5),
  };
}

describe('matchEngine properties', () => {
  it('property: adding an agreeing scored field never lowers the probabilistic score (monotonicity)', () => {
    forCases(400, 0xa11ce, (rng, i) => {
      const a = genTraits(rng);
      const b = genTraits(rng);
      const before = scoreProbabilisticMatch(a, b).score;

      // Choose a scored field where `a` carries a usable value, then make `b` agree.
      const candidates: (keyof IdentityTraits)[] = ['firstName', 'lastName', 'dob'];
      if (a.sex && a.sex !== 'unknown') candidates.push('sex');
      if (a.zip) candidates.push('zip');
      if (a.phone) candidates.push('phone');
      const field = pick(rng, candidates);
      const b2: IdentityTraits = { ...b, [field]: a[field] };

      const after = scoreProbabilisticMatch(a, b2).score;
      expect(after, `case ${i}: agreeing '${field}' lowered score ${before} -> ${after}`)
        .toBeGreaterThanOrEqual(before);
    });
  });

  it('property: deterministic rules short-circuit and findBestMatch reports confidence exactly 100', () => {
    forCases(200, 0xdead1, (rng, i) => {
      const a = genTraits(rng);
      let b = genTraits(rng);
      const which = int(rng, 0, 2);
      if (which === 0) {
        const id = `MCD-${str(rng, '0123456789', 6, 6)}`;
        a.medicaidId = id;
        b = { ...b, medicaidId: ` ${id.toUpperCase()} ` }; // normalize() must absorb case/space
      } else if (which === 1) {
        a.ssnLast4 = str(rng, '0123456789', 4, 4);
        b = { ...b, ssnLast4: a.ssnLast4, dob: a.dob };
      } else {
        a.firstName = genName(rng, FIRSTS) || 'x';
        a.lastName = genName(rng, LASTS) || 'y';
        b = { ...b, firstName: a.firstName, lastName: a.lastName, dob: a.dob };
      }
      const det = runDeterministicRules(a, b);
      expect(det.hit, `case ${i}: deterministic rule ${which} did not fire`).toBe(true);
      expect(det.rule).toBeTruthy();

      const candidate: SourceIdentityRecord = {
        sourceSystem: 'payer',
        sourceRecordId: `rec-${i}`,
        traits: b,
      };
      const result = findBestMatch(a, [candidate]);
      expect(result.tier).toBe('deterministic');
      expect(result.confidence).toBe(100);
    });
  });

  it('property: probabilistic score and deterministic hit are symmetric in their arguments', () => {
    forCases(400, 0x5e5e5, (rng, i) => {
      const a = genTraits(rng);
      const b = genTraits(rng);
      const ab = scoreProbabilisticMatch(a, b);
      const ba = scoreProbabilisticMatch(b, a);
      expect(ab.score, `case ${i}: score asymmetric`).toBe(ba.score);
      expect(runDeterministicRules(a, b).hit, `case ${i}: deterministic asymmetric`).toBe(
        runDeterministicRules(b, a).hit
      );
    });
  });

  it('property: tierForScore boundaries are exact at 90 and 60, and deterministic always wins', () => {
    // Exact boundary points.
    expect(tierForScore(MATCH_THRESHOLDS.autoLinkMin, false)).toBe('probabilistic-auto');
    expect(tierForScore(89.999, false)).toBe('possible-match');
    expect(tierForScore(MATCH_THRESHOLDS.possibleMatchMin, false)).toBe('possible-match');
    expect(tierForScore(59.999, false)).toBe('no-match');
    // Sweep the full range against the spec.
    forCases(300, 0x7135, (rng) => {
      const s = rng() * 110 - 5;
      const tier = tierForScore(s, false);
      const spec = s >= 90 ? 'probabilistic-auto' : s >= 60 ? 'possible-match' : 'no-match';
      expect(tier).toBe(spec);
      expect(tierForScore(s, true)).toBe('deterministic');
    });
  });

  it('property: no crash on missing/empty fields; score always within [0, 100]', () => {
    forCases(300, 0xe4471, (rng, i) => {
      const sparse = (): IdentityTraits => ({
        firstName: bool(rng, 0.4) ? '' : genName(rng, FIRSTS),
        lastName: bool(rng, 0.4) ? '' : genName(rng, LASTS),
        dob: bool(rng, 0.3) ? '' : genDob(rng),
        sex: maybe(rng, pick(rng, SEXES), 0.3),
        ssnLast4: maybe(rng, '', 0.2) ?? maybe(rng, str(rng, '0123456789', 4, 4), 0.3),
        medicaidId: maybe(rng, '', 0.2),
        zip: maybe(rng, '   ', 0.2),
        phone: maybe(rng, '', 0.2),
      });
      const a = sparse();
      const b = sparse();
      expect(() => runDeterministicRules(a, b), `case ${i}`).not.toThrow();
      const result = scoreProbabilisticMatch(a, b);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  it('property: Levenshtein-derived name similarity stays bounded — per-field weights within their caps', () => {
    forCases(300, 0x1e5b0, (rng, i) => {
      const a = genTraits(rng);
      const b = genTraits(rng);
      const { ruleHits } = scoreProbabilisticMatch(a, b);
      for (const h of ruleHits) {
        const cap =
          h.rule === 'lastName-similarity' ? 30
          : h.rule === 'firstName-similarity' ? 20
          : h.rule === 'dob-exact' ? 25
          : h.rule === 'sex-match' ? 5
          : 10; // zip-match / phone-match
        expect(h.weight, `case ${i}: ${h.rule} weight ${h.weight} out of [0, ${cap}]`)
          .toBeGreaterThanOrEqual(0);
        expect(h.weight, `case ${i}: ${h.rule} weight ${h.weight} out of [0, ${cap}]`)
          .toBeLessThanOrEqual(cap);
      }
    });
  });

  // FIXED (Cycle 2A finding 1 → Cycle 2 convergence): deterministic exact-match
  // rules now require every compared field to be non-empty post-trim, so records
  // with blank first+last names never fire 'name+dob-exact' on DOB alone.
  it('property: blank-name records must not deterministically match on DOB alone', () => {
    forCases(50, 0xf1d01, (rng) => {
      const dob = genDob(rng);
      const a: IdentityTraits = { firstName: '', lastName: ' ', dob };
      const b: IdentityTraits = { firstName: '  ', lastName: '', dob };
      expect(runDeterministicRules(a, b).hit).toBe(false);
    });
  });

  // FIXED (Cycle 2A finding 2 → Cycle 2 convergence): stringSimilarity now
  // returns 0 when either side is empty post-normalization — absence is not
  // agreement — so two records both missing names earn zero name weight.
  it('property: empty-vs-empty names must contribute zero probabilistic weight', () => {
    forCases(50, 0xf1d02, (rng) => {
      const a: IdentityTraits = { firstName: '', lastName: '', dob: genDob(rng) };
      const b: IdentityTraits = { firstName: '', lastName: '', dob: genDob(rng) + 'x' };
      const { ruleHits } = scoreProbabilisticMatch(a, b);
      const nameWeight = ruleHits
        .filter((h) => h.rule.endsWith('-similarity'))
        .reduce((s, h) => s + h.weight, 0);
      expect(nameWeight).toBe(0);
    });
  });
});
