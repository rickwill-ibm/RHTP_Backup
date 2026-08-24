/**
 * Dev ingestion (Framework v1.6, WPC-01 Phase 2; refactored Phase 5 onto the
 * job-driver seam) — populate the SHARED projected graph via the REAL pipeline in
 * mock/seeded, so the aggregator (Phase 3) and the UI (Phase 4) read a genuinely
 * projected graph. It now orchestrates the `ingest.cbo-sdoh` and `projection.drain`
 * JOBS through the in-process driver — the same jobs production triggers via the ops
 * surface. Production never seeds demo data (durable stores populate via real feeds).
 */
import { getSharedProjectionStores } from '@/lib/runtime/projectionRuntime';
import { makeInProcessJobDriver } from '@/lib/jobs/inProcessDriver';
import { registerJob } from '@/lib/jobs/registry';
import { ingestCboSdohJob } from '@/lib/jobs/ingestJobs';
import { projectionDrainJob } from '@/lib/jobs/projectionJobs';

// Back-compat re-exports (the dev-outbox factories now live in the jobs seam).
export {
  makeInMemoryFhirApplier,
  makeNoopEventPublisher,
  makeDevOutboxDeps,
} from '@/lib/jobs/devOutbox';

// A self-contained SDOH drop for the demo (transportation + food + housing).
const DEMO_SDOH_CSV = [
  'member_source_id,screen_date,domain,zcode,result,program',
  'WPC-DEMO-01,2026-04-03,transportation-insecurity,Z59.82,positive,general',
  'WPC-DEMO-01,2026-04-03,food-insecurity,Z59.41,positive,general',
  'WPC-DEMO-02,2026-04-05,housing-instability,Z59.0,positive,general',
].join('\n');

let seeded = false;

/**
 * Populate the shared projected graph by orchestrating ingest -> drain through the
 * in-process driver. Returns the drain metrics.
 */
export async function seedDevProjection(): Promise<{ applied: number; members: number }> {
  registerJob(ingestCboSdohJob);
  registerJob(projectionDrainJob);
  const driver = makeInProcessJobDriver();

  await driver.trigger('ingest.cbo-sdoh', { payload: DEMO_SDOH_CSV });
  const handle = await driver.trigger('projection.drain');
  const status = await driver.status(handle);
  seeded = true;

  const m: Record<string, number> = status?.result?.metrics ?? {};
  return { applied: m.applied ?? 0, members: m.members ?? 0 };
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
