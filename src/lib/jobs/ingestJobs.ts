// SEAM: jobs  // WPC-01 Phase 5
/**
 * The ingest.cbo-sdoh job — land a CBO SDOH flat-file drop through the REAL
 * pipeline into the shared outbox. Modeled as a Job so the dev seeder (mock/seeded)
 * and the production ops surface trigger the same unit. This registration binds the
 * DEV-deps implementation (in-memory applier + no-op publisher); production binds a
 * real-deps implementation under the same job name.
 */
import { OutboxWriter } from '@/lib/outbox';
import { cboSdohAdapter, defaultPipelineDeps, runPipeline } from '@/lib/pipeline';
import { makeDevOutboxDeps } from './devOutbox';
import type { Job, JobContext, JobResult } from './types';

export interface CboSdohIngestInput {
  payload: string;
}

export const ingestCboSdohJob: Job = {
  name: 'ingest.cbo-sdoh',
  async run(input: unknown, ctx: JobContext): Promise<JobResult> {
    const payload = (input as CboSdohIngestInput | undefined)?.payload;
    if (typeof payload !== 'string' || payload.length === 0) {
      throw new Error('ingest.cbo-sdoh: input.payload (CSV string) is required');
    }
    const writer = new OutboxWriter(makeDevOutboxDeps(ctx.stores.outbox));
    await runPipeline(
      cboSdohAdapter,
      { source: cboSdohAdapter.source, format: cboSdohAdapter.format, payload },
      defaultPipelineDeps({ now: ctx.now }),
      { writer }
    );
    return {
      ok: true,
      jobName: 'ingest.cbo-sdoh',
      idempotencyKey: `ingest.cbo-sdoh:len=${payload.length}`,
      metrics: { bytes: payload.length },
    };
  },
};
