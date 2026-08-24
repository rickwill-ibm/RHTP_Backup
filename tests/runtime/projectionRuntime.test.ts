/**
 * Composition root — shared projection stores (WPC-01 Phase 1).
 * Proves the fix for the per-call ephemerality that left the projected graph empty.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getSharedProjectionStores,
  _resetSharedProjectionStores,
} from '@/lib/runtime/projectionRuntime';

describe('composition root — shared projection stores', () => {
  beforeEach(() => _resetSharedProjectionStores());

  it('returns the SAME triple across calls (mock/seeded: one process-held graph)', () => {
    const a = getSharedProjectionStores();
    const b = getSharedProjectionStores();
    expect(b.graph).toBe(a.graph);
    expect(b.outbox).toBe(a.outbox);
    expect(b.checkpoint).toBe(a.checkpoint);
    expect(a.durable).toBe(false);
  });

  it('accumulates: a node written now is visible on a later resolve (the fix)', async () => {
    const first = getSharedProjectionStores();
    await first.graph.apply([
      { op: 'UpsertNode', kind: 'Member', key: 'm-phase1', properties: { id: 'm-phase1' } },
    ]);
    const later = getSharedProjectionStores();
    const node = await later.graph.getNode('Member', 'm-phase1');
    expect(node).not.toBeNull();
    expect(node?.kind).toBe('Member');
  });

  it('reset yields a fresh, empty graph (isolation / mode change)', async () => {
    const a = getSharedProjectionStores();
    await a.graph.apply([
      { op: 'UpsertNode', kind: 'Member', key: 'm-x', properties: { id: 'm-x' } },
    ]);
    _resetSharedProjectionStores();
    const b = getSharedProjectionStores();
    expect(b.graph).not.toBe(a.graph);
    expect(await b.graph.getNode('Member', 'm-x')).toBeNull();
  });
});
