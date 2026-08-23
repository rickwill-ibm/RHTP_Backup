// F3 survivorship  // DP-7
/**
 * Golden-record BUILDER — derives the golden view from source-attributed facts.
 *
 * The golden record is a PROJECTION: given the durable facts (who asserted what,
 * when) and the ranking rules, it derives, per field, the winning value plus the
 * provenance of WHY it won. Nothing is overwritten — re-running with different
 * rules re-derives a different golden view from the SAME facts (no data loss).
 *
 * Per field:
 *   1. take the field's ranking (its own, else defaultRanking);
 *   2. walk the ranking top-first; the first source that asserted the field wins,
 *      and among that source's facts the ruleset's TIEBREAK chooses (see resolveTie);
 *   3. if NO ranked source asserted it, fall back to the tiebreak applied across all
 *      facts (reason 'recency-fallback', rank -1) — a value from an unranked source
 *      still surfaces rather than being dropped.
 *
 * The tiebreak is HONORED, not assumed: 'most-recent' picks the newest assertion,
 * 'source-order' picks the fact the source declared first (input order) regardless of
 * timestamp. Every winner is labeled with the tiebreak that decided it (provenance).
 *
 * Deterministic: most-recent breaks asOf ties by source then value, source-order is
 * stable input order, and derivedAt comes from an injected clock, so the projection
 * is reproducible without mocking globals.
 */
import * as clock from '@/lib/clock';
import { DEFAULT_SURVIVORSHIP_RULES, rankingFor } from './rules';
import type { FieldProvenance, GoldenRecord, SourceAttributedFact, SurvivorshipRules } from './types';

export interface BuildGoldenRecordOptions {
  rules?: SurvivorshipRules;
  /** Injected clock for derivedAt (default: clock.nowIso). */
  now?: () => number;
}

/** Stable, deterministic pick among facts of equal precedence: newest, then source, then value. */
function moreRecent(a: SourceAttributedFact, b: SourceAttributedFact): SourceAttributedFact {
  if (a.asOf !== b.asOf) return a.asOf > b.asOf ? a : b; // mut-equiv: guarded by asOf!==, so > and >= are identical (equal case unreachable)
  if (a.source !== b.source) return a.source < b.source ? a : b; // mut-equiv: guarded by source!==, so < and <= are identical
  return a.value <= b.value ? a : b; // mut-equiv: reached only when asOf+source already equal; <= vs < differ only when value is equal too, where a and b are observationally identical
}

/**
 * Resolve a set of equally-precedent facts under the ruleset's declared TIEBREAK.
 *   - 'most-recent': the newest assertion wins (asOf, then source, then value).
 *   - 'source-order': the fact the source DECLARED FIRST wins — the first in input
 *     order — regardless of timestamp. A stable choice that does not chase recency,
 *     e.g. an authoritative feed whose first line is canonical.
 * `facts` is always non-empty here. Both branches are deterministic given stable input.
 */
function resolveTie(
  facts: SourceAttributedFact[],
  tiebreak: SurvivorshipRules['tiebreak'],
): SourceAttributedFact {
  if (tiebreak === 'source-order') return facts[0];
  return facts.reduce(moreRecent);
}

function winnerForField(
  field: string,
  facts: SourceAttributedFact[],
  rules: SurvivorshipRules,
): FieldProvenance | null {
  if (facts.length === 0) return null;
  const ranking = rankingFor(rules, field);
  const tiebreak = rules.tiebreak;

  // Walk ranks top-first; first source with any fact wins, its facts resolved by tiebreak.
  for (let rank = 0; rank < ranking.length; rank++) { // mut-equiv: <= adds one iteration reading ranking[len]=undefined, which filters to zero facts and continues — identical behavior
    const source = ranking[rank];
    const atSource = facts.filter((f) => f.source === source);
    if (atSource.length === 0) continue;
    const chosen = resolveTie(atSource, tiebreak);
    return { field, value: chosen.value, source: chosen.source, asOf: chosen.asOf, rank, reason: 'source-ranked', tiebreak };
  }

  // No ranked source asserted this field: surface a fact anyway, resolved by tiebreak.
  const chosen = resolveTie(facts, tiebreak);
  return { field, value: chosen.value, source: chosen.source, asOf: chosen.asOf, rank: -1, reason: 'recency-fallback', tiebreak };
}

/**
 * Build the golden record (projection) from source-attributed facts + rules.
 * Pure aside from the injected clock; the facts argument is never mutated.
 */
export function buildGoldenRecord(
  facts: readonly SourceAttributedFact[],
  opts: BuildGoldenRecordOptions = {},
): GoldenRecord {
  const rules = opts.rules ?? DEFAULT_SURVIVORSHIP_RULES;
  const now = opts.now ?? clock.now;

  const byField = new Map<string, SourceAttributedFact[]>();
  for (const fact of facts) {
    const list = byField.get(fact.field) ?? [];
    list.push(fact);
    byField.set(fact.field, list);
  }

  const fields: Record<string, string> = {};
  const provenance: Record<string, FieldProvenance> = {};
  // Deterministic field order (sorted) so the projection is reproducible.
  for (const field of [...byField.keys()].sort()) {
    const winner = winnerForField(field, byField.get(field)!, rules);
    if (winner) {
      fields[field] = winner.value;
      provenance[field] = winner;
    }
  }

  return { fields, provenance, derivedAt: new Date(now()).toISOString() };
}
