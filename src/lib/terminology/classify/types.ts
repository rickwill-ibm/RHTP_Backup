/**
 * Classification types (Iteration 8A-ii, Wave B).
 *
 * Diagnosis-to-HCC classification is DATA-DRIVEN (a seeded, versioned crosswalk)
 * and VERSIONED (it carries the model asset + version, and the registry currency of
 * that version). HCC is exposed as ONE of several risk families (CMS-HCC / RxHCC /
 * HHS-HCC / CDPS), enumerated from data so no code hard-codes "HCC = the only model".
 */
import type { CodeAssetBinding } from '../types';

/** One risk-adjustment / classification family (reference metadata, from data). */
export interface RiskFamily {
  /** Stable id, e.g. `cms-hcc`. */
  id: string;
  /** Human name, e.g. `CMS-HCC`. */
  name: string;
  /** The program it scores, e.g. `Medicare Advantage (Part C)`. */
  program: string;
  /** The population it applies to. */
  population: string;
  steward: string;
  /** Canonical system identifier for the family. */
  system: string;
  /** The registry asset id of this family's active model version. */
  activeAssetId: string;
}

/** Which risk model (family + versioned asset) a classification was resolved against. */
export interface HccModelRef {
  family: string;
  assetId: string;
  version: string;
  system: string;
}

/**
 * Result of an HCC classification. `group` is the HCC group (e.g. `HCC38`) or null
 * when the diagnosis is unmapped. `model` names the seeded model version that
 * produced the grouping; `binding` is the registry currency verdict of that model
 * asset at check time (so a classification made against a superseded model is
 * visible as not-current). PHI-free.
 */
export interface HccClassification {
  scheme: 'HCC';
  /** The source diagnosis code classified. */
  code: string;
  /** The HCC group, or null when the diagnosis maps to no group. */
  group: string | null;
  label?: string;
  classified: boolean;
  model: HccModelRef;
  /** Registry currency of the bound model asset/version at check time. */
  binding: CodeAssetBinding;
  /** true for the seeded answer, so no caller mistakes it for a live HCC grouping service. */
  stub: boolean;
}

/** The classification service surface. */
export interface HccClassifier {
  readonly id: string;
  /** Map a diagnosis code to its HCC group via the seeded, versioned crosswalk. */
  classify(diagnosisCode: string, asOf?: Date): HccClassification;
  /** The risk-family taxonomy as data (HCC is one of several). */
  riskFamilies(): RiskFamily[];
  /** One risk family by id, or undefined. */
  riskFamily(id: string): RiskFamily | undefined;
}
