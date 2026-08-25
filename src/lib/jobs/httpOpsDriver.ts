// SEAM: jobs  // WPC-01 Phase 5 (remote ops driver)
/**
 * HTTP JobDriver — triggers/polls jobs over the ops surface of a REMOTE job runner,
 * for the topology where this process forwards job execution to a separate runner
 * service (config-selected in opsRuntime via OPS_JOBS_REMOTE_URL). A thin client for
 * the same /api/ops/jobs endpoints Airflow calls; the app never imports an
 * orchestrator. fetch is injectable for tests.
 */
import type { JobDriver, JobRunStatus } from './types';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface HttpOpsDriverOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: FetchLike;
}

export function makeHttpOpsJobDriver(opts: HttpOpsDriverOptions): JobDriver {
  const doFetch = opts.fetchImpl ?? fetch;
  const headers = { authorization: `Bearer ${opts.token}`, 'content-type': 'application/json' };
  return {
    id: 'http-ops',
    async trigger(jobName, input) {
      const res = await doFetch(`${opts.baseUrl}/api/ops/jobs/run`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: jobName, input }),
      });
      const body = (await res.json().catch(() => ({}))) as { runId?: string };
      if (!res.ok || !body.runId) {
        throw new Error(`http-ops: trigger '${jobName}' failed (status ${res.status})`);
      }
      return { runId: body.runId, jobName };
    },
    async status(handle) {
      const res = await doFetch(
        `${opts.baseUrl}/api/ops/jobs/status?runId=${encodeURIComponent(handle.runId)}`,
        { headers }
      );
      if (res.status === 404) return null;
      if (!res.ok)
        throw new Error(`http-ops: status '${handle.runId}' failed (status ${res.status})`);
      return (await res.json()) as JobRunStatus;
    },
  };
}
