// F3 survivorship  // DP-7
/**
 * Golden-record survivorship types (F3).
 *
 * The golden record is a PROJECTION: the system stores SOURCE-ATTRIBUTED FACTS
 * (who said what, when) and DERIVES the golden view from them plus the ranking
 * rules. Because the facts are the source of truth and the golden view is derived,
 * the rules can change and the golden view re-derives with NO data loss (DP-7).
 */

/** One field value as asserted by one source — the durable, never-overwritten fact. */
export interface SourceAttributedFact {
  /** The golden-record field this fact populates, e.g. 'firstName', 'dob', 'phone'. */
  field: string;
  value: string;
  /** The asserting source system, e.g. 'emr' | 'payer' | 'state-agency'. */
  source: string;
  /** ISO-8601 assertion time — the recency tiebreak within a source rank. */
  asOf: string;
}

/** Why a particular fact won its field — the per-field provenance of the golden view. */
export type SurvivorshipReason = 'source-ranked' | 'recency-fallback';

export interface FieldProvenance {
  field: string;
  value: string;
  /** The source whose fact won this field. */
  source: string;
  asOf: string;
  /** Index into the field's ranking that won (0 = top rank); -1 for recency fallback. */
  rank: number;
  reason: SurvivorshipReason;
  /** The tiebreak the ruleset applied to resolve equally-precedent facts (provenance label). */
  tiebreak: 'most-recent' | 'source-order';
}

/** The derived golden view + why each field holds the value it does. */
export interface GoldenRecord {
  /** The winning value per field — the golden view. */
  fields: Record<string, string>;
  /** Per-field provenance: which source won, at what rank, and why. */
  provenance: Record<string, FieldProvenance>;
  /** When this projection was derived (injected clock) — the view is disposable. */
  derivedAt: string;
}

/** Ranking rules AS DATA (data/survivorship-rules.json). */
export interface SurvivorshipRules {
  version: string;
  description?: string;
  /** Tiebreak among equally-precedent facts: 'most-recent' (newest asOf wins) or
   * 'source-order' (the fact the source declared first wins, regardless of timestamp). */
  tiebreak: 'most-recent' | 'source-order';
  /** Ranking applied to fields with no explicit entry. */
  defaultRanking: string[];
  /** field -> ordered source list (highest priority first). */
  fieldRankings: Record<string, string[]>;
}
