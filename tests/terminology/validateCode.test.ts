import { afterEach, describe, expect, it } from 'vitest';
import * as clock from '@/lib/clock';
import {
  createSeedTerminologyService,
  seedTerminologyService,
  productionTerminologyService,
  TerminologyServiceNotConfiguredError,
  validateCodeVersioned,
  currentMembers,
} from '@/lib/terminology';

/**
 * I8A-ii wave A: validateCode is REAL member-of-bound-version validation, not a
 * flat allowlist. A governed coding is valid only if it is a member of the
 * value-set version the registry currently binds; the answer carries that
 * binding. Unknown code -> unknown-code; ungoverned system -> unsupported-system.
 * The production service stays fail-closed (throws).
 */
afterEach(() => clock.setClock(null));

// A date inside the FY2026 ICD-10-CM window and the active CMS-HCC V28 window.
const IN_WINDOW = () => new Date('2026-06-01T00:00:00Z');

describe('validateCode: member-of-bound-version', () => {
  const svc = createSeedTerminologyService({ now: IN_WINDOW });

  it('a member of the bound version is valid and carries the binding', () => {
    const v = svc.validateCode('ICD-10-CM', 'E11.9');
    expect(v).toMatchObject({ valid: true, status: 'valid', stub: true });
    expect(v.binding).toMatchObject({ assetId: 'icd-10-cm-fy2026', version: 'FY2026', current: true });
    expect(v.display).toMatch(/diabetes/i);
  });

  it('a governed but non-member code is unknown-code (still bound)', () => {
    const v = svc.validateCode('ICD-10-CM', 'X99.9-not-real');
    expect(v).toMatchObject({ valid: false, status: 'unknown-code', stub: true });
    expect(v.binding?.version).toBe('FY2026');
  });

  it('an ungoverned system is unsupported-system (no binding)', () => {
    const v = svc.validateCode('MADE-UP-SYSTEM', 'x');
    expect(v).toMatchObject({ valid: false, status: 'unsupported-system' });
    expect(v.binding).toBeUndefined();
  });

  it('validates each seeded system against its bound version', () => {
    expect(svc.validateCode('RxNorm', '310798').valid).toBe(true);
    expect(svc.validateCode('LOINC', '4548-4').valid).toBe(true);
    expect(svc.validateCode('SNOMED-CT', '44054006').valid).toBe(true);
    expect(svc.validateCode('CPT-HCPCS', '99213').valid).toBe(true);
    expect(svc.validateCode('HCC', 'HCC38').valid).toBe(true);
  });

  it('membership is exactly the seeded current allowlist (no phantom members)', () => {
    const members = currentMembers('ICD-10-CM');
    expect(members).toContain('E11.9');
    expect(members).not.toContain('R51'); // retired in the current version
  });
});

describe('validateCode: the default singleton reads the injectable clock', () => {
  it('binds the current ICD-10-CM version at check time', () => {
    clock.setClock(() => new Date('2026-06-01T00:00:00Z').getTime());
    const v = seedTerminologyService.validateCode('ICD-10-CM', 'E11.9');
    expect(v.binding).toMatchObject({ assetId: 'icd-10-cm-fy2026', status: 'active' });
  });
});

describe('validateCode: production stays fail-closed', () => {
  it('the production service throws NotConfigured (never a fake valid)', () => {
    expect(() => productionTerminologyService.validateCode('ICD-10-CM', 'E11.9')).toThrow(
      TerminologyServiceNotConfiguredError,
    );
  });

  it('validateCodeVersioned is pure and does not touch the production path', () => {
    const v = validateCodeVersioned('RxNorm', '197361', { asOf: IN_WINDOW() });
    expect(v).toMatchObject({ valid: true, status: 'valid' });
  });
});
