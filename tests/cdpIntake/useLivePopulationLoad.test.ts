import { describe, it, expect } from 'vitest';
import {
  aggregateDomains,
  aggregateSources,
  type SourceOutcome,
} from '@/app/cdp-assembly/useLivePopulationLoad';

const mk = (over: Partial<SourceOutcome>): SourceOutcome => ({
  sourceSystem: 'payer',
  file: 'f.json',
  memberId: 'm',
  held: false,
  loaded: 0,
  quarantined: 0,
  byDomain: {},
  ...over,
});

describe('useLivePopulationLoad · aggregateDomains', () => {
  it('sums admitted-per-domain across sources, sorted high→low', () => {
    const rows = aggregateDomains([
      mk({ byDomain: { sdoh: 3, 'labs-vitals': 1 } }),
      mk({ byDomain: { sdoh: 2 } }),
    ]);
    expect(rows).toEqual([
      { domain: 'sdoh', count: 5 },
      { domain: 'labs-vitals', count: 1 },
    ]);
  });

  it('returns an empty list when nothing was admitted', () => {
    expect(aggregateDomains([mk({})])).toEqual([]);
  });
});

describe('useLivePopulationLoad · aggregateSources', () => {
  it('collapses per-file outcomes into one row per source system, sorted by admitted', () => {
    const rows = aggregateSources([
      mk({ sourceSystem: 'emr', loaded: 2, quarantined: 1 }),
      mk({ sourceSystem: 'emr', loaded: 3, held: true }),
      mk({ sourceSystem: 'payer', loaded: 10 }),
    ]);
    expect(rows.map((r) => r.sourceSystem)).toEqual(['payer', 'emr']);
    expect(rows.find((r) => r.sourceSystem === 'emr')).toMatchObject({
      files: 2,
      loaded: 5,
      quarantined: 1,
      held: 1,
    });
  });

  it('labels an unattributed source rather than dropping it', () => {
    expect(aggregateSources([mk({ sourceSystem: '' })])[0].sourceSystem).toBe('(unattributed)');
  });
});
