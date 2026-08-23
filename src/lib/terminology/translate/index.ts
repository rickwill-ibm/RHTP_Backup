/**
 * $translate cross-map - public surface (Iteration 8A-ii, Wave B).
 *
 * translate() over the seeded crosswalks (ICD-10-CM <-> CMS-HCC, SNOMED-CT <->
 * ICD-10-CM), returning the target coding(s) with the crosswalk asset id + version.
 * NO-MAP (empty) for an untranslatable code, never a fabricated target. The live
 * ConceptMap $translate stays fail-closed via the `terminology` seam until wired.
 */
export {
  makeCrosswalkTranslator,
  seedCrosswalkTranslator,
  liveCrosswalkTranslator,
  selectCrosswalkTranslator,
} from './crosswalkTranslate';
export type {
  CrosswalkTranslator,
  CrosswalkTranslation,
  CrosswalkTarget,
  CrosswalkProvenance,
} from './types';
