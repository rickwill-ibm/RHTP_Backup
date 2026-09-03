/**
 * Hierarchy-aware RAF + ICD→HCC crosswalk (Wave D / decision 2) — adversarial suite.
 *
 * Proves the RAF engine applies DISEASE-HIERARCHY suppression (never a naive sum),
 * surfaces unweighted HCCs honestly (never silently 0), is a pure function of SWAPPABLE
 * model data, and that the ICD→HCC crosswalk is advisory + swappable + best-effort.
 * Also proves the `mapRiskProfile` integration: asserted HCCs drive `hierarchicalRaf`,
 * and ICD-only conditions drive an ADVISORY `suggestedRaf` (never asserted).
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  computeHierarchicalRaf,
  setRafModelData,
  resolveIcdToHcc,
  setHccCrosswalkProvider,
} from '@/lib/finance/riskAdjustment';
import { mapRiskProfile } from '@/lib/wpc/projectedAggregator.payerMappers';
import type { GraphNodeRecord } from '@/lib/graph/types';
import type { LensResult } from '@/lib/graph/lens/types';

afterEach(() => {
  setRafModelData(null); // restore the bundled stub after any swap
  setHccCrosswalkProvider(null);
});

describe('computeHierarchicalRaf — disease-hierarchy suppression', () => {
  it('suppresses the less-severe HCC when a superseding one is present (diabetes)', () => {
    const r = computeHierarchicalRaf(['HCC37', 'HCC38'], 'V28');
    expect(r.suppressedHccs).toEqual(['HCC38']); // with-complications supersedes without
    expect(r.includedHccs).toEqual(['HCC37']);
    expect(r.raf).toBe(0.318); // only HCC37's weight counts, never both
  });

  it('sums independent HCCs across families (no cross-family suppression)', () => {
    const r = computeHierarchicalRaf(['HCC38', 'HCC277'], 'V28'); // diabetes + COPD
    expect(r.suppressedHccs).toEqual([]);
    expect(r.raf).toBe(Math.round((0.19 + 0.284) * 1000) / 1000);
  });

  it('collapses a multi-level chain to the single most-severe HCC (CKD)', () => {
    const r = computeHierarchicalRaf(['HCC326', 'HCC328', 'HCC329'], 'V28');
    expect(r.includedHccs).toEqual(['HCC326']);
    expect(r.suppressedHccs.sort()).toEqual(['HCC328', 'HCC329']);
    expect(r.raf).toBe(0.451);
  });

  it('normalizes leading-zero HCC codes before suppression + weighting', () => {
    const r = computeHierarchicalRaf(['HCC037', 'HCC038'], 'V28');
    expect(r.includedHccs).toEqual(['HCC37']);
    expect(r.suppressedHccs).toEqual(['HCC38']);
  });

  it('surfaces an unweighted HCC honestly (never silently 0)', () => {
    const r = computeHierarchicalRaf(['HCC38', 'HCC999'], 'V28');
    expect(r.unweightedHccs).toEqual(['HCC999']);
    expect(r.includedHccs).toEqual(['HCC38']);
    expect(r.raf).toBe(0.19); // the unknown HCC adds nothing but is not hidden
  });

  it('an unknown model version yields raf 0 with every HCC surfaced as unweighted', () => {
    const r = computeHierarchicalRaf(['HCC38'], 'V99');
    expect(r.raf).toBe(0);
    expect(r.unweightedHccs).toEqual(['HCC38']);
  });

  it('is a pure function of SWAPPABLE model data (setRafModelData)', () => {
    setRafModelData({
      weights: { V28: { HCC1: 1.5, HCC2: 0.5 } },
      hierarchy: { V28: { HCC1: ['HCC2'] } },
    });
    const r = computeHierarchicalRaf(['HCC1', 'HCC2'], 'V28');
    expect(r.raf).toBe(1.5); // custom table + hierarchy applied
    expect(r.suppressedHccs).toEqual(['HCC2']);
  });
});

describe('resolveIcdToHcc — advisory, best-effort, swappable', () => {
  it('resolves a bundled ICD→HCC mapping (version-aware, case-insensitive)', () => {
    expect(resolveIcdToHcc('E11.9', 'V28')).toBe('HCC38');
    expect(resolveIcdToHcc('e11.65', 'V28')).toBe('HCC37');
    expect(resolveIcdToHcc('E11.9', 'V24')).toBe('HCC19'); // version-specific
  });
  it('returns undefined for an unmapped ICD or version (never a guess)', () => {
    expect(resolveIcdToHcc('Z00.00', 'V28')).toBeUndefined();
    expect(resolveIcdToHcc('E11.9', 'V99')).toBeUndefined();
    expect(resolveIcdToHcc('', 'V28')).toBeUndefined();
  });
  it('honors a swapped provider, then restores the bundled stub', () => {
    setHccCrosswalkProvider((icd) => (icd === 'X1' ? 'HCCX' : undefined));
    expect(resolveIcdToHcc('X1', 'V28')).toBe('HCCX');
    expect(resolveIcdToHcc('E11.9', 'V28')).toBeUndefined(); // provider owns resolution
    setHccCrosswalkProvider(null);
    expect(resolveIcdToHcc('E11.9', 'V28')).toBe('HCC38'); // bundled stub back
  });
});

// ── mapRiskProfile integration ─────────────────────────────────────────────────
function conditionNode(key: string, props: Record<string, string>): GraphNodeRecord {
  return { kind: 'Condition', key, labels: ['Condition'], properties: props, restricted: false };
}
function lensOf(nodes: GraphNodeRecord[]): LensResult {
  return { lens: 'whole-person', memberId: 'M1', nodes, edges: [] };
}

describe('mapRiskProfile — hierarchy-aware asserted RAF + advisory suggested uplift', () => {
  it('computes hierarchicalRaf from asserted HCCs with suppression applied', () => {
    const rp = mapRiskProfile(
      lensOf([
        conditionNode('Condition/1', { code: 'E11.65', hcc: 'HCC37' }),
        conditionNode('Condition/2', { code: 'E11.9', hcc: 'HCC38' }), // superseded by HCC37
      ])
    );
    expect(rp.hierarchicalRaf).toBeDefined();
    expect(rp.hierarchicalRaf!.includedHccs).toEqual(['HCC37']);
    expect(rp.hierarchicalRaf!.suppressedHccs).toEqual(['HCC38']);
    expect(rp.hierarchicalRaf!.raf).toBe(0.318);
    expect(rp.suggestedRaf).toBeUndefined(); // both conditions already have asserted HCCs
  });

  it('suggests an ADVISORY uplift for an ICD-only condition (never asserted)', () => {
    const rp = mapRiskProfile(
      lensOf([
        conditionNode('Condition/1', { code: 'J44.9', hcc: '' }), // COPD, no HCC coded → crosswalk suggests HCC277
      ])
    );
    expect(rp.hierarchicalRaf).toBeUndefined(); // nothing asserted
    expect(rp.suggestedRaf).toBeDefined();
    expect(rp.suggestedRaf!.fromIcds).toEqual(['J44.9']);
    expect(rp.suggestedRaf!.raf).toBe(0.284); // HCC277 weight, surfaced as a suggestion only
  });

  it('does not double-count: a suggested HCC already asserted is excluded from the uplift', () => {
    const rp = mapRiskProfile(
      lensOf([
        conditionNode('Condition/1', { code: 'J44.9', hcc: 'HCC277' }), // asserted COPD
        conditionNode('Condition/2', { code: 'J44.9', hcc: '' }), // same ICD, would suggest HCC277
      ])
    );
    expect(rp.hierarchicalRaf!.includedHccs).toEqual(['HCC277']);
    expect(rp.suggestedRaf).toBeUndefined(); // HCC277 already asserted → no phantom uplift
  });

  it('keeps highestRaf + assessments back-compat (unchanged behavior)', () => {
    const rp = mapRiskProfile(
      lensOf([
        {
          kind: 'RiskAssessment',
          key: 'RiskAssessment/1',
          labels: ['RiskAssessment'],
          properties: {
            rafScore: 2.8,
            predictedOutcome: 'readmission',
            probability: 0.4,
            method: 'demo',
          },
          restricted: false,
        },
      ])
    );
    expect(rp.highestRaf).toBe(2.8);
    expect(rp.assessments).toHaveLength(1);
    expect(rp.hierarchicalRaf).toBeUndefined(); // no coded conditions → no hierarchical RAF
  });
});
