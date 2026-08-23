import { afterEach, describe, expect, it } from 'vitest';
import { clearSessionDataModes, setSessionDataMode } from '@/lib/config/dataMode';
import {
  makeCrosswalkTranslator,
  seedCrosswalkTranslator,
  selectCrosswalkTranslator,
  TerminologyServiceNotConfiguredError,
} from '@/lib/terminology';

/**
 * $translate cross-map over the SEEDED crosswalks (Iteration 8A-ii, Wave B):
 * ICD-10-CM -> HCC and SNOMED-CT -> ICD-10-CM return the seeded target(s) with the
 * crosswalk asset id + version; an untranslatable code returns NO-MAP (never a
 * fabricated target); the live-only path fails closed via the terminology seam.
 */
describe('crosswalk $translate - real seeded cross-map', () => {
  it('ICD-10-CM -> HCC returns the seeded target with the crosswalk asset + version', () => {
    const t = seedCrosswalkTranslator.translate('ICD-10-CM', 'E11.9', 'HCC');
    expect(t.matched).toBe(true);
    expect(t.noMap).toBe(false);
    expect(t.targets).toEqual([
      { system: 'HCC', code: 'HCC38', display: 'Diabetes with glycemic, unspecified, or no complications' },
    ]);
    // Provenance: which versioned crosswalk produced the map.
    expect(t.crosswalk).toMatchObject({ assetId: 'cms-hcc-v28', version: 'V28', crosswalkId: 'icd10cm-to-cms-hcc-v28' });
    expect(t.stub).toBe(true);
  });

  it('SNOMED-CT -> ICD-10-CM returns the seeded target with asset + version', () => {
    const t = seedCrosswalkTranslator.translate('SNOMED-CT', '44054006', 'ICD-10-CM');
    expect(t.matched).toBe(true);
    expect(t.targets[0]).toMatchObject({ system: 'ICD-10-CM', code: 'E11.9' });
    expect(t.crosswalk).toMatchObject({ assetId: 'snomed-ct-us-20260301', version: 'US20260301' });
  });

  it('an untranslatable code returns NO-MAP (empty targets), never a fabricated target', () => {
    // Crosswalk exists for the pair, but this source code is unmapped.
    const unmapped = seedCrosswalkTranslator.translate('ICD-10-CM', 'Z59.82', 'HCC');
    expect(unmapped.matched).toBe(false);
    expect(unmapped.noMap).toBe(true);
    expect(unmapped.targets).toEqual([]);
    // The consulted crosswalk is still named (auditable), but no target is invented.
    expect(unmapped.crosswalk).toMatchObject({ assetId: 'cms-hcc-v28' });
  });

  it('no crosswalk for the system pair returns NO-MAP with crosswalk: null', () => {
    const none = seedCrosswalkTranslator.translate('RxNorm', '310798', 'LOINC');
    expect(none.matched).toBe(false);
    expect(none.noMap).toBe(true);
    expect(none.targets).toEqual([]);
    expect(none.crosswalk).toBeNull();
  });

  it('lists every seeded crosswalk with asset + version provenance', () => {
    const list = seedCrosswalkTranslator.listCrosswalks();
    expect(list.length).toBeGreaterThanOrEqual(3);
    for (const cw of list) {
      expect(cw.assetId).toBeTruthy();
      expect(cw.version).toBeTruthy();
    }
    expect(list.map((c) => `${c.sourceSystem}->${c.targetSystem}`)).toContain('ICD-10-CM->HCC');
    expect(list.map((c) => `${c.sourceSystem}->${c.targetSystem}`)).toContain('SNOMED-CT->ICD-10-CM');
  });

  it('a custom crosswalk set is honored (data-driven, no hard-coded maps)', () => {
    const custom = makeCrosswalkTranslator([
      {
        id: 'x', name: 'X', sourceSystem: 'ICD-10-CM', targetSystem: 'HCC', assetId: 'a', version: 'v1',
        steward: 's', sourceUrl: 'u', stub: true, map: { 'A00.0': [{ system: 'HCC', code: 'HCC1' }] },
      },
    ]);
    expect(custom.translate('ICD-10-CM', 'A00.0', 'HCC').targets[0].code).toBe('HCC1');
    // A code the default seed maps is NOT mapped by this custom set -> no-map.
    expect(custom.translate('ICD-10-CM', 'E11.9', 'HCC').noMap).toBe(true);
  });
});

describe('crosswalk $translate - seam selection + fail-closed live path', () => {
  afterEach(() => clearSessionDataModes());

  it('mock/seeded modes select the seeded translator', () => {
    setSessionDataMode('terminology', 'seeded');
    expect(selectCrosswalkTranslator().id).toBe('seed-crosswalk-translator');
    setSessionDataMode('terminology', 'mock');
    expect(selectCrosswalkTranslator().id).toBe('seed-crosswalk-translator');
  });

  it('production (live-only) $translate fails closed - throws NotConfigured, never a guessed map', () => {
    setSessionDataMode('terminology', 'production');
    const translator = selectCrosswalkTranslator();
    expect(() => translator.translate('ICD-10-CM', 'E11.9', 'HCC')).toThrow(TerminologyServiceNotConfiguredError);
    expect(() => translator.translate('ICD-10-CM', 'E11.9', 'HCC')).toThrow(/\$translate/);
  });
});
