/**
 * Dev ingestion (Framework v1.6, WPC-01 Phase 2) — populate the SHARED projected
 * graph via the REAL pipeline in mock/seeded, so the whole-person aggregator
 * (Phase 3) and the UI (Phase 4) read a genuinely projected graph rather than
 * authored data. No backend: an in-memory FHIR applier + a no-op publisher — the
 * projection consumer reads the outbox rows, not the publisher. Production never
 * seeds demo data (it populates via the durable factories + real feeds); this is
 * the dev/demo equivalent, gated on `durable === false`.
 */
import { cboSdohAdapter, defaultPipelineDeps, runPipeline } from '@/lib/pipeline';
import {
  OutboxWriter,
  type C2Event,
  type EventPublisher,
  type FhirApplier,
  type OutboxDeps,
} from '@/lib/outbox';
import { runProjectionOnce } from '@/lib/graph/consumer';
import { now } from '@/lib/clock';
import { getSharedProjectionStores } from './projectionRuntime';

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

function seededRng(): () => number {
  let s = 0x2545f491;
  return () => {
    s = Math.imul(s, 0x01000193) >>> 0 || 1;
    return (s >>> 8) / 0x01000000;
  };
}

/** Dev OutboxDeps around the SHARED outbox (in-memory applier + no-op publisher). */
export function makeDevOutboxDeps(store: OutboxDeps['store']): OutboxDeps {
  return {
    store,
    fhir: makeInMemoryFhirApplier(),
    publisher: makeNoopEventPublisher(),
    now,
    rng: seededRng(),
  };
}

// A self-contained SDOH drop for the demo (transportation + food + housing).
const DEMO_SDOH_CSV = [
  'member_source_id,screen_date,domain,zcode,result,program',
  'WPC-DEMO-01,2026-04-03,transportation-insecurity,Z59.82,positive,general',
  'WPC-DEMO-01,2026-04-03,food-insecurity,Z59.41,positive,general',
  'WPC-DEMO-02,2026-04-05,housing-instability,Z59.0,positive,general',
].join('\n');

let seeded = false;

/**
 * Populate the shared projected graph via the real pipeline: land → stage →
 * conform+load → project+propagate into the SHARED outbox, then drain into the
 * SHARED graph. Returns the drain result.
 */
export async function seedDevProjection(): Promise<{ applied: number; members: number }> {
  const stores = getSharedProjectionStores();
  const writer = new OutboxWriter(makeDevOutboxDeps(stores.outbox));
  await runPipeline(
    cboSdohAdapter,
    { source: cboSdohAdapter.source, format: cboSdohAdapter.format, payload: DEMO_SDOH_CSV },
    defaultPipelineDeps({ now }),
    { writer }
  );
  const drain = await runProjectionOnce(stores.outbox, stores.graph, stores.checkpoint, {
    now,
    rng: seededRng(),
  });
  seeded = true;
  return { applied: drain.applied, members: drain.members };
}

/** Seed the dev projection exactly once per process; no-op in production. */
export async function ensureDevProjectionSeeded(): Promise<void> {
  if (seeded) return;
  const stores = getSharedProjectionStores();
  if (stores.durable) {
    seeded = true; // production populates via real feeds, never a demo seed
    return;
  }
  await seedDevProjection();
}

export function _resetDevProjectionSeed(): void {
  seeded = false;
}
