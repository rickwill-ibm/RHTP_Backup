/**
 * Deterministic job scheduler (HW1-B / I22, REC-03 / HS-02).
 *
 * The outbox sweep and the reconciliation jobs were invoked by NOTHING outside
 * tests. This registers them as scheduled jobs with an interval + a last-run
 * checkpoint, and a `tick(now)` that runs every job whose interval has elapsed.
 * Deterministic (clock injected, no timers), so it is unit-testable and can be
 * driven by an ops route or a real cron/worker in production — the job logic is
 * the same either way.
 */

export interface ScheduledJob {
  id: string;
  intervalMs: number;
  run: () => Promise<void> | void;
}

interface JobState {
  job: ScheduledJob;
  lastRunMs: number;
}

export interface TickResult {
  ran: string[];
  skipped: string[];
  errors: Array<{ id: string; error: string }>;
}

export class Scheduler {
  private jobs = new Map<string, JobState>();

  register(job: ScheduledJob): void {
    if (job.intervalMs <= 0)
      throw new Error(`scheduler: job '${job.id}' needs a positive interval`);
    // register at lastRun = -Infinity so a job is due on the first tick
    this.jobs.set(job.id, { job, lastRunMs: Number.NEGATIVE_INFINITY });
  }

  unregister(id: string): void {
    this.jobs.delete(id);
  }

  ids(): string[] {
    return [...this.jobs.keys()].sort();
  }

  /** Run every job whose interval has elapsed since its last run. Never throws — a
   *  failing job is recorded and the others still run (isolation). */
  async tick(nowMs: number): Promise<TickResult> {
    const result: TickResult = { ran: [], skipped: [], errors: [] };
    for (const [id, state] of this.jobs) {
      if (nowMs - state.lastRunMs < state.job.intervalMs) {
        result.skipped.push(id);
        continue;
      }
      try {
        await state.job.run();
        state.lastRunMs = nowMs;
        result.ran.push(id);
      } catch (err) {
        state.lastRunMs = nowMs; // advance to avoid a hot failure loop
        result.errors.push({ id, error: err instanceof Error ? err.name : 'error' });
      }
    }
    return result;
  }
}

// One process scheduler the ops route + worker drive.
const scheduler = new Scheduler();
export function getScheduler(): Scheduler {
  return scheduler;
}
export function _resetScheduler(): void {
  for (const id of scheduler.ids()) scheduler.unregister(id);
}
