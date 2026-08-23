/**
 * HW3 / I17 — record lifecycle + content-hash idempotency (RP-01, CRUD-02).
 * Proves a true resend dedupes but a CORRECTION re-projects, and entered-in-error
 * voids/retracts.
 */
import { describe, it, expect } from 'vitest';
import {
  contentHash,
  classify,
  createMemoryRecordLifecycleStore,
  type RecordState,
} from '../../src/lib/lifecycle';

describe('contentHash', () => {
  it('is stable and order-independent, distinct on change', () => {
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
  });
});

describe('classify (pure)', () => {
  const base = (over: Partial<RecordState> = {}): RecordState => ({ key: 'k', hash: 'h1', status: 'active', version: 1, updatedAtMs: 0, ...over });
  it('new when no prior', () => {
    const r = classify(null, { key: 'k', hash: 'h1', status: 'active', nowMs: 1 });
    expect(r.disposition).toBe('new');
    expect(r.reproject).toBe(true);
  });
  it('unchanged (dedupe) when same hash', () => {
    const r = classify(base(), { key: 'k', hash: 'h1', status: 'active', nowMs: 2 });
    expect(r.disposition).toBe('unchanged');
    expect(r.reproject).toBe(false);
  });
  it('correction (re-project) when hash changes', () => {
    const r = classify(base(), { key: 'k', hash: 'h2', status: 'active', nowMs: 2 });
    expect(r.disposition).toBe('correction');
    expect(r.reproject).toBe(true);
    expect(r.retract).toBe(false);
    expect(r.version).toBe(2);
  });
  it('void + retract on entered-in-error, revoid is a no-op', () => {
    const v = classify(base(), { key: 'k', hash: 'x', status: 'entered-in-error', nowMs: 3 });
    expect(v.disposition).toBe('void');
    expect(v.retract).toBe(true);
    expect(v.reproject).toBe(false);
    const again = classify(base({ status: 'entered-in-error' }), { key: 'k', hash: 'x', status: 'entered-in-error', nowMs: 4 });
    expect(again.disposition).toBe('revoid');
    expect(again.retract).toBe(false);
  });

  it('resurrecting a VOIDED key with active content is a correction that re-projects', () => {
    const prior = base({ status: 'entered-in-error', version: 2 });
    const r = classify(prior, { key: 'k', hash: 'h-new', status: 'active', nowMs: 5 });
    expect(r.disposition).toBe('correction');
    expect(r.reproject).toBe(true);
    expect(r.retract).toBe(false);
    expect(r.version).toBe(3);
  });
});

describe('memory store — the RP-01 scenario', () => {
  it('resend dedupes, correction re-projects', async () => {
    const store = createMemoryRecordLifecycleStore();
    const payload = { dx: 'E11.9', note: 'diabetes' };
    const h = contentHash(payload);
    expect((await store.record({ key: 'Condition/1', hash: h, status: 'active', nowMs: 1 })).disposition).toBe('new');
    // exact resend (e.g. a retry) -> deduped, no re-projection
    expect((await store.record({ key: 'Condition/1', hash: h, status: 'active', nowMs: 2 })).disposition).toBe('unchanged');
    // a CORRECTION (changed content, same key) -> re-projects (RP-01)
    const corrected = contentHash({ dx: 'E11.9', note: 'diabetes with neuropathy' });
    const r = await store.record({ key: 'Condition/1', hash: corrected, status: 'active', nowMs: 3 });
    expect(r.disposition).toBe('correction');
    expect(r.reproject).toBe(true);
  });
});
