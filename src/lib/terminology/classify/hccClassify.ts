/**
 * HCC classification - the real-now, DATA-DRIVEN diagnosis-to-HCC grouping (Wave B).
 *
 * Maps an ICD-10-CM diagnosis to its CMS-HCC group via the seeded, versioned
 * crosswalk (classify/data/hcc-crosswalk.json). The result carries the model
 * (family + asset + version) and the registry CURRENCY verdict of that model
 * version, so a classification made against a superseded model is visible. HCC is
 * exposed as ONE of several risk families (classify/data/risk-families.json).
 *
 * Deterministic: the currency verdict is resolved against the value-set registry at
 * an injected `asOf` (or the registry's clock). Fail-closed for the production HCC
 * grouping service via the SAME `terminology` seam.
 */
import { getDataMode, type DataMode } from '@/lib/config/dataMode';
import { valueSetRegistry, type ValueSetRegistry } from '../registry';
import { TerminologyServiceNotConfiguredError, type CodeAssetBinding } from '../types';
import hccSeed from './data/hcc-crosswalk.json';
import riskFamilySeed from './data/risk-families.json';
import type { HccClassification, HccClassifier, HccModelRef, RiskFamily } from './types';

interface HccMapEntry {
  hcc: string;
  label: string;
}

interface HccSeedShape {
  model: HccModelRef;
  map: Record<string, HccMapEntry>;
}

interface RiskFamilySeedShape {
  families: RiskFamily[];
}

const HCC_DATA = hccSeed as unknown as HccSeedShape;
const RISK_FAMILIES = (riskFamilySeed as unknown as RiskFamilySeedShape).families;

/**
 * The registry currency of the model asset at `asOf` as a CodeAssetBinding, so the
 * classification records WHICH model version it bound to and whether it is current.
 */
function modelBinding(registry: ValueSetRegistry, model: HccModelRef, asOf?: Date): CodeAssetBinding {
  const flag = registry.checkCurrency(model.assetId, asOf);
  return { assetId: model.assetId, version: flag.version, status: flag.status, current: flag.current };
}

/** Build an HCC classifier over a crosswalk + family set + registry (all injectable for tests). */
export function makeHccClassifier(
  data: HccSeedShape = HCC_DATA,
  families: RiskFamily[] = RISK_FAMILIES,
  registry: ValueSetRegistry = valueSetRegistry,
): HccClassifier {
  return {
    id: 'seed-hcc-classifier',

    classify(diagnosisCode, asOf): HccClassification {
      const binding = modelBinding(registry, data.model, asOf);
      const entry = data.map[diagnosisCode];
      if (!entry) {
        // Unmapped diagnosis: NO group, never a fabricated one.
        return { scheme: 'HCC', code: diagnosisCode, group: null, classified: false, model: data.model, binding, stub: true };
      }
      return {
        scheme: 'HCC',
        code: diagnosisCode,
        group: entry.hcc,
        label: entry.label,
        classified: true,
        model: data.model,
        binding,
        stub: true,
      };
    },

    riskFamilies(): RiskFamily[] {
      return [...families];
    },

    riskFamily(id): RiskFamily | undefined {
      return families.find((f) => f.id === id);
    },
  };
}

/** The process-default seeded HCC classifier over the in-repo seed. */
export const seedHccClassifier: HccClassifier = makeHccClassifier();

/**
 * Live HCC grouping - the NOT-CONFIGURED production path. Throws
 * TerminologyServiceNotConfiguredError so a live-only classification fails closed
 * (never a fabricated group or the seed presented as live). Risk-family taxonomy is
 * static reference data and stays answerable in every mode.
 */
export const liveHccClassifier: HccClassifier = {
  id: 'live-hcc-classifier',
  classify(): HccClassification {
    throw new TerminologyServiceNotConfiguredError('classify (live HCC grouping service)');
  },
  riskFamilies(): RiskFamily[] {
    return [...RISK_FAMILIES];
  },
  riskFamily(id): RiskFamily | undefined {
    return RISK_FAMILIES.find((f) => f.id === id);
  },
};

/**
 * The HCC classifier for the current `terminology` dataMode. Extends the SAME seam
 * as validateCode/translate: production selects the fail-closed live classifier.
 */
export function selectHccClassifier(): HccClassifier {
  const mode: DataMode = getDataMode('terminology');
  return mode === 'production' ? liveHccClassifier : seedHccClassifier;
}

/** The risk-family taxonomy as data (HCC is one of several). Answerable in every mode. */
export function riskFamilyTaxonomy(): RiskFamily[] {
  return [...RISK_FAMILIES];
}
