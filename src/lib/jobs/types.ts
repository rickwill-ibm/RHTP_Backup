// SEAM: jobs  // WPC-01 Phase 5
/**
 * Job-driver seam (Phase 5, see docs/production-plan/JOB_DRIVER_SEAM.md).
 *
 * A Job is a named, idempotent, retryable batch unit (the things a payer data team
 * schedules). A JobDriver is what TRIGGERS jobs — the swap point: mock/seeded runs
 * them in-process; production drives the SAME jobs through the ops HTTP surface, so
 * Airflow (or Dagster/Prefect/cron) is one external caller, never an import in the
 * app. The pipeline stays orchestrator-agnostic.
 */
import type { ProjectionStores } from '@/lib/graph/consumer/provider';

/** What a job body is given: the injected clock + the process-shared stores. */
export interface JobContext {
  now: () => number;
  stores: ProjectionStores;
}

/** The outcome of one job run. `idempotencyKey` lets retries/backfills de-dupe. */
export interface JobResult {
  ok: boolean;
  jobName: string;
  idempotencyKey: string;
  metrics: Record<string, number>;
}

/** A named batch unit. Input is opaque at the seam; each job casts what it needs. */
export interface Job {
  readonly name: string;
  run(input: unknown, ctx: JobContext): Promise<JobResult>;
}

export interface JobRunHandle {
  runId: string;
  jobName: string;
}

export interface JobRunStatus {
  runId: string;
  jobName: string;
  state: 'succeeded' | 'failed';
  result?: JobResult;
  error?: string;
}

/** Triggers jobs and reports run status. Two impls: in-process, and http-ops. */
export interface JobDriver {
  readonly id: string;
  trigger(jobName: string, input?: unknown): Promise<JobRunHandle>;
  status(handle: JobRunHandle): Promise<JobRunStatus | null>;
}

/** A job name that is not registered — fail closed, never a silent no-op. */
export class JobNotRegisteredError extends Error {
  constructor(public readonly jobName: string) {
    super(`job '${jobName}' is not registered (fail-closed)`);
    this.name = 'JobNotRegisteredError';
  }
}
