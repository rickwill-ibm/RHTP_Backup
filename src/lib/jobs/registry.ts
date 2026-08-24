// SEAM: jobs  // WPC-01 Phase 5
/**
 * The job registry — the single place a JobDriver resolves a job name to its body.
 * Registration happens at the composition root (bootstrap); production fails closed
 * (JobNotRegisteredError) when a required job is not registered.
 */
import type { Job } from './types';

const registry = new Map<string, Job>();

export function registerJob(job: Job): void {
  registry.set(job.name, job);
}
export function getJob(name: string): Job | undefined {
  return registry.get(name);
}
export function listJobs(): string[] {
  return [...registry.keys()].sort();
}
/** Test hook: clear the registry between cases. */
export function resetJobRegistry(): void {
  registry.clear();
}
