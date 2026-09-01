/**
 * Dev ingestion (Framework v1.6, WPC-01 Phase 2; refactored Phase 5 onto the
 * job-driver seam) — populate the SHARED projected graph via the REAL pipeline in
 * mock/seeded, so the aggregator (Phase 3) and the UI (Phase 4) read a genuinely
 * projected graph. It now orchestrates the `ingest.cbo-sdoh` and `projection.drain`
 * JOBS through the in-process driver — the same jobs production triggers via the ops
 * surface. Production never seeds demo data (durable stores populate via real feeds).
 */
import { getSharedProjectionStores } from '@/lib/runtime/projectionRuntime';
import { project } from '@/lib/graph';
import { defaultPipelineDeps } from '@/lib/pipeline';
import { now } from '@/lib/clock';
import type { C2Event } from '@/lib/outbox';
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

// WPC Unit 1: a demo access-geography drop for the demo member, projected through the
// SAME project() write path (demo only — production populates via real FHIR feeds).
function demoAccessEvent(memberId: string, payload: Record<string, unknown>): C2Event {
  const at = new Date(now()).toISOString();
  return {
    eventId: `access-${memberId}`,
    eventType: 'access.geographic.recorded',
    eventVersion: '1.0',
    occurredAt: at,
    recordedAt: at,
    memberId,
    partitionKey: memberId,
    class: 'batch',
    sequence: 0,
    correlationId: `access-${memberId}`,
    idempotencyKey: `access:${memberId}`,
    source: { system: 'demo', feed: 'access-geography', tier: 'T1' },
    consentContext: { part2Restricted: false, segmentLabels: [] },
    payload,
  };
}

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

  // WPC Unit 1: seed the demo member's access-geography (rural SD) so the projected
  // holistic context surfaces a REAL accessProfile. Same project() write path; the
  // member id is resolved exactly as the CBO feed resolves it.
  const demoId = defaultPipelineDeps({ now }).resolveIdentity('WPC-DEMO-01', {
    feed: 'access-geography',
  });
  await getSharedProjectionStores().graph.apply(
    project(
      [
        demoAccessEvent(demoId, {
          ruralStatus: 'rural',
          distanceToProviderMiles: 45,
          publicTransitAvailable: false,
          broadbandAvailable: true,
          cellularCoverage: 'good',
          nearestPharmacyMiles: 12,
          nearestERMiles: 35,
        }),
      ],
      { now }
    )
  );
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
