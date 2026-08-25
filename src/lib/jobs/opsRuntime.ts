// SEAM: jobs  // WPC-01 Phase 5
/**
 * Ops job runtime — a PROCESS-SHARED in-process driver so run status persists
 * across ops requests (the run route triggers, the status route reads back), plus
 * the core-job registration the ops surface needs. Drain is registered always; the
 * dev ingest job is registered only in mock/seeded (non-durable) — production binds
 * a real-deps ingest under the same job name at its own composition root.
 */
import { getSharedProjectionStores } from '@/lib/runtime/projectionRuntime';
import { makeInProcessJobDriver } from './inProcessDriver';
import { registerJob } from './registry';
import { projectionDrainJob } from './projectionJobs';
import { ingestCboSdohJob } from './ingestJobs';
import type { JobDriver } from './types';

let opsDriver: JobDriver | null = null;
let coreRegistered = false;

export function getSharedOpsJobDriver(): JobDriver {
  if (opsDriver === null) opsDriver = makeInProcessJobDriver();
  return opsDriver;
}

export function ensureCoreJobsRegistered(): void {
  if (coreRegistered) return;
  registerJob(projectionDrainJob);
  if (!getSharedProjectionStores().durable) registerJob(ingestCboSdohJob);
  coreRegistered = true;
}

export function _resetOpsRuntime(): void {
  opsDriver = null;
  coreRegistered = false;
}
