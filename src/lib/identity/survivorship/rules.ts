// F3 survivorship
/**
 * Survivorship rules loader + validation (rules AS DATA).
 *
 * The default ruleset lives in data/survivorship-rules.json — pure data, no code —
 * so the ranking policy changes without a code change and the golden view
 * re-derives from the unchanged facts (DP-7, no data loss). A caller may also pass
 * its own SurvivorshipRules object (e.g. a policy loaded from a store) to prove the
 * projection re-derives under different rules.
 */
import rulesJson from './data/survivorship-rules.json';
import type { SurvivorshipRules } from './types';

/** The default ranking rules, loaded from data (validated at module load). */
export const DEFAULT_SURVIVORSHIP_RULES: SurvivorshipRules = validateRules(rulesJson);

/** Throws if the object is not a well-formed SurvivorshipRules; returns it typed otherwise. */
export function validateRules(raw: unknown): SurvivorshipRules {
  if (!raw || typeof raw !== 'object') {
    throw new TypeError('survivorship rules must be an object');
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.version !== 'string' || r.version.length === 0) {
    throw new TypeError('survivorship rules: version (non-empty string) required');
  }
  if (r.tiebreak !== 'most-recent' && r.tiebreak !== 'source-order') {
    throw new TypeError("survivorship rules: tiebreak must be 'most-recent' | 'source-order'");
  }
  if (!Array.isArray(r.defaultRanking) || !r.defaultRanking.every((s) => typeof s === 'string')) {
    throw new TypeError('survivorship rules: defaultRanking must be a string[]');
  }
  const fr = r.fieldRankings;
  if (!fr || typeof fr !== 'object') {
    throw new TypeError('survivorship rules: fieldRankings must be an object');
  }
  for (const [field, ranking] of Object.entries(fr as Record<string, unknown>)) {
    if (!Array.isArray(ranking) || !ranking.every((s) => typeof s === 'string')) {
      throw new TypeError(`survivorship rules: fieldRankings.${field} must be a string[]`);
    }
  }
  return {
    version: r.version,
    description: typeof r.description === 'string' ? r.description : undefined,
    tiebreak: r.tiebreak,
    defaultRanking: r.defaultRanking as string[],
    fieldRankings: fr as Record<string, string[]>,
  };
}

/** The ranking for one field: its explicit entry, or the default ranking. */
export function rankingFor(rules: SurvivorshipRules, field: string): string[] {
  return rules.fieldRankings[field] ?? rules.defaultRanking;
}
