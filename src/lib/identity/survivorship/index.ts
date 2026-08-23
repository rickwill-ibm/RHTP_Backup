// F3 survivorship — public surface (barrel).
/**
 * Golden-record survivorship (F3): source-ranked rules AS DATA, a golden-record
 * builder that derives a golden VIEW with per-field provenance, and the projection
 * principle that lets rules change without data loss (DP-7).
 */
export type {
  SourceAttributedFact,
  FieldProvenance,
  GoldenRecord,
  SurvivorshipRules,
  SurvivorshipReason,
} from './types';
export { DEFAULT_SURVIVORSHIP_RULES, validateRules, rankingFor } from './rules';
export { buildGoldenRecord, type BuildGoldenRecordOptions } from './goldenRecord';
