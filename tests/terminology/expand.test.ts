import { describe, expect, it } from 'vitest';
import { expandValueSet } from '@/lib/terminology';

/**
 * I8A-ii wave A: $expand enumerates the membership of a value-set VERSION, so a
 * membership check is real enumeration (not an opaque allowlist). The current
 * bound version and a modeled prior version enumerate differently: a code retired
 * in the current version is present in the prior expansion, absent from current.
 */
const AS_OF = new Date('2026-06-01T00:00:00Z');

describe('expandValueSet: current bound version', () => {
  it('enumerates the current ICD-10-CM (FY2026) membership', () => {
    const x = expandValueSet('ICD-10-CM', { asOf: AS_OF });
    expect(x).toBeDefined();
    expect(x!.version).toBe('FY2026');
    expect(x!.system).toBe('http://hl7.org/fhir/sid/icd-10-cm');
    const codes = x!.contains.map((e) => e.code);
    expect(codes).toContain('E11.9');
    expect(codes).not.toContain('R51'); // retired in FY2026
    expect(x!.total).toBe(codes.length);
    expect(x!.contains[0].display).toBeTruthy();
    expect(x!.truncated).toBe(false);
  });

  it('enumerates other governed systems', () => {
    expect(expandValueSet('RxNorm', { asOf: AS_OF })!.contains.map((e) => e.code)).toContain('310798');
    expect(expandValueSet('HCC', { asOf: AS_OF })!.contains.map((e) => e.code)).toContain('HCC38');
  });
});

describe('expandValueSet: a modeled prior version differs', () => {
  it('the retired code is a member of the prior ICD-10-CM version (FY2025)', () => {
    const prior = expandValueSet('ICD-10-CM', { version: 'FY2025', asOf: AS_OF });
    expect(prior).toBeDefined();
    const codes = prior!.contains.map((e) => e.code);
    expect(codes).toContain('R51'); // valid in FY2025
    expect(codes).toContain('E11.9');
  });

  it('the retired HCC code is a member of the prior CMS-HCC version (V24)', () => {
    const prior = expandValueSet('HCC', { version: 'V24', asOf: AS_OF });
    expect(prior!.contains.map((e) => e.code)).toContain('HCC58');
    const current = expandValueSet('HCC', { version: 'V28', asOf: AS_OF });
    expect(current!.contains.map((e) => e.code)).not.toContain('HCC58');
  });
});

describe('expandValueSet: bounds and rejections', () => {
  it('returns undefined for an ungoverned system', () => {
    expect(expandValueSet('MADE-UP', { asOf: AS_OF })).toBeUndefined();
  });

  it('returns undefined for an unknown version', () => {
    expect(expandValueSet('ICD-10-CM', { version: 'FY1999', asOf: AS_OF })).toBeUndefined();
  });

  it('respects the enumeration cap (bounded, PHI-free)', () => {
    const x = expandValueSet('ICD-10-CM', { asOf: AS_OF, max: 2 });
    expect(x!.contains).toHaveLength(2);
    expect(x!.truncated).toBe(true);
    expect(x!.total).toBeGreaterThan(2);
  });
});
