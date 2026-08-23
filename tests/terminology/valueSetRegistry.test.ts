import { describe, expect, it } from 'vitest';
import {
  createValueSetRegistry,
  valueSetRegistry,
  validateAgainstAssetVersion,
  TerminologyRefreshNotConfiguredError,
  ASSET_FAMILIES,
  type TerminologyAsset,
} from '@/lib/terminology/registry';
import { seedTerminologyService } from '@/lib/terminology';

/**
 * Terminology-asset registry (Iteration 4): the facility that manages currency,
 * versioning, and lifecycle of every governed value set / code system /
 * classification across families. Deterministic via an injected clock / asOf.
 */

const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function makeAsset(over: Partial<TerminologyAsset>): TerminologyAsset {
  return {
    id: 'test-asset',
    name: 'Test Asset',
    family: 'clinical',
    steward: 'Test Steward',
    system: 'urn:test:system',
    version: 'v1',
    effectiveDate: '2025-01-01',
    status: 'active',
    lastRefreshed: '2025-01-01',
    refreshCadence: 'annual',
    bindingStrength: 'extensible',
    sourceUrl: 'https://example.test',
    ...over,
  };
}

describe('ValueSetRegistry: register + get + getActiveVersion', () => {
  it('registers an asset and reads it back', () => {
    const reg = createValueSetRegistry({ assets: [], bindings: [] });
    const asset = makeAsset({ id: 'a1' });
    reg.register(asset);
    expect(reg.get('a1')).toEqual(asset);
    expect(reg.list()).toHaveLength(1);
  });

  it('getActiveVersion returns the active version in the same system group', () => {
    const superseded = makeAsset({ id: 'x-v1', system: 'urn:x', status: 'superseded', version: 'v1' });
    const active = makeAsset({ id: 'x-v2', system: 'urn:x', status: 'active', version: 'v2' });
    const reg = createValueSetRegistry({ assets: [superseded, active], bindings: [], now: () => at('2025-06-01') });
    // Asking from the superseded id still resolves to the active version.
    expect(reg.getActiveVersion('x-v1')?.id).toBe('x-v2');
    expect(reg.getActiveVersion('x-v2')?.version).toBe('v2');
  });
});

describe('ValueSetRegistry: isCurrent (currency window)', () => {
  it('is true for an in-window active asset', () => {
    const a = makeAsset({ id: 'cur', effectiveDate: '2025-01-01', expirationDate: '2026-12-31' });
    const reg = createValueSetRegistry({ assets: [a], bindings: [] });
    expect(reg.isCurrent('cur', at('2026-03-01'))).toBe(true);
  });

  it('is false for an expired asset', () => {
    const a = makeAsset({ id: 'exp', effectiveDate: '2024-01-01', expirationDate: '2024-12-31' });
    const reg = createValueSetRegistry({ assets: [a], bindings: [] });
    expect(reg.isCurrent('exp', at('2026-03-01'))).toBe(false);
    const verdict = reg.checkCurrency('exp', at('2026-03-01'));
    expect(verdict).toMatchObject({ current: false, flagged: true });
    expect(verdict.reason).toMatch(/expiration/);
  });

  it('is false for a superseded status regardless of window', () => {
    const a = makeAsset({ id: 'sup', status: 'superseded' });
    const reg = createValueSetRegistry({ assets: [a], bindings: [] });
    expect(reg.isCurrent('sup', at('2025-06-01'))).toBe(false);
  });
});

describe('ValueSetRegistry: listStale', () => {
  it('finds an asset past its refresh cadence', () => {
    const fresh = makeAsset({ id: 'fresh', lastRefreshed: '2026-08-01', refreshCadence: 'monthly' });
    const stalePastCadence = makeAsset({ id: 'stale', lastRefreshed: '2026-01-01', refreshCadence: 'monthly' });
    const reg = createValueSetRegistry({ assets: [fresh, stalePastCadence], bindings: [] });
    const stale = reg.listStale(at('2026-08-22')).map((a) => a.id);
    expect(stale).toContain('stale');
    expect(stale).not.toContain('fresh');
  });

  it('finds an expired asset as stale, and treats irregular cadence as not clock-stale', () => {
    const expired = makeAsset({ id: 'exp', expirationDate: '2025-12-31', refreshCadence: 'irregular' });
    const irregularFresh = makeAsset({ id: 'irr', lastRefreshed: '2000-01-01', refreshCadence: 'irregular' });
    const reg = createValueSetRegistry({ assets: [expired, irregularFresh], bindings: [] });
    const stale = reg.listStale(at('2026-06-01')).map((a) => a.id);
    expect(stale).toContain('exp');
    expect(stale).not.toContain('irr');
  });
});

describe('ValueSetRegistry: resolveBinding', () => {
  it('returns the active value set + version for a domain/purpose', () => {
    const b = valueSetRegistry.resolveBinding('risk-adjustment', 'medicare-advantage');
    expect(b).toBeDefined();
    expect(b).toMatchObject({ assetId: 'cms-hcc-v28', valueSet: 'CMS-HCC', current: true });
    expect(b?.bindingStrength).toBe('required');
  });

  it('resolves SDOH screening to the Gravity value set', () => {
    const b = valueSetRegistry.resolveBinding('sdoh', 'screening');
    expect(b?.assetId).toBe('gravity-sdoh-2.6');
    expect(b?.valueSet).toMatch(/Gravity/);
  });

  it('returns undefined for an unknown binding', () => {
    expect(valueSetRegistry.resolveBinding('nope', 'nope')).toBeUndefined();
  });
});

describe('ValueSetRegistry: code validated against a superseded version is flagged', () => {
  it('flags currency when a valid code is checked against the superseded CMS-HCC V24', () => {
    // E11.9 is a real seeded ICD-10 code; but if it was risk-scored against the
    // superseded CMS-HCC V24 model, the currency check must flag it.
    const checked = validateAgainstAssetVersion(
      seedTerminologyService,
      valueSetRegistry,
      'cms-hcc-v24',
      'ICD-10-CM',
      'E11.9',
    );
    expect(checked.validation.valid).toBe(true);
    expect(checked.currency).toMatchObject({ current: false, flagged: true, status: 'superseded' });
  });

  it('does not flag currency when checked against the active CMS-HCC V28', () => {
    const checked = validateAgainstAssetVersion(
      seedTerminologyService,
      valueSetRegistry,
      'cms-hcc-v28',
      'ICD-10-CM',
      'E11.9',
      at('2025-06-01'), // within the annual refresh cadence of lastRefreshed 2025-04-01
    );
    expect(checked.currency).toMatchObject({ current: true, flagged: false });
  });

  it('seeded validateCode attaches the active binding for the system', () => {
    const v = seedTerminologyService.validateCode('ICD-10-CM', 'E11.9');
    expect(v.binding).toBeDefined();
    expect(v.binding).toMatchObject({ assetId: 'icd-10-cm-fy2026', status: 'active' });
  });
});

describe('ValueSetRegistry: all governed families are seeded', () => {
  it('covers clinical / risk / quality / behavioral / social / privacy', () => {
    const families = valueSetRegistry.families().sort();
    for (const fam of ASSET_FAMILIES) {
      expect(families).toContain(fam);
    }
    expect([...ASSET_FAMILIES].sort()).toEqual(
      ['behavioral', 'clinical', 'privacy', 'quality', 'risk', 'social'],
    );
  });

  it('seeds HCC as one of several risk models (CMS-HCC, RxHCC, HHS-HCC, CDPS)', () => {
    const riskNames = new Set(valueSetRegistry.list('risk').map((a) => a.name));
    expect(riskNames).toEqual(new Set(['CMS-HCC', 'RxHCC', 'HHS-HCC', 'CDPS']));
  });
});

describe('ValueSetRegistry: production refresh is the not-configured stub', () => {
  it('refresh throws naming the authority + operation', () => {
    expect(() => valueSetRegistry.refresh('cms-hcc-v28')).toThrow(TerminologyRefreshNotConfiguredError);
    try {
      valueSetRegistry.refresh('gravity-sdoh-2.6');
    } catch (err) {
      expect(err).toBeInstanceOf(TerminologyRefreshNotConfiguredError);
      expect((err as TerminologyRefreshNotConfiguredError).authority).toMatch(/Gravity/);
      expect((err as Error).message).toMatch(/VSAC|CMS|Gravity|NLM/);
    }
  });
});
