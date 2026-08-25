/**
 * Job-driver seam (WPC-01 Phase 5a): the in-process driver runs the projection.drain
 * job against the shared stores, is idempotent, and fails closed on an unknown job.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getSharedProjectionStores,
  _resetSharedProjectionStores,
} from '@/lib/runtime/projectionRuntime';
import { makeDevOutboxDeps } from '@/lib/jobs/devOutbox';
import { OutboxWriter } from '@/lib/outbox';
import { runPipeline, cboSdohAdapter, defaultPipelineDeps } from '@/lib/pipeline';
import { now } from '@/lib/clock';
import { makeInProcessJobDriver } from '@/lib/jobs/inProcessDriver';
import { registerJob, resetJobRegistry, getJob } from '@/lib/jobs/registry';
import { projectionDrainJob } from '@/lib/jobs/projectionJobs';
import { JobNotRegisteredError } from '@/lib/jobs/types';

const CSV = [
  'member_source_id,screen_date,domain,zcode,result,program',
  'JOBS-DEMO-01,2026-04-03,transportation-insecurity,Z59.82,positive,general',
].join('\n');

async function ingestOnly(): Promise<void> {
  const stores = getSharedProjectionStores();
  const writer = new OutboxWriter(makeDevOutboxDeps(stores.outbox));
  await runPipeline(
    cboSdohAdapter,
    { source: cboSdohAdapter.source, format: cboSdohAdapter.format, payload: CSV },
    defaultPipelineDeps({ now }),
    { writer }
  );
}

describe('job-driver seam — in-process (WPC-01 Phase 5a)', () => {
  beforeEach(() => {
    _resetSharedProjectionStores();
    resetJobRegistry();
  });

  it('registry resolves a registered job and omits an unknown one', () => {
    registerJob(projectionDrainJob);
    expect(getJob('projection.drain')).toBe(projectionDrainJob);
    expect(getJob('does.not.exist')).toBeUndefined();
  });

  it('triggering an unregistered job fails closed', async () => {
    const driver = makeInProcessJobDriver();
    await expect(driver.trigger('projection.drain')).rejects.toBeInstanceOf(JobNotRegisteredError);
  });

  it('runs projection.drain against the shared stores and is idempotent', async () => {
    registerJob(projectionDrainJob);
    const driver = makeInProcessJobDriver();

    await ingestOnly(); // outbox has rows, graph empty
    const h1 = await driver.trigger('projection.drain');
    const s1 = await driver.status(h1);
    expect(s1?.state).toBe('succeeded');
    expect(s1?.result?.metrics.applied).toBeGreaterThan(0);
    expect((await getSharedProjectionStores().graph.listEdges()).length).toBeGreaterThan(0);

    // second drain: nothing new to apply (idempotent via the outbox checkpoint)
    const h2 = await driver.trigger('projection.drain');
    const s2 = await driver.status(h2);
    expect(s2?.result?.metrics.applied).toBe(0);
  });
});
