/**
 * HW-AI-B / I25 — fairness / disparate-impact monitoring (four-fifths rule).
 */
import { describe, it, expect } from 'vitest';
import { aggregate, disparateImpact, type CohortOutcome } from '../../../src/lib/agents/governance';

function outcomes(cohort: string, favorable: number, total: number): CohortOutcome[] {
  return Array.from({ length: total }, (_, i) => ({ cohort, favorable: i < favorable }));
}

describe('disparate-impact (four-fifths rule)', () => {
  it('flags a cohort whose favorable rate is below 80% of the reference', () => {
    // A: 9/10 = 0.9 (reference); B: 5/10 = 0.5 -> ratio 0.56 < 0.8 -> flagged
    const r = disparateImpact([...outcomes('A', 9, 10), ...outcomes('B', 5, 10)]);
    expect(r.referenceRate).toBeCloseTo(0.9, 5);
    expect(r.ratios['B']).toBeLessThan(0.8);
    expect(r.flagged).toContain('B');
    expect(r.fair).toBe(false);
  });

  it('passes when all cohorts are within four-fifths', () => {
    const r = disparateImpact([...outcomes('A', 9, 10), ...outcomes('B', 8, 10)]);
    expect(r.flagged).toHaveLength(0);
    expect(r.fair).toBe(true);
  });

  it('does not flag a below-threshold cohort with too small a sample', () => {
    // B has only 3 outcomes (< minSample 5) -> reported but not flagged
    const r = disparateImpact([...outcomes('A', 9, 10), ...outcomes('B', 0, 3)], 5);
    expect(r.flagged).not.toContain('B');
  });

  it('aggregate computes per-cohort favorable rates', () => {
    const stats = aggregate([...outcomes('A', 1, 2), ...outcomes('B', 3, 4)]);
    expect(stats.find((s) => s.cohort === 'A')!.favorableRate).toBeCloseTo(0.5, 5);
    expect(stats.find((s) => s.cohort === 'B')!.favorableRate).toBeCloseTo(0.75, 5);
  });
});
