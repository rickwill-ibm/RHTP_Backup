// SEAM: jobs  // WPC-01 Phase 5
/**
 * Ops job runtime — a PROCESS-SHARED in-process driver so run status persists
 * across ops requests (the run route triggers, the status route reads back), plus
 * the core-job registration the ops surface needs. Drain is registered always; the
 * dev ingest job is registered only in mock/seeded (non-durable) — production binds
 * a real-deps ingest under the same job name at its own composition root.
 *
 * SSRF guard (red-team): when the remote-runner topology is selected via
 * OPS_JOBS_REMOTE_URL, the base URL is vetted against the egress allowlist BEFORE a
 * driver is built. Cloud-metadata / link-local / internal targets are blocked in
 * EVERY environment; loopback + private ranges are permitted only in local dev
 * (`allowPrivateNetwork: devMockEnabled()`). An OPS_JOBS_ALLOWED_HOSTS list, when
 * set, further restricts to exact hosts. A disallowed URL throws, fail-closed.
 */
import { getSharedProjectionStores } from '@/lib/runtime/projectionRuntime';
import { makeInProcessJobDriver } from './inProcessDriver';
import { makeHttpOpsJobDriver } from './httpOpsDriver';
import { registerJob } from './registry';
import { projectionDrainJob } from './projectionJobs';
import { ingestCboSdohJob } from './ingestJobs';
import { assertAllowedOutboundUrl, parseAllowedHosts } from '@/lib/security/egress/allowlist';
import { devMockEnabled } from '@/lib/server/devStubs';
import type { JobDriver } from './types';

let opsDriver: JobDriver | null = null;
let coreRegistered = false;

export function getSharedOpsJobDriver(): JobDriver {
  if (opsDriver === null) {
    // Config-selected: forward to a remote job runner when OPS_JOBS_REMOTE_URL is
    // set (a separate runner pod), else run jobs in this process. Both are real.
    const remote = process.env.OPS_JOBS_REMOTE_URL;
    if (remote) {
      // Fail closed if the configured runner URL is not a safe egress target.
      assertAllowedOutboundUrl(remote, {
        allowPrivateNetwork: devMockEnabled(),
        allowedHosts: parseAllowedHosts(process.env.OPS_JOBS_ALLOWED_HOSTS),
      });
      opsDriver = makeHttpOpsJobDriver({
        baseUrl: remote,
        token: process.env.OPS_JOBS_TOKEN ?? '',
      });
    } else {
      opsDriver = makeInProcessJobDriver();
    }
  }
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
