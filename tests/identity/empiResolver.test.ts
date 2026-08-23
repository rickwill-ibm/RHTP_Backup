import { describe, it, expect } from 'vitest';
import {
  resolveEmpi,
  createEmpiResolver,
  type EmpiResolution,
} from '@/lib/identity/empiResolver';
import { HeldIdentityError } from '@/lib/pipeline/heldIdentity';
import { MATCH_THRESHOLDS } from '@/lib/identity/matchEngine';
import type { IdentitySource } from '@/lib/identity/identitySource';
import type { SourceIdentityRecord, SourceSystem } from '@/lib/identity/mpiTypes';

/**
 * EMPI-backed identity resolver (the litmus test): inbound records are anchored
 * by the REAL match engine, and a possible-match is HELD, never auto-linked.
 * A controlled in-memory IdentitySource with three candidates exercises the four
 * decision bands deterministically (scoring is the engine's, not reimplemented).
 */
const CANDIDATES: SourceIdentityRecord[] = [
  // Deterministic band: matched by exact medicaidId regardless of other fields.
  {
    sourceSystem: 'payer',
    sourceRecordId: 'rec-det',
    traits: { firstName: 'Zed', lastName: 'Zephyr', dob: '1960-01-01', medicaidId: 'DET-123' },
  },
  // Probabilistic-auto band: name near-miss (no deterministic name+dob-exact) but
  // lastName(30)+firstName~(18)+dob(25)+sex(5)+zip(10)+phone(10) >= 90.
  {
    sourceSystem: 'emr',
    sourceRecordId: 'rec-prob',
    traits: {
      firstName: 'Jonathan',
      lastName: 'Doe',
      dob: '1970-01-01',
      sex: 'male',
      zip: '99999',
      phone: '555-0100',
    },
  },
  // Possible-match band: lastName(30)+dob(25)+zip(10) = 65, first name differs.
  {
    sourceSystem: 'state-agency',
    sourceRecordId: 'rec-poss',
    traits: { firstName: 'Alice', lastName: 'Wonder', dob: '1988-08-08', zip: '11111' },
  },
];

const source: IdentitySource = {
  id: 'test-empi',
  mode: 'standalone',
  recordsFor: (s: SourceSystem) => CANDIDATES.filter((c) => c.sourceSystem === s),
};

const feed = 'test-feed';

describe('EMPI resolver — deterministic match links to the member', () => {
  it('an exact medicaidId hit resolves to a stable anchored member id (tier deterministic)', () => {
    const res = resolveEmpi('SRC-A', { feed, demographics: { medicaidId: 'DET-123', firstName: 'X', lastName: 'Y', dob: '1901-01-01' } }, source);
    expect(res.outcome).toBe('linked');
    expect(res.matchTier).toBe('deterministic');
    expect(res.confidence).toBe(100);
    expect(res.memberId).toMatch(/^mem-/);
    expect(res.provenance).toBe('empi-linked-deterministic');
  });

  it('consolidates: two different inbound records for the same person get the SAME anchored id', () => {
    const a = resolveEmpi('SRC-A', { feed, demographics: { medicaidId: 'DET-123' } }, source);
    const b = resolveEmpi('SRC-B', { feed, demographics: { medicaidId: 'DET-123', firstName: 'Totally', lastName: 'Different' } }, source);
    expect(a.memberId).toBe(b.memberId); // same matched candidate -> one enterprise identity
  });
});

describe('EMPI resolver — strong probabilistic match (>=90) auto-links', () => {
  it('a near-miss name at score >= autoLinkMin links (tier probabilistic-auto), not held', () => {
    const res = resolveEmpi(
      'SRC-C',
      { feed, demographics: { firstName: 'Jonathon', lastName: 'Doe', dob: '1970-01-01', sex: 'male', zip: '99999', phone: '555-0100' } },
      source,
    );
    expect(res.confidence).toBeGreaterThanOrEqual(MATCH_THRESHOLDS.autoLinkMin);
    expect(res.outcome).toBe('linked');
    expect(res.matchTier).toBe('probabilistic-auto');
    expect(res.memberId).toMatch(/^mem-/);
    expect(res.provenance).toBe('empi-linked-probabilistic');
  });
});

describe('EMPI resolver — possible-match band (60-90) is HELD, not auto-linked', () => {
  it('resolveEmpi reports outcome=held with no member id and a PHI-safe reason', () => {
    const res: EmpiResolution = resolveEmpi(
      'SRC-D',
      { feed, demographics: { firstName: 'Bob', lastName: 'Wonder', dob: '1988-08-08', zip: '11111' } },
      source,
    );
    expect(res.outcome).toBe('held');
    expect(res.confidence).toBeGreaterThanOrEqual(MATCH_THRESHOLDS.possibleMatchMin);
    expect(res.confidence).toBeLessThan(MATCH_THRESHOLDS.autoLinkMin);
    expect(res.memberId).toBe(''); // the whole point: never auto-attached
    expect(res.reasonCode).toBe('identity-possible-match');
    // PHI-safe audit summary: rule names + score only, no name/dob.
    expect(res.auditSummary).not.toMatch(/Wonder|Bob|1988/);
  });

  it('createEmpiResolver THROWS HeldIdentityError for a possible match (so the record is diverted)', () => {
    const resolve = createEmpiResolver(source);
    let thrown: unknown;
    try {
      resolve('SRC-D', { feed, demographics: { firstName: 'Bob', lastName: 'Wonder', dob: '1988-08-08', zip: '11111' } });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(HeldIdentityError);
    if (thrown instanceof HeldIdentityError) {
      expect(thrown.signal.reasonCode).toBe('identity-possible-match');
      expect(thrown.signal.matchTier).toBe('possible-match');
    }
  });
});

describe('EMPI resolver — no match mints a new anchored id with provenance', () => {
  it('an unrelated subject mints a fresh, deterministic id', () => {
    const res = resolveEmpi('SRC-E', { feed, demographics: { firstName: 'Nobody', lastName: 'Stranger', dob: '2001-12-31' } }, source);
    expect(res.outcome).toBe('minted');
    expect(res.confidence).toBeLessThan(MATCH_THRESHOLDS.possibleMatchMin);
    expect(res.memberId).toMatch(/^mem-/);
    expect(res.provenance).toBe('empi-minted-new');
    // Idempotent: same source id + feed -> same minted id (safe to replay).
    const again = resolveEmpi('SRC-E', { feed, demographics: { firstName: 'Nobody', lastName: 'Stranger', dob: '2001-12-31' } }, source);
    expect(again.memberId).toBe(res.memberId);
  });
});

describe('EMPI resolver — id-only calls still resolve (deterministic path)', () => {
  it('no demographics -> a minted id via the seam, no throw', () => {
    const resolve = createEmpiResolver(source);
    const id = resolve('SRC-F', { feed });
    expect(id).toMatch(/^mem-/);
    // resolveEmpi classifies it as an id-only mint.
    const res = resolveEmpi('SRC-F', { feed }, source);
    expect(res.outcome).toBe('minted');
    expect(res.matchTier).toBe('id-only');
  });

  it('bare id (no traits object at all) still resolves', () => {
    const resolve = createEmpiResolver(source);
    expect(resolve('SRC-G')).toMatch(/^mem-/);
  });
});
