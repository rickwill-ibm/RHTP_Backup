/**
 * Dev ingestion — the real pipeline populates the shared projected graph (WPC-01 Phase 2).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  seedDevProjection,
  ensureDevProjectionSeeded,
  _resetDevProjectionSeed,
} from '@/lib/runtime/devIngestion';
import {
  getSharedProjectionStores,
  _resetSharedProjectionStores,
} from '@/lib/runtime/projectionRuntime';
import { defaultPipelineDeps } from '@/lib/pipeline';
import { wholePersonLens } from '@/lib/graph/lens/lenses';
import { now } from '@/lib/clock';

describe('dev ingestion — real pipeline → shared graph', () => {
  beforeEach(() => {
    _resetSharedProjectionStores();
    _resetDevProjectionSeed();
  });

  it('starts empty, then seeding projects the member subgraph into the shared graph', async () => {
    const empty = await getSharedProjectionStores().graph.listEdges();
    expect(empty).toHaveLength(0);

    const res = await seedDevProjection();
    expect(res.applied).toBeGreaterThan(0);

    const stores = getSharedProjectionStores();
    const edges = await stores.graph.listEdges();
    expect(edges.length).toBeGreaterThan(0);

    // the specific demo member's whole-person view now has the member + resources
    const memberKey = defaultPipelineDeps({ now }).resolveIdentity('WPC-DEMO-01', {
      feed: 'sdoh-flat-file',
    });
    const lens = await wholePersonLens(stores.graph, memberKey);
    expect(lens.nodes.length).toBeGreaterThan(1);
  });

  it('ensureDevProjectionSeeded is idempotent (safe on every ops tick)', async () => {
    await ensureDevProjectionSeeded();
    const one = (await getSharedProjectionStores().graph.listEdges()).length;
    await ensureDevProjectionSeeded();
    const two = (await getSharedProjectionStores().graph.listEdges()).length;
    expect(two).toBe(one);
  });
});
