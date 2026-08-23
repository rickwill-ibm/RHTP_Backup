import { describe, expect, it } from 'vitest';
import {
  productionTerminologyService,
  seedTerminologyService,
  TerminologyServiceNotConfiguredError,
  TERMINOLOGY_SYSTEMS,
} from '@/lib/terminology';

/**
 * Terminology / semantic-validation seam (Iteration 4): validateCode passes for
 * a seeded code and fails for a bogus one; translate/classify return clearly
 * stub-marked results; classify returns an HCC group for a seeded ICD-10 code;
 * the production service throws NotConfigured naming the terminology operations.
 */
describe('seedTerminologyService.validateCode', () => {
  it('passes for a seeded RxNorm code', () => {
    const v = seedTerminologyService.validateCode('RxNorm', '310798');
    expect(v).toMatchObject({ valid: true, status: 'valid', stub: true });
    expect(v.display).toMatch(/Hydrochlorothiazide/);
  });

  it('passes for a seeded LOINC and a seeded ICD-10 code', () => {
    expect(seedTerminologyService.validateCode('LOINC', '4548-4').valid).toBe(true);
    expect(seedTerminologyService.validateCode('ICD-10-CM', 'Z59.82').valid).toBe(true);
  });

  it('fails for a bogus code in a governed system (unknown-code)', () => {
    const v = seedTerminologyService.validateCode('RxNorm', '000-not-a-real-code');
    expect(v).toMatchObject({ valid: false, status: 'unknown-code', stub: true });
  });

  it('flags an ungoverned system as unsupported-system', () => {
    const v = seedTerminologyService.validateCode('MADE-UP-SYSTEM', 'x');
    expect(v).toMatchObject({ valid: false, status: 'unsupported-system' });
  });

  it('governs exactly the six code systems', () => {
    expect([...TERMINOLOGY_SYSTEMS]).toEqual(['RxNorm', 'LOINC', 'SNOMED-CT', 'ICD-10-CM', 'CPT-HCPCS', 'HCC']);
  });
});

describe('seedTerminologyService.classify (HCC)', () => {
  it('returns an HCC group for a seeded ICD-10 diagnosis (stub)', () => {
    const c = seedTerminologyService.classify('E11.9', 'HCC');
    expect(c).toMatchObject({ scheme: 'HCC', group: 'HCC38', classified: true, stub: true });
    expect(c.label).toBeTruthy();
  });

  it('returns no group for an unmapped code', () => {
    const c = seedTerminologyService.classify('Z59.82', 'HCC');
    expect(c).toMatchObject({ group: null, classified: false, stub: true });
  });

  it('answers value-set membership', () => {
    expect(seedTerminologyService.classify('Z59.82', 'value-set', 'sdoh-z-codes').classified).toBe(true);
    expect(seedTerminologyService.classify('E11.9', 'value-set', 'sdoh-z-codes').classified).toBe(false);
  });
});

describe('seedTerminologyService.translate ($translate stub)', () => {
  it('returns a mapped target code, marked stub', () => {
    const t = seedTerminologyService.translate('E11.9', 'ICD-10-CM', 'SNOMED-CT');
    expect(t).toMatchObject({ targetCode: '44054006', matched: true, stub: true });
  });

  it('returns null target when no mapping is known', () => {
    const t = seedTerminologyService.translate('310798', 'RxNorm', 'SNOMED-CT');
    expect(t).toMatchObject({ targetCode: null, matched: false, stub: true });
  });
});

describe('productionTerminologyService fails loud (not configured)', () => {
  it('validateCode throws naming $validate-code', () => {
    expect(() => productionTerminologyService.validateCode('RxNorm', '310798')).toThrow(
      TerminologyServiceNotConfiguredError,
    );
    expect(() => productionTerminologyService.validateCode('RxNorm', '310798')).toThrow(/\$validate-code/);
  });

  it('translate and classify throw NotConfigured', () => {
    expect(() => productionTerminologyService.translate('x', 'RxNorm', 'LOINC')).toThrow(
      TerminologyServiceNotConfiguredError,
    );
    expect(() => productionTerminologyService.classify('E11.9', 'HCC')).toThrow(
      TerminologyServiceNotConfiguredError,
    );
  });
});
