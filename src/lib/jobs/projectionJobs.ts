// SEAM: jobs  // WPC-01 Phase 5
/**
 * The projection.drain job — the recurring outbox -> graph drain (HW1 consumer)
 * modeled as a Job so it runs identically under the in-process driver (mock/seeded)
 * and the production ops surface. Idempotent: the outbox checkpoint means a re-run
 * with nothing new applies zero mutations.
 */
import { runProjectionOnce } from '@/lib/graph/consumer';
import type { Job, JobContext, JobResult } from './types';

function seededRng(): () => number {
  let s = 0x2545f491;
  return () => {
    s = Math.imul(s, 0x01000193) >>> 0 || 1;
    return (s >>> 8) / 0x01000000;
  };
}

export const projectionDrainJob: Job = {
  name: 'projection.drain',
  async run(_input: unknown, ctx: JobContext): Promise<JobResult> {
    const { outbox, graph, checkpoint } = ctx.stores;
    const drain = await runProjectionOnce(outbox, graph, checkpoint, {
      now: ctx.now,
      rng: seededRng(),
    });
    return {
      ok: true,
      jobName: 'projection.drain',
      idempotencyKey: `projection.drain:applied=${drain.applied}`,
      metrics: { applied: drain.applied, members: drain.members },
    };
  },
};
