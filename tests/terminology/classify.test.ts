import { afterEach, describe, expect, it } from 'vitest';
import { clearSessionDataModes, setSessionDataMode } from '@/lib/config/dataMode';
import { createValueSetRegistry } from '@/lib/terminology';
import {
  makeHccClassifier,
  riskFamilyTaxonomy,
  seedHccClassifier,
  selectHccClassifier,
  TerminologyServiceNotConfiguredError,
} from '@/lib/terminology';

/**
 * Classification (Iteration 8A-ii, Wave B): diagnosis-to-HCC grouping is
 * data-driven and versioned (carries the model asset + version + registry
 * currency); an unmapped diagnosis returns NO group (never fabricated); the risk
 * family taxonomy (CMS-HCC / RxHCC / HHS-HCC / CDPS) is enumerated as data so HCC
 * is clearly ONE of several; the live-only classify path fails closed.
 */
// A fixed asOf inside the CMS-HCC V28 window so currency is deterministic.
const AS_OF = new Date('2026-06-01T00:00:00.000Z');

describe('HCC classification - data-driven + versioned', () => {
  it('maps a seeded ICD-10 diagnosis to its HCC group with the model version', () => {
    const c = seedHccClassifier.classify('E11.9', AS_OF);
    expect(c).toMatchObject({ scheme: 'HCC', group: 'HCC38', classified: true, stub: true });
    expect(c.label).toBeTruthy();
    expect(c.model).toMatchObject({ family: 'CMS-HCC', assetId: 'cms-hcc-v28', version: 'V28' });
    // Bound to a versioned registry asset, marked current at asOf.
    expect(c.binding).toMatchObject({ assetId: 'cms-hcc-v28', version: 'V28', current: true });
  });

  it('an unmapped diagnosis returns NO group (never a fabricated group)', () => {
    const c = seedHccClassifier.classify('Z59.82', AS_OF);
    expect(c.classified).toBe(false);
    expect(c.group).toBeNull();
    // Still carries the model provenance (which model version was consulted).
    expect(c.model.version).toBe('V28');
  });

  it('classification is DATA-DRIVEN - a custom crosswalk changes the answer', () => {
    const custom = makeHccClassifier(
      { model: { family: 'CMS-HCC', assetId: 'cms-hcc-v28', version: 'V28', system: 'urn:cms:risk-adjustment:hcc' },
        map: { 'A00.0': { hcc: 'HCC99', label: 'demo' } } },
    );
    expect(custom.classify('A00.0', AS_OF).group).toBe('HCC99');
    expect(custom.classify('E11.9', AS_OF).group).toBeNull();
  });

  it('the bound version currency is deterministic via asOf (superseded model flagged)', () => {
    // Point the classifier at the superseded V24 model and check after its window.
    const registry = createValueSetRegistry();
    const v24 = makeHccClassifier(
      { model: { family: 'CMS-HCC', assetId: 'cms-hcc-v24', version: 'V24', system: 'urn:cms:risk-adjustment:hcc' },
        map: { 'E11.9': { hcc: 'HCC38', label: 'demo' } } },
      undefined,
      registry,
    );
    const c = v24.classify('E11.9', AS_OF);
    expect(c.binding.assetId).toBe('cms-hcc-v24');
    expect(c.binding.current).toBe(false); // V24 is superseded
  });
});

describe('risk-family taxonomy - HCC is one of several (as data)', () => {
  it('enumerates CMS-HCC, RxHCC, HHS-HCC and CDPS', () => {
    const families = riskFamilyTaxonomy();
    const names = families.map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(['CMS-HCC', 'RxHCC', 'HHS-HCC', 'CDPS']));
    expect(families.length).toBeGreaterThanOrEqual(4);
    // CMS-HCC is ONE family, not the whole taxonomy.
    expect(names).toContain('CMS-HCC');
    expect(names.length).toBeGreaterThan(1);
  });

  it('each family carries its program + active model asset id (data-driven)', () => {
    for (const f of seedHccClassifier.riskFamilies()) {
      expect(f.program).toBeTruthy();
      expect(f.activeAssetId).toBeTruthy();
      expect(f.system).toBeTruthy();
    }
    expect(seedHccClassifier.riskFamily('cms-hcc')?.activeAssetId).toBe('cms-hcc-v28');
    expect(seedHccClassifier.riskFamily('rxhcc')?.name).toBe('RxHCC');
  });
});

describe('classification - seam selection + fail-closed live path', () => {
  afterEach(() => clearSessionDataModes());

  it('mock/seeded modes select the seeded classifier', () => {
    setSessionDataMode('terminology', 'seeded');
    expect(selectHccClassifier().id).toBe('seed-hcc-classifier');
  });

  it('production classify fails closed - throws NotConfigured, never a fabricated group', () => {
    setSessionDataMode('terminology', 'production');
    const classifier = selectHccClassifier();
    expect(() => classifier.classify('E11.9', AS_OF)).toThrow(TerminologyServiceNotConfiguredError);
    // Risk-family taxonomy is static reference data, answerable in every mode.
    expect(classifier.riskFamilies().length).toBeGreaterThanOrEqual(4);
  });
});
