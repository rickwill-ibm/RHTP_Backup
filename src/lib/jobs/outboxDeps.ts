// SEAM: jobs / ingestion  // WPC-01 Phase 5 (production ingest deps)
/**
 * OutboxDeps resolution for ingest jobs. mock/seeded (non-durable stores) -> the
 * dev in-memory deps (demo intact, zero infra); production (durable stores) -> the
 * REGISTERED real-deps factory (real FHIR applier + event publisher), or FAIL
 * CLOSED. This binds a real-deps ingest under the SAME job name in production
 * without a second job — the composition root registers the factory (infra-gated).
 */
import type { OutboxDeps } from '@/lib/outbox';
import type { ProjectionStores } from '@/lib/graph/consumer/provider';
import { makeDevOutboxDeps } from './devOutbox';

export class OutboxDepsNotConfiguredError extends Error {
  constructor() {
    super(
      'production ingest requires OutboxDeps but no production factory is registered (fail-closed)'
    );
    this.name = 'OutboxDepsNotConfiguredError';
  }
}

let productionFactory: ((stores: ProjectionStores) => OutboxDeps) | null = null;

/** Register (or clear) the production OutboxDeps factory (real applier + publisher). */
export function setProductionOutboxDepsFactory(
  fn: ((stores: ProjectionStores) => OutboxDeps) | null
): void {
  productionFactory = fn;
}

export function resolveOutboxDeps(stores: ProjectionStores): OutboxDeps {
  if (stores.durable) {
    if (!productionFactory) throw new OutboxDepsNotConfiguredError();
    return productionFactory(stores);
  }
  return makeDevOutboxDeps(stores.outbox);
}
