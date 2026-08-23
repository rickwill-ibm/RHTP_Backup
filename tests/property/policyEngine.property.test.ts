/**
 * Property-style tests — generalized policy engine (src/lib/policy/policyEngine.ts,
 * policyLibrary.ts, criteria.ts). Seeded deterministic generation via _prng.ts.
 */
import { describe, expect, it } from 'vitest';
import { evaluate } from '@/lib/policy/policyEngine';
import { governedCodes, loadMockLibrary } from '@/lib/policy/policyLibrary';
import {
  CARDIAC_MRI_0520_CRITERIA,
  evaluateCriteria,
  evaluatePredicate,
  type CriteriaMemberFacts,
  type Predicate,
} from '@/lib/policy/criteria';
import type { MemberContext, OrderContext } from '@/lib/policy/types';
import { forCases, int, maybe, pick, str, subset, type Rng } from './_prng';

const OUTCOMES = [
  'pa-required-criteria-review',
  'pa-required-list',
  'likely-denial-experimental',
  'no-policy-found',
  'no-pa-required',
] as const;

const library = loadMockLibrary();

/** Every ICD-10 code any policy in the corpus covers — the "on-label" pool. */
const coveredIcdPool: string[] = [
  ...new Set(library.policies.flatMap((p) => p.codes?.icd10Covered ?? [])),
];

/** Every CPT/HCPCS code the corpus governs. */
const governedCodePool: string[] = [...new Set(library.policies.flatMap(governedCodes))];

const GARBAGE_ICD = ['Z00.0', 'XX', '', 'K21.9', '💥', 'I4', 'ABC.DEF'];

/**
 * Codes a policy actively ENFORCES (covered / not-covered / PA-list buckets).
 * Codes appearing only in the "other/related" buckets are deliberately ignored
 * by classifyMatch, so they are excluded here.
 */
function enforcedCodes(p: (typeof library.policies)[number]): string[] {
  const out = new Set<string>();
  if (p.codes) {
    for (const bucket of [
      p.codes.cptCovered,
      p.codes.cptNotCovered,
      p.codes.hcpcsCovered,
      p.codes.hcpcsNotCovered,
    ]) {
      for (const c of bucket) out.add(c);
    }
  }
  if (p.allPaCodes) for (const c of p.allPaCodes) out.add(c);
  return [...out];
}

function genMember(rng: Rng, i: number): MemberContext {
  const dxCount = int(rng, 0, 4);
  const diagnoses = Array.from({ length: dxCount }, () => {
    const roll = rng();
    if (roll < 0.4 && coveredIcdPool.length) return { code: pick(rng, coveredIcdPool) };
    if (roll < 0.7) return { code: pick(rng, GARBAGE_ICD) };
    return { code: undefined, display: 'uncoded condition' };
  });
  return {
    memberId: `M-${i}`,
    payer: maybe(rng, 'UnitedHealthcare Community Plan — Texas STAR', 0.5),
    diagnoses,
  };
}

function genOrder(rng: Rng): OrderContext {
  const roll = rng();
  const code =
    roll < 0.7 && governedCodePool.length
      ? pick(rng, governedCodePool)
      : pick(rng, ['99999', '00000', '', 'ZZZZZ', str(rng, '0123456789', 5, 5)]);
  return { code, codeSystem: maybe(rng, pick(rng, ['CPT', 'HCPCS'] as const), 0.7) };
}

describe('policy engine properties', () => {
  it('property: the 17-policy corpus loads and indexes', () => {
    expect(library.policies.length).toBe(17);
    expect(governedCodePool.length).toBeGreaterThan(0);
    expect(coveredIcdPool.length).toBeGreaterThan(0);
    for (const p of library.policies) {
      for (const c of governedCodes(p)) {
        expect(library.findByCode(c)).toContain(p);
      }
    }
  });

  it('property: evaluation is deterministic — same input twice yields identical output', () => {
    forCases(150, 0xdece11, (rng, i) => {
      const member = genMember(rng, i);
      const order = genOrder(rng);
      const first = evaluate(member, order, library);
      const second = evaluate(member, order, library);
      expect(JSON.stringify(second), `case ${i}: code ${order.code}`).toBe(JSON.stringify(first));
    });
  });

  it('property: every policy evaluates every governed code without throwing, outputs well-formed', () => {
    const rngSeed = 0xc0de5;
    let cases = 0;
    for (const p of library.policies) {
      const codes = enforcedCodes(p);
      // Sample up to 20 governed codes per policy (seeded), plus always the first.
      const sampled = codes.length <= 20 ? codes : codes.filter((_, idx) => idx % Math.ceil(codes.length / 20) === 0);
      forCases(sampled.length * 3, rngSeed + cases, (rng, i) => {
        const code = sampled[i % sampled.length];
        const member = genMember(rng, i);
        const det = evaluate(member, { code }, library);
        expect(OUTCOMES).toContain(det.outcome);
        expect(det.outcome, `policy ${p.policyId} code ${code} should be governed`).not.toBe(
          'no-policy-found'
        );
        expect(typeof det.requiresPA).toBe('boolean');
        expect(det.propensityToDeny).toBeGreaterThanOrEqual(0);
        expect(det.propensityToDeny).toBeLessThanOrEqual(100);
        expect([true, false, null]).toContain(det.criteriaMet);
        expect(det.matchedPolicies.length).toBeGreaterThan(0);
        cases++;
      });
    }
    expect(cases).toBeGreaterThan(100);
  });

  it('property: any policy match fails closed — requiresPA true, never an approval outcome', () => {
    forCases(300, 0xfa11c1, (rng, i) => {
      const member = genMember(rng, i);
      const order = genOrder(rng);
      const det = evaluate(member, order, library);
      if (det.matchedPolicies.length > 0) {
        // The engine never green-lights a governed code without PA.
        expect(det.requiresPA, `case ${i}: governed code ${order.code} skipped PA`).toBe(true);
        expect(det.outcome).not.toBe('no-pa-required');
        expect(det.outcome).not.toBe('no-policy-found');
      } else {
        expect(det.outcome).toBe('no-policy-found');
        expect(det.requiresPA).toBe(false);
      }
      // Unknown criteria (no published ICD list) must stay in review, never approve.
      if (det.outcome === 'pa-required-criteria-review' && det.criteriaMet === null) {
        expect(det.requiresPA).toBe(true);
        expect(det.propensityToDeny).toBeGreaterThan(0);
      }
      // criteriaMet=false must surface a deficiency (the gap is visible, not silent).
      if (det.criteriaMet === false) {
        expect(det.deficiencies.length).toBeGreaterThan(0);
      }
    });
  });

  it('property: unknown criteria predicate kinds fail closed (false), and boolean composition is sound', () => {
    forCases(200, 0xbadc, (rng, i) => {
      const facts: CriteriaMemberFacts = {
        diagnoses: subset(rng, ['I42.0', 'I48.91', 'Z00', ''], 0.5).map((code) => ({ code })),
        ageYears: maybe(rng, int(rng, 0, 95), 0.7),
        priorTherapies: maybe(rng, subset(rng, ['rate-control', 'ace-inhibitor'], 0.5), 0.7),
      };
      const unknown = { kind: 'someFutureKind', payload: i } as unknown as Predicate;
      expect(evaluatePredicate(unknown, facts), `case ${i}: unknown kind approved`).toBe(false);
      // not(unknown) is therefore true — composition treats unknown as failed, not thrown.
      expect(evaluatePredicate({ kind: 'not', of: unknown }, facts)).toBe(true);
      // all([]) is vacuously true, any([]) false — standard boolean identities hold.
      expect(evaluatePredicate({ kind: 'all', of: [] }, facts)).toBe(true);
      expect(evaluatePredicate({ kind: 'any', of: [] }, facts)).toBe(false);
    });
  });

  it('property: unreviewed criteria sets always surface smeReviewed=false (auto-approve gate)', () => {
    forCases(100, 0x53e, (rng, i) => {
      const facts: CriteriaMemberFacts = {
        diagnoses: [{ code: pick(rng, ['I42.0', 'I48.0', 'I40.1', 'Z99', ''] as const) }],
        ageYears: int(rng, 0, 90),
        priorTherapies: subset(rng, ['rate-control'], 0.5),
      };
      const evaln = evaluateCriteria(CARDIAC_MRI_0520_CRITERIA, facts);
      expect(evaln.smeReviewed, `case ${i}`).toBe(false);
      expect(evaln.evaluatedIndications.length).toBe(CARDIAC_MRI_0520_CRITERIA.rules.length);
      for (const ind of evaln.satisfiedIndications) {
        expect(evaln.evaluatedIndications).toContain(ind);
      }
      expect(evaln.met).toBe(evaln.satisfiedIndications.length > 0);
    });
  });

  it('property: ungoverned codes never throw and never require PA from this library', () => {
    forCases(200, 0xf00d, (rng, i) => {
      const code = `X${str(rng, 'ABCDEFGHIJ0123456789', 4, 8)}`; // outside CPT/HCPCS space
      if (governedCodePool.includes(code)) return; // paranoia: skip an accidental collision
      const member = genMember(rng, i);
      const det = evaluate(member, { code }, library);
      expect(det.outcome).toBe('no-policy-found');
      expect(det.requiresPA).toBe(false);
      expect(det.matchedPolicies).toEqual([]);
    });
  });
});
