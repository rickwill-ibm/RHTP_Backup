// SEAM: jobs  // WPC-01 Phase 5
/**
 * In-process JobDriver — runs jobs inline against the process-shared stores. The
 * default for mock/seeded (the demo stays zero-infra) and the reference the ops
 * surface mirrors in production. Run status is held in memory for status() lookups.
 */
import { now as clockNow } from '@/lib/clock';
import { getSharedProjectionStores } from '@/lib/runtime/projectionRuntime';
import { getJob } from './registry';
import {
  JobNotRegisteredError,
  type JobContext,
  type JobDriver,
  type JobRunHandle,
  type JobRunStatus,
} from './types';

export interface InProcessDriverOptions {
  now?: () => number;
  /** Override the job context (tests inject stores); defaults to the shared stores. */
  makeContext?: () => JobContext;
}

export function makeInProcessJobDriver(opts: InProcessDriverOptions = {}): JobDriver {
  const runs = new Map<string, JobRunStatus>();
  const now = opts.now ?? clockNow;
  let seq = 0;

  return {
    id: 'in-process',
    async trigger(jobName, input) {
      const job = getJob(jobName);
      if (!job) throw new JobNotRegisteredError(jobName);
      const runId = `run-${jobName}-${(seq += 1)}`;
      const handle: JobRunHandle = { runId, jobName };
      const ctx: JobContext = opts.makeContext
        ? opts.makeContext()
        : { now, stores: getSharedProjectionStores() };
      try {
        const result = await job.run(input, ctx);
        runs.set(runId, { runId, jobName, state: 'succeeded', result });
      } catch (e) {
        runs.set(runId, {
          runId,
          jobName,
          state: 'failed',
          error: e instanceof Error ? e.message : String(e),
        });
      }
      return handle;
    },
    async status(handle) {
      return runs.get(handle.runId) ?? null;
    },
  };
}
