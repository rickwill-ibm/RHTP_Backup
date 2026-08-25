// SEAM: jobs  // WPC-01 Phase 5
/**
 * Dev outbox dependencies — an in-memory FHIR applier + a no-op publisher, so the
 * dev/demo ingest job populates the shared outbox with no backend (the projection
 * consumer reads the outbox rows, not the publisher). Extracted here so both the
 * ingest job and the dev seeder use one definition without a circular import.
 * Production ingest binds REAL OutboxDeps under the same job name.
 */
import type { C2Event, EventPublisher, FhirApplier, OutboxDeps } from '@/lib/outbox';
import { now } from '@/lib/clock';

/** In-memory FHIR applier — records applies; the demo needs no live FHIR server. */
export function makeInMemoryFhirApplier(): FhirApplier {
  const landed = new Set<string>();
  return {
    id: 'dev-inmemory-fhir',
    async apply(resourceId: string) {
      landed.add(resourceId);
      return { versionId: `v${landed.size}` };
    },
    async exists(resourceId: string) {
      return landed.has(resourceId);
    },
  };
}

/** No-op publisher — the projection consumer reads the outbox rows, not this. */
export function makeNoopEventPublisher(): EventPublisher {
  return {
    id: 'dev-noop-publisher',
    async publish(_event: C2Event) {
      /* dev: the projected graph is built by the consumer from the outbox */
    },
  };
}

export function seededRng(): () => number {
  let s = 0x2545f491;
  return () => {
    s = Math.imul(s, 0x01000193) >>> 0 || 1;
    return (s >>> 8) / 0x01000000;
  };
}

/** Dev OutboxDeps around a store (in-memory applier + no-op publisher). */
export function makeDevOutboxDeps(store: OutboxDeps['store']): OutboxDeps {
  return {
    store,
    fhir: makeInMemoryFhirApplier(),
    publisher: makeNoopEventPublisher(),
    now,
    rng: seededRng(),
  };
}
