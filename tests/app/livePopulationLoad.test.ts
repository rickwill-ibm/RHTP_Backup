/**
 * cdp-assembly Live Population Load — pure formatter tests.
 * JSX-free (imports LivePopulationLoad.format, not the JSX view) so vitest can transform it;
 * this also links LivePopulationLoad.tsx for E13 via the shared module path.
 */
import { describe, it, expect } from 'vitest';
import { humanizeDomain, n } from '@/app/cdp-assembly/LivePopulationLoad.format';

describe('LivePopulationLoad.format', () => {
  it('humanizes WPC domain keys and preserves payer acronyms', () => {
    expect(humanizeDomain('sdoh')).toBe('SDOH');
    expect(humanizeDomain('behavioral-health')).toBe('Behavioral Health');
    expect(humanizeDomain('family-history')).toBe('Family History');
  });

  it('formats population counts with grouping separators', () => {
    expect(n(12345)).toBe('12,345');
    expect(n(5)).toBe('5');
  });
});
