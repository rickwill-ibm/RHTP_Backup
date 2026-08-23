/**
 * Retention policy engine — select-by-policy (age / category / consent).
 * Pure + deterministic: time is passed as nowMs, never read from a clock.
 */
import { describe, it, expect } from 'vitest';
import {
  selectByPolicy,
  selectByPolicies,
  itemMatchesPolicy,
  validateRetentionPolicy,
  EmptyRetentionPolicyError,
  type PurgeableItem,
  type RetentionPolicy,
} from '@/lib/lifecycle';

const NOW = Date.parse('2026-08-23T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function item(over: Partial<PurgeableItem>): PurgeableItem {
  return {
    id: over.id ?? 'r1',
    store: over.store ?? 'fhir',
    subjectRef: over.subjectRef ?? 'mem-1',
    category: over.category,
    createdAt: over.createdAt ?? '2026-08-01T00:00:00.000Z',
    consentWithdrawn: over.consentWithdrawn,
  };
}

describe('retention selection — age', () => {
  const policy: RetentionPolicy = { id: 'age-30d', description: 'older than 30d', maxAgeMs: 30 * DAY };

  it('selects items older than the max age', () => {
    const old = item({ id: 'old', createdAt: '2026-06-01T00:00:00.000Z' }); // ~83 days
    const fresh = item({ id: 'fresh', createdAt: '2026-08-20T00:00:00.000Z' }); // 3 days
    const got = selectByPolicy([old, fresh], policy, NOW);
    expect(got.map((i) => i.id)).toEqual(['old']);
  });

  it('an item exactly at the threshold is selected (>=)', () => {
    const exactly = item({ id: 'edge', createdAt: new Date(NOW - 30 * DAY).toISOString() });
    expect(selectByPolicy([exactly], policy, NOW).map((i) => i.id)).toEqual(['edge']);
  });
});

describe('retention selection — category', () => {
  const policy: RetentionPolicy = {
    id: 'cat',
    description: 'AuditEvent + Observation',
    categories: ['AuditEvent', 'Observation'],
  };
  it('selects only items whose category is in the set', () => {
    const items = [
      item({ id: 'a', category: 'AuditEvent' }),
      item({ id: 'b', category: 'Observation' }),
      item({ id: 'c', category: 'CarePlan' }),
      item({ id: 'd', category: undefined }),
    ];
    expect(selectByPolicy(items, policy, NOW).map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('retention selection — consent-withdrawal', () => {
  const policy: RetentionPolicy = {
    id: 'consent',
    description: 'purge on consent withdrawal',
    consentWithdrawn: true,
  };
  it('selects only items whose subject withdrew consent', () => {
    const items = [
      item({ id: 'withdrawn', consentWithdrawn: true }),
      item({ id: 'active', consentWithdrawn: false }),
      item({ id: 'unknown', consentWithdrawn: undefined }),
    ];
    expect(selectByPolicy(items, policy, NOW).map((i) => i.id)).toEqual(['withdrawn']);
  });
});

describe('retention selection — combined criteria are AND', () => {
  const policy: RetentionPolicy = {
    id: 'combo',
    description: 'old AND consent-withdrawn Observations',
    maxAgeMs: 30 * DAY,
    categories: ['Observation'],
    consentWithdrawn: true,
  };
  it('requires every criterion to hold', () => {
    const match = item({ id: 'yes', category: 'Observation', consentWithdrawn: true, createdAt: '2026-01-01T00:00:00.000Z' });
    const wrongCat = item({ id: 'cat', category: 'CarePlan', consentWithdrawn: true, createdAt: '2026-01-01T00:00:00.000Z' });
    const tooFresh = item({ id: 'fresh', category: 'Observation', consentWithdrawn: true, createdAt: '2026-08-22T00:00:00.000Z' });
    const consented = item({ id: 'consented', category: 'Observation', consentWithdrawn: false, createdAt: '2026-01-01T00:00:00.000Z' });
    expect(selectByPolicy([match, wrongCat, tooFresh, consented], policy, NOW).map((i) => i.id)).toEqual(['yes']);
  });
});

describe('retention selection — target scoping', () => {
  it('a policy with a target only matches items from that store', () => {
    const policy: RetentionPolicy = { id: 't', description: 'care-plan only', maxAgeMs: 0, target: 'care-plan' };
    const items = [item({ id: 'cp', store: 'care-plan' }), item({ id: 'fhir', store: 'fhir' })];
    expect(selectByPolicy(items, policy, NOW).map((i) => i.id)).toEqual(['cp']);
  });
});

describe('retention selection — safety: a criteria-less policy is refused', () => {
  it('validateRetentionPolicy throws on an empty policy', () => {
    const empty: RetentionPolicy = { id: 'empty', description: 'no criteria' };
    expect(() => validateRetentionPolicy(empty)).toThrow(EmptyRetentionPolicyError);
    expect(() => selectByPolicy([item({})], empty, NOW)).toThrow(EmptyRetentionPolicyError);
  });
  it('itemMatchesPolicy never matches a criteria-less policy (defense in depth)', () => {
    const empty: RetentionPolicy = { id: 'empty', description: 'no criteria' };
    expect(itemMatchesPolicy(item({}), empty, NOW)).toBe(false);
  });
});

describe('selectByPolicies — de-dupe by first matching policy', () => {
  it('an item matched by two policies is claimed once, by the first', () => {
    const p1: RetentionPolicy = { id: 'first', description: 'observations', categories: ['Observation'] };
    const p2: RetentionPolicy = { id: 'second', description: 'old', maxAgeMs: 0 };
    const obs = item({ id: 'x', category: 'Observation' });
    const sels = selectByPolicies([obs], [p1, p2], NOW);
    expect(sels).toHaveLength(1);
    expect(sels[0].policyId).toBe('first');
  });
});
