/**
 * Survivorship SOURCE-ORDER tiebreak (iter11 wave C).
 *
 * The ruleset declares a tiebreak ('most-recent' | 'source-order') for resolving
 * equally-precedent facts. It was declared but IGNORED — winnerForField always used
 * most-recent. These tests prove the tiebreak is now HONORED, deterministic, and
 * provenance-labeled, both within a source rank and in the recency-fallback branch.
 */
import { describe, it, expect } from 'vitest';
import {
  buildGoldenRecord,
  DEFAULT_SURVIVORSHIP_RULES,
  type SourceAttributedFact,
  type SurvivorshipRules,
} from '@/lib/identity/survivorship';

const fixedNow = () => 1_700_000_000_000;

/** The default rules but with the source-order tiebreak. */
const SOURCE_ORDER_RULES: SurvivorshipRules = { ...DEFAULT_SURVIVORSHIP_RULES, tiebreak: 'source-order' };

// Two emr facts for phone, DECLARED oldest-first: the source's first line (older asOf)
// is the canonical one under source-order; the newer one wins under most-recent.
const PHONE_FACTS: SourceAttributedFact[] = [
  { field: 'phone', value: '605-555-0100', source: 'emr', asOf: '2026-01-01T00:00:00Z' },
  { field: 'phone', value: '605-555-0199', source: 'emr', asOf: '2026-05-01T00:00:00Z' },
];

describe('the declared tiebreak is honored (was ignored before)', () => {
  it('most-recent picks the NEWEST fact within the winning source rank (default, unchanged)', () => {
    const golden = buildGoldenRecord(PHONE_FACTS, { now: fixedNow }); // default rules = most-recent
    expect(golden.fields.phone).toBe('605-555-0199');
    expect(golden.provenance.phone).toMatchObject({
      source: 'emr', asOf: '2026-05-01T00:00:00Z', reason: 'source-ranked', tiebreak: 'most-recent',
    });
  });

  it('source-order picks the fact the source DECLARED FIRST, regardless of timestamp', () => {
    const golden = buildGoldenRecord(PHONE_FACTS, { rules: SOURCE_ORDER_RULES, now: fixedNow });
    // The older, first-declared emr fact wins — the tiebreak no longer chases recency.
    expect(golden.fields.phone).toBe('605-555-0100');
    expect(golden.provenance.phone).toMatchObject({
      source: 'emr', asOf: '2026-01-01T00:00:00Z', reason: 'source-ranked', tiebreak: 'source-order',
    });
  });

  it('the two tiebreaks disagree on the SAME facts — proof the tiebreak drives the result', () => {
    const recent = buildGoldenRecord(PHONE_FACTS, { now: fixedNow }).fields.phone;
    const ordered = buildGoldenRecord(PHONE_FACTS, { rules: SOURCE_ORDER_RULES, now: fixedNow }).fields.phone;
    expect(recent).not.toBe(ordered);
  });
});

describe('source-order also governs the recency-fallback branch (no ranked source)', () => {
  // Unranked source 'chc', two facts declared oldest-first.
  const FALLBACK_FACTS: SourceAttributedFact[] = [
    { field: 'nickname', value: 'M', source: 'chc', asOf: '2026-01-01T00:00:00Z' },
    { field: 'nickname', value: 'Mari', source: 'chc', asOf: '2026-03-01T00:00:00Z' },
  ];

  it('most-recent surfaces the newest unranked fact', () => {
    const golden = buildGoldenRecord(FALLBACK_FACTS, { now: fixedNow });
    expect(golden.fields.nickname).toBe('Mari');
    expect(golden.provenance.nickname).toMatchObject({ rank: -1, reason: 'recency-fallback', tiebreak: 'most-recent' });
  });

  it('source-order surfaces the first-declared unranked fact', () => {
    const golden = buildGoldenRecord(FALLBACK_FACTS, { rules: SOURCE_ORDER_RULES, now: fixedNow });
    expect(golden.fields.nickname).toBe('M');
    expect(golden.provenance.nickname).toMatchObject({ rank: -1, reason: 'recency-fallback', tiebreak: 'source-order' });
  });
});

describe('the honored tiebreak stays deterministic', () => {
  it('source-order derivation is reproducible and does not mutate the facts', () => {
    const snapshot = JSON.stringify(PHONE_FACTS);
    const a = buildGoldenRecord(PHONE_FACTS, { rules: SOURCE_ORDER_RULES, now: fixedNow });
    const b = buildGoldenRecord(PHONE_FACTS, { rules: SOURCE_ORDER_RULES, now: fixedNow });
    expect(a).toEqual(b);
    expect(JSON.stringify(PHONE_FACTS)).toBe(snapshot);
  });

  it('a higher-ranked source still outranks the tiebreak (tiebreak only breaks ties WITHIN a rank)', () => {
    // dob ranks state-agency first; source-order must not let a lower source win.
    const facts: SourceAttributedFact[] = [
      { field: 'dob', value: '1985-04-12', source: 'state-agency', asOf: '2026-06-01T00:00:00Z' },
      { field: 'dob', value: '1985-04-13', source: 'emr', asOf: '2026-01-01T00:00:00Z' },
    ];
    const golden = buildGoldenRecord(facts, { rules: SOURCE_ORDER_RULES, now: fixedNow });
    expect(golden.fields.dob).toBe('1985-04-12'); // state-agency (rank 0) wins regardless of tiebreak
    expect(golden.provenance.dob).toMatchObject({ source: 'state-agency', rank: 0 });
  });
});
