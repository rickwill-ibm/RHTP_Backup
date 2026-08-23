/**
 * HW6 / I21 (HW6-2) — ICD-10-CM category rollup.
 */
import { describe, it, expect } from 'vitest';
import { icdCategory, icdChapter, rollupWithheldByCategory } from '../../src/lib/finance/riskAdjustment';
import type { HccCapture } from '../../src/lib/finance/riskAdjustment';

describe('icdCategory / icdChapter', () => {
  it('rolls a code up to its 3-char category and chapter', () => {
    expect(icdCategory('E11.9')).toBe('E11');
    expect(icdCategory('I50.32')).toBe('I50');
    expect(icdChapter('E11.9')).toBe('E');
    expect(icdCategory('bad')).toBe('');
    expect(icdCategory('')).toBe('');
  });
});

describe('rollupWithheldByCategory', () => {
  const cap = (icd: string, hcc: string): { capture: HccCapture; decision: { submittable: boolean; reason: string; deficiencies: string[] } } => ({
    capture: {
      hccCode: hcc, icdCode: icd, memberId: 'm', encounterId: 'e', dateOfService: '2026-01-01',
      providerNpi: '1234567890', meat: { monitored: false, evaluated: false, assessed: false, treated: false },
      status: 'active',
    },
    decision: { submittable: false, reason: 'not RADV-defensible', deficiencies: [] },
  });

  it('groups withheld captures by ICD category, most-frequent first', () => {
    const rollup = rollupWithheldByCategory([cap('E11.9', 'HCC18'), cap('E11.4', 'HCC18'), cap('I50.9', 'HCC85')]);
    expect(rollup[0]).toEqual({ category: 'E11', count: 2, hccCodes: ['HCC18'] });
    expect(rollup.find((r) => r.category === 'I50')).toEqual({ category: 'I50', count: 1, hccCodes: ['HCC85'] });
  });

  it('malformed codes roll into UNKNOWN', () => {
    const rollup = rollupWithheldByCategory([cap('', 'HCC1')]);
    expect(rollup[0].category).toBe('UNKNOWN');
  });
});
