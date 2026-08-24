/**
 * ingest.cbo-sdoh job + ingest->drain orchestration through the driver (Phase 5).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getSharedProjectionStores,
  _resetSharedProjectionStores,
} from '@/lib/runtime/projectionRuntime';
import { makeInProcessJobDriver } from '@/lib/jobs/inProcessDriver';
import { registerJob, resetJobRegistry } from '@/lib/jobs/registry';
import { ingestCboSdohJob } from '@/lib/jobs/ingestJobs';
import { projectionDrainJob } from '@/lib/jobs/projectionJobs';

const CSV = [
  'member_source_id,screen_date,domain,zcode,result,program',
  'JOBS-ING-01,2026-04-03,transportation-insecurity,Z59.82,positive,general',
].join('\n');

describe('ingest.cbo-sdoh job (WPC-01 Phase 5)', () => {
  beforeEach(() => {
    _resetSharedProjectionStores();
    resetJobRegistry();
  });

  it('ingest -> drain populates the shared graph via the driver', async () => {
    registerJob(ingestCboSdohJob);
    registerJob(projectionDrainJob);
    const driver = makeInProcessJobDriver();

    const ih = await driver.trigger('ingest.cbo-sdoh', { payload: CSV });
    expect((await driver.status(ih))?.state).toBe('succeeded');

    const dh = await driver.trigger('projection.drain');
    const ds = await driver.status(dh);
    expect(ds?.result?.metrics.applied).toBeGreaterThan(0);
    expect((await getSharedProjectionStores().graph.listEdges()).length).toBeGreaterThan(0);
  });

  it('ingest requires a payload — fails closed', async () => {
    registerJob(ingestCboSdohJob);
    const driver = makeInProcessJobDriver();
    const h = await driver.trigger('ingest.cbo-sdoh', {});
    expect((await driver.status(h))?.state).toBe('failed');
  });
});
