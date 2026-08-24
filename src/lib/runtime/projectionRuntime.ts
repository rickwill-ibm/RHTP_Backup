/**
 * Composition root — process-shared projection stores (Framework v1.6, WPC-01 Phase 1).
 *
 * `resolveProjectionStores()` returns a FRESH {outbox, graph, checkpoint} triple on
 * every call: in mock/seeded those are new in-memory stores, so the scheduled drain
 * (reliability/bootstrap) re-created an EMPTY graph every tick and never accumulated
 * — the projected graph was never populated at runtime. This holds ONE triple per
 * process so ingestion (the outbox writer), the consumer (the drain), and the reader
 * (the holistic aggregator) all operate on the SAME graph. In production the durable
 * factories already return the same backend, so memoization is consistent there too.
 */
import { resolveProjectionStores, type ProjectionStores } from '@/lib/graph/consumer/provider';

let shared: ProjectionStores | null = null;

/** The process-shared projection stores (memoized on first use). */
export function getSharedProjectionStores(): ProjectionStores {
  if (shared === null) shared = resolveProjectionStores();
  return shared;
}

/** Clear the memoized triple — test isolation, or a dataMode change between runs. */
export function _resetSharedProjectionStores(): void {
  shared = null;
}
