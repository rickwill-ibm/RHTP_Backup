/**
 * Reliability bootstrap (HW1-B / I22) — the once-per-process composition root.
 * Registers the projected-graph holistic aggregator (Phase 3), the job-driver seam
 * (Phase 5), and the recurring scheduled jobs, each wrapped in a breaker +
 * observability. Idempotent: safe to call on every ops tick.
 *
 * The projection drain now runs through the job-driver seam: the scheduler triggers
 * the `projection.drain` JOB via the in-process driver. Behavior-preserving — the
 * job wraps the same HW1 consumer against the process-shared stores — but the drain
 * is now the same unit the production ops surface triggers (see JOB_DRIVER_SEAM.md).
 */

import { getScheduler } from './scheduler';
import { getBreaker, type BreakerOptions } from './circuitBreaker';
import { instrument } from '@/lib/observability';
import { now } from '@/lib/clock';
import { registerProjectedGraphAggregator } from '@/lib/wpc/projectedAggregator';
import { makeInProcessJobDriver } from '@/lib/jobs/inProcessDriver';
import { registerJob } from '@/lib/jobs/registry';
import { projectionDrainJob } from '@/lib/jobs/projectionJobs';

const PROJECTION_JOB = 'projection-drain';
const RECON_JOB = 'reconciliation-sweep';

const DEFAULT_BREAKER: BreakerOptions = {
  failureThreshold: 5,
  cooldownMs: 30_000,
  timeoutMs: 10_000,
  now,
};

let registered = false;

/** Register the composition root's aggregator, jobs, and recurring drivers once. */
export function bootstrapReliability(): void {
  if (registered) return;
  const scheduler = getScheduler();

  // Register the projected-graph holistic aggregator on the wpcRecord seam (Phase 3).
  registerProjectedGraphAggregator();

  // Register the job-driver seam (Phase 5): the drain runs as a Job through the
  // in-process driver here; production triggers the SAME job via the ops surface.
  registerJob(projectionDrainJob);
  const driver = makeInProcessJobDriver();

  // The projection drain: triggers the projection.drain JOB under a breaker +
  // observability. Job failures surface as a thrown error so the breaker still trips.
  scheduler.register({
    id: PROJECTION_JOB,
    intervalMs: 60_000,
    run: async () => {
      const breaker = getBreaker('graph-store', DEFAULT_BREAKER);
      await instrument('job.projection-drain', now, () =>
        breaker.call(async () => {
          const handle = await driver.trigger('projection.drain');
          const st = await driver.status(handle);
          if (!st || st.state === 'failed') {
            throw new Error(st?.error ?? 'projection.drain failed');
          }
          return st.result;
        })
      );
    },
  });

  // Reconciliation sweep — a reserved recurring hook. The sweep logic exists
  // (lib/outbox/sweep.ts, OutboxSweeper) but is NOT yet wired here: it needs the
  // outbox apply/publish deps (the FHIR write + C2 publish seam), which are composed
  // per-deployment. This slot keeps the schedule present and observable now; wiring
  // the sweeper against those deps is the next hardening batch.
  scheduler.register({
    id: RECON_JOB,
    intervalMs: 300_000,
    run: async () => {
      await instrument('job.reconciliation', now, async () => {
        /* reserved: OutboxSweeper(deps).sweep() — pending deps composition (see above) */
      });
    },
  });

  registered = true;
}

export function _resetReliabilityBootstrap(): void {
  registered = false;
}
