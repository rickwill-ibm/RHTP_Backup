/**
 * measures — external DEQM measure ingestion seam (HW4 / I19), contract C-MEAS.
 *
 * getCareGapView() resolves the `measures` dataMode seam:
 *   mock / seeded → the authored demo gaps (demo preserved exactly, constraint #4);
 *   production    → the external DEQM feed, via a REGISTERED loader, or fail CLOSED
 *                   (never a silent fabricated gap list presented as the real feed).
 *
 * The platform ingests measures; it does not compute them.
 */

import { getDataMode } from '@/lib/config/dataMode';
import { authoredMeasureGaps } from './mockMeasures';
import { ingestMeasureReports } from './deqmIngest';
import type { CareGapView, MeasureGap, MeasureProgram, FhirMeasureReport } from './types';

export type { CareGapView, MeasureGap, MeasureProgram, FhirMeasureReport } from './types';
export { ingestMeasureReport, ingestMeasureReports } from './deqmIngest';
export { authoredMeasureGaps } from './mockMeasures';

export class MeasuresFeedNotConfiguredError extends Error {
  constructor() {
    super('DATA_MODE measures=production but no external DEQM feed loader is registered (fail-closed)');
    this.name = 'MeasuresFeedNotConfiguredError';
  }
}

// The production feed loader returns the external system's DEQM MeasureReports.
let productionFeedLoader: (() => FhirMeasureReport[]) | null = null;

/** Register (or clear) the external DEQM feed loader (composition root / tests). */
export function setProductionMeasuresFeedLoader(loader: (() => FhirMeasureReport[]) | null): void {
  productionFeedLoader = loader;
}

function summarize(gaps: MeasureGap[], disposition: CareGapView['disposition']): CareGapView {
  const byProgram: Record<MeasureProgram, number> = { HEDIS: 0, STARS: 0, MIPS: 0 };
  let open = 0;
  for (const g of gaps) {
    byProgram[g.program] += 1;
    if (g.status !== 'closed') open += 1;
  }
  return { gaps, summary: { total: gaps.length, open, byProgram }, disposition };
}

/**
 * The care-gap + Stars view. Seam-switched: mock/seeded return the authored demo
 * gaps; production ingests the external DEQM feed (fail-closed if none registered).
 */
export function getCareGapView(): CareGapView {
  const mode = getDataMode('measures');
  if (mode === 'production') {
    if (!productionFeedLoader) throw new MeasuresFeedNotConfiguredError();
    return summarize(ingestMeasureReports(productionFeedLoader()), 'production');
  }
  return summarize(authoredMeasureGaps(), mode === 'seeded' ? 'seeded' : 'mock');
}
