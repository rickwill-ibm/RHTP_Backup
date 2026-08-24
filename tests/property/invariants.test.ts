/**
 * HW5-B / I27 — property / fuzz tests over the hardening logic.
 *
 * Invariant-based random testing (dependency-free, seeded PRNG so failures are
 * reproducible). Each block asserts a property that must hold for ALL inputs, not
 * just the hand-picked examples in the unit tests.
 */
import { describe, it, expect } from 'vitest';
import { contentHash, classify, type RecordState } from '../../src/lib/lifecycle';
import { ingestMeasureReports, type FhirMeasureReport } from '../../src/lib/measures';
import { assertTenantScope, type TenantScope } from '../../src/lib/security/tenant';
import { orderOfBenefits, type Coverage } from '../../src/lib/finance/submission';
import { isAdverseCoverageAction } from '../../src/lib/agents/governance';

// Seeded PRNG (mulberry32) — deterministic, reproducible.
function prng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = prng(0x1234abcd);
const int = (max: number) => Math.floor(R() * max);
const pick = <T>(arr: T[]): T => arr[int(arr.length)];
const RUNS = 300;

describe('property: contentHash', () => {
  it('is stable under key reordering and distinct on value change', () => {
    for (let i = 0; i < RUNS; i++) {
      const a = int(1000), b = int(1000), c = int(1000);
      expect(contentHash({ a, b, c })).toBe(contentHash({ c, b, a }));
      // changing one value changes the hash (collisions astronomically unlikely)
      expect(contentHash({ a, b, c })).not.toBe(contentHash({ a, b, c: c + 1 }));
    }
  });
});

describe('property: DEQM ingest gap count', () => {
  it('gapCount is always max(0, denom - numer) and never negative', () => {
    for (let i = 0; i < RUNS; i++) {
      const denom = int(1000) + 1;
      const numer = int(1200); // may exceed denom
      const report: FhirMeasureReport = {
        resourceType: 'MeasureReport', type: 'summary',
        group: [{ population: [
          { code: { coding: [{ code: 'denominator' }] }, count: denom },
          { code: { coding: [{ code: 'numerator' }] }, count: numer },
        ] }],
        _meta: { measureId: 'M', measureName: 'M', domain: 'D', contractName: 'C', program: 'HEDIS' },
      };
      const gap = ingestMeasureReports([report])[0];
      expect(gap.gapCount).toBe(Math.max(0, denom - numer));
      expect(gap.gapCount).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('property: tenant scope', () => {
  it('a member in the actor tenant set is allowed; outside is denied (non-demo)', () => {
    for (let i = 0; i < RUNS; i++) {
      const tenants = Array.from({ length: int(4) + 1 }, (_, k) => `t${k}`);
      const scope: TenantScope = { kind: 'single', tenantIds: tenants };
      const inside = pick(tenants);
      const outside = `x${int(9999)}`;
      expect(assertTenantScope(scope, { tenantId: inside, lob: 'medicaid' }).allow).toBe(true);
      expect(assertTenantScope(scope, { tenantId: outside, lob: 'medicaid' }).allow).toBe(
        tenants.includes(outside),
      );
    }
  });
});

describe('property: COB order', () => {
  it('medicaid is never primary when another coverage exists', () => {
    const types: Coverage['type'][] = ['medicare', 'commercial-active', 'commercial-retiree', 'medicaid', 'other'];
    for (let i = 0; i < RUNS; i++) {
      const n = int(4) + 2;
      const coverages: Coverage[] = Array.from({ length: n }, (_, k) => ({ coverageId: `c${k}`, type: pick(types) }));
      const hasNonMedicaid = coverages.some((c) => c.type !== 'medicaid');
      const primary = orderOfBenefits(coverages).ordered[0];
      if (hasNonMedicaid) expect(primary.type).not.toBe('medicaid');
    }
  });
});

describe('property: adverse-action classification is monotonic', () => {
  it('appending an adverse keyword always yields adverse=true', () => {
    const adverse = ['deny', 'termination', 'reduction', 'revoke', 'adverse'];
    for (let i = 0; i < RUNS; i++) {
      const base = `action-${int(1000)}`;
      expect(isAdverseCoverageAction({ actionType: `${base}-${pick(adverse)}` })).toBe(true);
    }
  });
});

describe('property: record lifecycle', () => {
  it('same hash on an active prior is always unchanged; different hash is always correction', () => {
    for (let i = 0; i < RUNS; i++) {
      const h1 = `h${int(1000)}`;
      const prior: RecordState = { key: 'k', hash: h1, status: 'active', version: 1, updatedAtMs: 0 };
      expect(classify(prior, { key: 'k', hash: h1, status: 'active', nowMs: 1 }).disposition).toBe('unchanged');
      const h2 = `${h1}-x`;
      expect(classify(prior, { key: 'k', hash: h2, status: 'active', nowMs: 1 }).disposition).toBe('correction');
    }
  });
});
