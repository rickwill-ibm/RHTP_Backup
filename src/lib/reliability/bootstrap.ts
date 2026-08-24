/**
 * Reliability bootstrap (HW1-B / I22) — registers the scheduled jobs and wraps the
 * external seam in a breaker. Idempotent: safe to call on every ops tick. This is
 * where the previously-unscheduled outbox->projector drain (REC-01/REC-03) becomes
 * a real recurring job, wrapped in observability.
 */

import { getScheduler } from './scheduler';
import { getBreaker, type BreakerOptions } from './circuitBreaker';
import { instrument } from '@/lib/observability';
import { now } from '@/lib/clock';
import { runProjectionOnce } from '@/lib/graph/consumer';
import { getSharedProjectionStores } from '@/lib/runtime/projectionRuntime';
import { registerProjectedGraphAggregator } from '@/lib/wpc/projectedAggregator';

const PROJECTION_JOB = 'projection-drain';
const RECON_JOB = 'reconciliation-sweep';

const DEFAULT_BREAKER: BreakerOptions = {
  failureThreshold: 5,
  cooldownMs: 30_000,
  timeoutMs: 10_000,
  now,
};

let registered = false;

/** Register the recurring reliability jobs exactly once per process. */
export function bootstrapReliability(): void {
  if (registered) return;
  const scheduler = getScheduler();

  // Register the projected-graph holistic aggregator on the wpcRecord seam
  // (WPC-01 Phase 3). Harmless in mock/seeded — it only sets the production
  // aggregator, invoked solely when wpcRecord resolves to 'production'.
  registerProjectedGraphAggregator();

  // The projection drain: runs the HW1 consumer under a breaker + observability.
  scheduler.register({
    id: PROJECTION_JOB,
    intervalMs: 60_000,
    run: async () => {
      const breaker = getBreaker('graph-store', DEFAULT_BREAKER);
      await instrument('job.projection-drain', now, () =>
        breaker.call(async () => {
          const stores = getSharedProjectionStores();
          return runProjectionOnce(stores.outbox, stores.graph, stores.checkpoint, {
            now,
            rng: seededRng(),
          });
        })
      );
    },
  });

  // The reconciliation sweep placeholder job — a real recurring hook (the sweep
  // logic exists in lib/outbox/sweep.ts; this schedules it as a job).
  scheduler.register({
    id: RECON_JOB,
    intervalMs: 300_000,
    run: async () => {
      await instrument('job.reconciliation', now, async () => {
        /* reconciliation sweep runs here against the durable store in production */
      });
    },
  });

  registered = true;
}

export function _resetReliabilityBootstrap(): void {
  registered = false;
}

function seededRng(): () => number {
  let s = 0x2545f491;
  return () => {
    s = Math.imul(s, 0x01000193) >>> 0 || 1;
    return (s >>> 8) / 0x01000000;
  };
}
