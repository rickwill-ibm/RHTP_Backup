/**
 * Projection-consumer store provider (HW1 / I14).
 *
 * Resolves the {outbox, graph, checkpoint} triple the consumer drains, honoring
 * the `graph` dataMode seam: mock/seeded → in-memory stores (demo, zero backend);
 * production → the registered durable factories, or fail CLOSED (never a silent
 * in-memory store presented as durable). Keeps the ops route thin and the wiring
 * config-switched.
 */

import { getDataMode } from '@/lib/config/dataMode';
import { createMemoryOutboxStore, type OutboxStore } from '@/lib/outbox';
import { createNeo4jFakeGraphStore } from '@/lib/graph';
import type { GraphStore } from '@/lib/graph/types';
import { getProjectionCheckpointStore, type ProjectionCheckpointStore } from './checkpoint';

export interface ProjectionStores {
  outbox: OutboxStore;
  graph: GraphStore;
  checkpoint: ProjectionCheckpointStore;
  durable: boolean;
}

export class ProjectionStoresNotConfiguredError extends Error {
  constructor(which: string) {
    super(`graph=production but no durable ${which} factory is registered (fail-closed)`);
    this.name = 'ProjectionStoresNotConfiguredError';
  }
}

let productionOutboxFactory: (() => OutboxStore) | null = null;
let productionGraphFactory: (() => GraphStore) | null = null;

/** Register (or clear) the durable production outbox factory. */
export function setProductionOutboxFactory(f: (() => OutboxStore) | null): void {
  productionOutboxFactory = f;
}
/** Register (or clear) the durable production graph-store factory. */
export function setProductionGraphFactory(f: (() => GraphStore) | null): void {
  productionGraphFactory = f;
}

/** Resolve the consumer's stores for the current `graph` seam mode. */
export function resolveProjectionStores(): ProjectionStores {
  const durable = getDataMode('graph') === 'production';
  if (!durable) {
    return {
      outbox: createMemoryOutboxStore('mock-outbox'),
      graph: createNeo4jFakeGraphStore(),
      checkpoint: getProjectionCheckpointStore(false),
      durable,
    };
  }
  if (!productionOutboxFactory) throw new ProjectionStoresNotConfiguredError('outbox');
  if (!productionGraphFactory) throw new ProjectionStoresNotConfiguredError('graph-store');
  return {
    outbox: productionOutboxFactory(),
    graph: productionGraphFactory(),
    checkpoint: getProjectionCheckpointStore(true),
    durable,
  };
}
