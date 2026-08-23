/**
 * Classification - public surface (Iteration 8A-ii, Wave B).
 *
 * Data-driven, versioned diagnosis-to-HCC classification over the seeded crosswalk,
 * plus the risk-family taxonomy (CMS-HCC / RxHCC / HHS-HCC / CDPS) as data so HCC is
 * clearly ONE family of several. Production HCC grouping stays fail-closed via the
 * `terminology` seam until wired.
 */
export {
  makeHccClassifier,
  seedHccClassifier,
  liveHccClassifier,
  selectHccClassifier,
  riskFamilyTaxonomy,
} from './hccClassify';
export type { HccClassifier, HccClassification, HccModelRef, RiskFamily } from './types';
