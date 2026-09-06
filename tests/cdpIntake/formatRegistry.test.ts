import { describe, it, expect } from 'vitest';
import {
  formatSpec,
  formatForFilename,
  registerFormat,
  allFormats,
} from '@/lib/cdp-intake/formatRegistry';

describe('cdp-intake/formatRegistry', () => {
  it('resolves the seeded SourceFormats', () => {
    expect(formatSpec('fhir-json')?.isFhir).toBe(true);
    expect(formatSpec('x12-834')?.adapter).toBe('eligibility834');
    expect(formatSpec('hl7v2-adt')?.arrivalMode).toBe('stream');
  });

  it('falls back to a filename-suffix heuristic', () => {
    expect(formatForFilename('member.fhir.json')?.format).toBe('fhir-json');
    expect(formatForFilename('eligibility.834.txt')?.format).toBe('x12-834');
    expect(formatForFilename('mystery.zzz')).toBeUndefined();
  });

  it('is extensible without touching the pipeline SourceFormat union', () => {
    registerFormat({
      format: 'ncpdp-script',
      adapter: 'medication',
      arrivalMode: 'batch',
      isFhir: false,
      extensions: ['.ncpdp'],
    });
    expect(formatSpec('ncpdp-script')?.adapter).toBe('medication');
    expect(allFormats().some((f) => f.format === 'ncpdp-script')).toBe(true);
  });
});
