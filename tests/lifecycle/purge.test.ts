/**
 * Policy-driven purge over mutable stores + legal-hold block (E9).
 *
 * A fake in-memory PurgeSource stands in for a mutable store so the engine is
 * exercised end to end: scan -> select -> hold split -> remove -> audit.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as clock from '@/lib/clock';
import {
  planPurge,
  runPurge,
  holdPredicate,
  createLegalHoldRegistry,
  type PurgeableItem,
  type PurgeSource,
  type RetentionPolicy,
} from '@/lib/lifecycle';

const NOW = Date.parse('2026-08-23T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

/** A fake mutable store: holds items, records what was removed. */
function fakeSource(store: string, seed: PurgeableItem[]): PurgeSource & { data: Map<string, PurgeableItem>; removed: string[] } {
  const data = new Map(seed.map((i) => [i.id, i]));
  const removed: string[] = [];
  return {
    store,
    data,
    removed,
    scan: () => [...data.values()],
    remove: (id: string) => {
      data.delete(id);
      removed.push(id);
    },
  };
}

function item(id: string, over: Partial<PurgeableItem> = {}): PurgeableItem {
  return {
    id,
    store: over.store ?? 'fhir',
    subjectRef: over.subjectRef ?? `mem-${id}`,
    category: over.category ?? 'Observation',
    createdAt: over.createdAt ?? '2026-01-01T00:00:00.000Z',
    consentWithdrawn: over.consentWithdrawn,
  };
}

const oldPolicy: RetentionPolicy = { id: 'age-30d', description: 'older than 30d', maxAgeMs: 30 * DAY };

describe('purge — removes exactly the policy-selected records', () => {
  beforeEach(() => clock.setClock(() => NOW));
  afterEach(() => clock.setClock(null));

  it('runPurge deletes selected items from the source and audits each', async () => {
    const src = fakeSource('fhir', [
      item('old1', { createdAt: '2026-01-01T00:00:00.000Z' }),
      item('old2', { createdAt: '2026-02-01T00:00:00.000Z' }),
      item('fresh', { createdAt: '2026-08-22T00:00:00.000Z' }),
    ]);
    const registry = createLegalHoldRegistry();
    const result = await runPurge([src], [oldPolicy], registry, 'ops:retention-job', NOW);

    expect(result.purged.map((s) => s.item.id).sort()).toEqual(['old1', 'old2']);
    expect(src.removed.sort()).toEqual(['old1', 'old2']);
    expect(src.data.has('fresh')).toBe(true);
    expect(result.audit.filter((a) => a.action === 'lifecycle.purge')).toHaveLength(2);
    for (const a of result.audit) expect(a.outcome).not.toBe(undefined);
  });
});

describe('purge — LEGAL HOLD blocks purge (E9)', () => {
  beforeEach(() => clock.setClock(() => NOW));
  afterEach(() => clock.setClock(null));

  it('a held subject is never removed; it is audited as held-back', async () => {
    const src = fakeSource('fhir', [
      item('held', { subjectRef: 'mem-held', createdAt: '2026-01-01T00:00:00.000Z' }),
      item('free', { subjectRef: 'mem-free', createdAt: '2026-01-01T00:00:00.000Z' }),
    ]);
    const registry = createLegalHoldRegistry();
    registry.place({ subjectRef: 'mem-held', reason: 'litigation', placedBy: 'legal:1' });

    const result = await runPurge([src], [oldPolicy], registry, 'ops:job', NOW);

    // held item survived; free item purged
    expect(src.data.has('held')).toBe(true);
    expect(src.data.has('free')).toBe(false);
    expect(result.purged.map((s) => s.item.id)).toEqual(['free']);
    expect(result.heldBack.map((s) => s.item.id)).toEqual(['held']);
    const blocked = result.audit.find((a) => a.action === 'lifecycle.purge.held-back');
    expect(blocked?.outcome).toBe('blocked');
    expect(blocked?.detail).toBe('legal-hold');
  });

  it('releasing the hold lets the next purge remove the record', async () => {
    const src = fakeSource('fhir', [item('held', { subjectRef: 'mem-held' })]);
    const registry = createLegalHoldRegistry();
    registry.place({ subjectRef: 'mem-held', reason: 'litigation', placedBy: 'legal:1' });

    let result = await runPurge([src], [oldPolicy], registry, 'ops:job', NOW);
    expect(result.heldBack).toHaveLength(1);
    expect(src.data.has('held')).toBe(true);

    registry.release('mem-held', 'legal:1');
    result = await runPurge([src], [oldPolicy], registry, 'ops:job', NOW);
    expect(result.purged.map((s) => s.item.id)).toEqual(['held']);
    expect(src.data.has('held')).toBe(false);
  });
});

describe('purge — planPurge is pure (no removal)', () => {
  it('planning does not touch the store', () => {
    const src = fakeSource('fhir', [item('a'), item('b')]);
    const registry = createLegalHoldRegistry();
    registry.place({ subjectRef: 'mem-a', reason: 'x', placedBy: 'legal' });
    const plan = planPurge(src.scan() as PurgeableItem[], [oldPolicy], holdPredicate(registry), NOW);
    expect(plan.purge.map((s) => s.item.id)).toEqual(['b']);
    expect(plan.heldBack.map((s) => s.item.id)).toEqual(['a']);
    expect(src.removed).toEqual([]); // nothing removed by planning
  });
});
