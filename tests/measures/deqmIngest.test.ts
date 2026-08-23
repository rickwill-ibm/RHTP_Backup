/**
 * HW4 / I19 — external DEQM measure ingestion (C-MEAS).
 * Proves: production ingests DEQM MeasureReports into normalized gaps (and does not
 * compute them); mock returns the authored demo gaps (demo preserved); the seam
 * fails closed in production without a feed; and E15 parity holds between the two.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  getCareGapView,
  ingestMeasureReports,
  authoredMeasureGaps,
  setProductionMeasuresFeedLoader,
  MeasuresFeedNotConfiguredError,
  type FhirMeasureReport,
} from '../../src/lib/measures';
import { setSessionDataMode, clearSessionDataModes } from '../../src/lib/config/dataMode';
import { shapeOf, diffShape } from '../../src/lib/demoPreservation';

afterEach(() => {
  clearSessionDataModes();
  setProductionMeasuresFeedLoader(null);
});

const report = (id: string, denom: number, numer: number): FhirMeasureReport => ({
  resourceType: 'MeasureReport',
  id,
  type: 'summary',
  group: [{ population: [
    { code: { coding: [{ code: 'denominator' }] }, count: denom },
    { code: { coding: [{ code: 'numerator' }] }, count: numer },
  ] }],
  _meta: { measureId: 'CBP', measureName: 'Controlling High Blood Pressure', domain: 'Cardiovascular', contractName: 'MA-H1234', program: 'HEDIS' },
});

describe('DEQM ingestion (production derivation)', () => {
  it('derives gap = denominator - numerator, does not compute the measure', () => {
    const gaps = ingestMeasureReports([report('r1', 620, 397)]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].gapCount).toBe(223);
    expect(gaps[0].source).toBe('deqm');
    expect(gaps[0].status).toBe('open');
  });
  it('skips a report with no denominator (data-quality skip, not a fabricated gap)', () => {
    expect(ingestMeasureReports([{ resourceType: 'MeasureReport', group: [] }])).toHaveLength(0);
  });
});

describe('mock disposition preserves the authored demo gaps', () => {
  it('mock returns the authored HEDIS/STARS/MIPS gaps (11 total: 4+4+3)', () => {
    setSessionDataMode('measures', 'mock');
    const view = getCareGapView();
    expect(view.disposition).toBe('mock');
    expect(view.summary.byProgram).toEqual({ HEDIS: 4, STARS: 4, MIPS: 3 });
    expect(authoredMeasureGaps()).toHaveLength(11);
  });
});

describe('seam behavior', () => {
  it('production fails closed without a registered feed', () => {
    setSessionDataMode('measures', 'production');
    expect(() => getCareGapView()).toThrow(MeasuresFeedNotConfiguredError);
  });
  it('production ingests the registered DEQM feed', () => {
    setProductionMeasuresFeedLoader(() => [report('r1', 100, 60)]);
    setSessionDataMode('measures', 'production');
    const view = getCareGapView();
    expect(view.disposition).toBe('production');
    expect(view.gaps[0].source).toBe('deqm');
  });
  it('E15 parity: authored (mock) and DEQM (production) gaps are shape-equivalent', () => {
    const authored = authoredMeasureGaps()[0];
    const deqm = ingestMeasureReports([report('r1', 100, 60)])[0];
    // both satisfy the MeasureGap contract (values differ, structure does not)
    const diffs = diffShape(shapeOf({ ...authored, numerator: 0, denominator: 0 }), shapeOf(deqm));
    expect(diffs).toEqual([]);
  });
});
