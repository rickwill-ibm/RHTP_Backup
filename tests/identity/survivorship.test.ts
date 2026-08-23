/**
 * F3 golden-record survivorship (I8A wave A).
 *
 * Proves: survivorship picks the RANKED source per field and records provenance;
 * the golden record is a PROJECTION — changing the rules re-derives the golden view
 * from the SAME facts with NO data loss; recency breaks ties within a source rank;
 * an unranked source still surfaces via recency-fallback; derivation is
 * deterministic under an injected clock.
 */
import { describe, it, expect } from 'vitest';
import {
  buildGoldenRecord,
  DEFAULT_SURVIVORSHIP_RULES,
  validateRules,
  rankingFor,
  type SourceAttributedFact,
  type SurvivorshipRules,
} from '@/lib/identity/survivorship';

const fixedNow = () => 1_700_000_000_000;

// Source-attributed facts for one person across three feeds.
const FACTS: SourceAttributedFact[] = [
  { field: 'firstName', value: 'Maria', source: 'emr', asOf: '2026-01-01T00:00:00Z' },
  { field: 'firstName', value: 'MARIA', source: 'payer', asOf: '2026-02-01T00:00:00Z' },
  { field: 'dob', value: '1985-04-12', source: 'state-agency', asOf: '2026-01-01T00:00:00Z' },
  { field: 'dob', value: '1985-04-13', source: 'emr', asOf: '2026-06-01T00:00:00Z' },
  { field: 'phone', value: '605-555-0100', source: 'emr', asOf: '2026-01-01T00:00:00Z' },
  { field: 'phone', value: '605-555-0199', source: 'emr', asOf: '2026-05-01T00:00:00Z' },
];

describe('survivorship picks the ranked source per field with provenance', () => {
  it('firstName ranks emr first; dob ranks state-agency first (rank beats recency across sources)', () => {
    const golden = buildGoldenRecord(FACTS, { now: fixedNow });

    // firstName ranking ['emr','payer','state-agency'] -> emr wins.
    expect(golden.fields.firstName).toBe('Maria');
    expect(golden.provenance.firstName).toMatchObject({ source: 'emr', rank: 0, reason: 'source-ranked' });

    // dob ranking ['state-agency','payer','emr'] -> state-agency wins even though
    // the emr fact is MORE RECENT: a higher-ranked source outranks recency.
    expect(golden.fields.dob).toBe('1985-04-12');
    expect(golden.provenance.dob).toMatchObject({ source: 'state-agency', rank: 0, reason: 'source-ranked' });
  });

  it('recency breaks ties WITHIN a single source rank', () => {
    // phone has two emr facts; the newer (2026-05) wins.
    const golden = buildGoldenRecord(FACTS, { now: fixedNow });
    expect(golden.fields.phone).toBe('605-555-0199');
    expect(golden.provenance.phone).toMatchObject({ source: 'emr', asOf: '2026-05-01T00:00:00Z' });
  });

  it('an unranked source still surfaces via recency-fallback (never dropped)', () => {
    const facts: SourceAttributedFact[] = [
      { field: 'nickname', value: 'M', source: 'chc', asOf: '2026-01-01T00:00:00Z' },
      { field: 'nickname', value: 'Mari', source: 'chc', asOf: '2026-03-01T00:00:00Z' },
    ];
    const golden = buildGoldenRecord(facts, { now: fixedNow });
    expect(golden.fields.nickname).toBe('Mari'); // newest of the unranked source
    expect(golden.provenance.nickname).toMatchObject({ rank: -1, reason: 'recency-fallback' });
  });

  it('derivedAt is deterministic under the injected clock', () => {
    const golden = buildGoldenRecord(FACTS, { now: fixedNow });
    expect(golden.derivedAt).toBe(new Date(fixedNow()).toISOString());
  });
});

describe('the golden record is a PROJECTION: rules change without data loss', () => {
  it('re-deriving under different rules changes the golden view; the facts are untouched', () => {
    const before = buildGoldenRecord(FACTS, { now: fixedNow });
    expect(before.fields.dob).toBe('1985-04-12'); // state-agency wins by default

    // A rule change that ranks emr first for dob — same facts, new ranking.
    const altered: SurvivorshipRules = {
      ...DEFAULT_SURVIVORSHIP_RULES,
      fieldRankings: { ...DEFAULT_SURVIVORSHIP_RULES.fieldRankings, dob: ['emr', 'payer', 'state-agency'] },
    };
    const factsSnapshot = JSON.stringify(FACTS);
    const after = buildGoldenRecord(FACTS, { rules: altered, now: fixedNow });

    // The golden VIEW changed (emr's dob now wins) …
    expect(after.fields.dob).toBe('1985-04-13');
    expect(after.provenance.dob).toMatchObject({ source: 'emr', rank: 0 });
    // … from the SAME, unmutated facts (no data loss — facts are the source of truth).
    expect(JSON.stringify(FACTS)).toBe(factsSnapshot);
    // Non-reranked fields are unchanged across the two derivations.
    expect(after.fields.firstName).toBe(before.fields.firstName);
  });
});

describe('rules are loaded AS DATA and validated', () => {
  it('the default ruleset loads and exposes per-field rankings', () => {
    expect(DEFAULT_SURVIVORSHIP_RULES.version).toMatch(/\d+\.\d+\.\d+/);
    expect(rankingFor(DEFAULT_SURVIVORSHIP_RULES, 'firstName')[0]).toBe('emr');
    // A field with no explicit entry falls back to the default ranking.
    expect(rankingFor(DEFAULT_SURVIVORSHIP_RULES, 'unlisted-field')).toEqual(
      DEFAULT_SURVIVORSHIP_RULES.defaultRanking,
    );
  });

  it('validateRules rejects a malformed ruleset', () => {
    expect(() => validateRules({ version: '1', tiebreak: 'nope', defaultRanking: [], fieldRankings: {} })).toThrow();
    expect(() => validateRules({ version: '', tiebreak: 'most-recent', defaultRanking: [], fieldRankings: {} })).toThrow();
    expect(() => validateRules(null)).toThrow();
  });
});
