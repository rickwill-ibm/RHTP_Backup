/**
 * Identity public surface (barrel).
 *
 * SHARED FILE (I8A shared-file partition): each wave appends ONLY its own
 * clearly-commented export block below. Do not edit another wave's block.
 */

// ── I8A wave A (F3 golden-record survivorship + cross-reference) ──────────────
export {
  buildGoldenRecord,
  DEFAULT_SURVIVORSHIP_RULES,
  validateRules,
  rankingFor,
  type SourceAttributedFact,
  type FieldProvenance,
  type GoldenRecord,
  type SurvivorshipRules,
  type SurvivorshipReason,
  type BuildGoldenRecordOptions,
} from './survivorship';
export {
  getCrossReferenceStore,
  setProductionCrossReferenceStoreFactory,
  CrossReferenceStoreNotConfiguredError,
  createXrefIndex,
  createMemoryCrossReferenceStore,
  defaultCrossReferenceStore,
  resetDefaultCrossReferenceStore,
  createPgCrossReferenceStore,
  ensureCrossReferenceSchema,
  type CrossReferenceStore,
  type XrefIndex,
  type XrefReader,
  type XrefLookup,
  type XrefLink,
} from './crossReference';
export { createXrefEmpiResolver, resolveEmpi, createEmpiResolver, empiResolver } from './empiResolver';

// ── I8A wave B (external EMPI made real: PIX/PDQ + PIXm/PDQm) ──────────────────
// Convergence (Wave D): the external seam is re-surfaced through the shared
// barrel so the identity public surface is complete. Sub-barrel is collision-free.
export * from './external';

// ── I8A wave C (F5 provider identity via NPI/NPPES) ───────────────────────────
// Convergence (Wave D): provider identity re-surfaced through the shared barrel.
export * from './provider';
