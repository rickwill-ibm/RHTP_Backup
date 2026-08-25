/** Ops job runtime — shared driver singleton + core registration (WPC-01 Phase 5). */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getSharedOpsJobDriver,
  ensureCoreJobsRegistered,
  _resetOpsRuntime,
} from '@/lib/jobs/opsRuntime';
import {
  getSharedProjectionStores,
  _resetSharedProjectionStores,
} from '@/lib/runtime/projectionRuntime';
import { resetJobRegistry, listJobs } from '@/lib/jobs/registry';
import { JobNotRegisteredError } from '@/lib/jobs/types';

const CSV = [
  'member_source_id,screen_date,domain,zcode,result,program',
  'OPS-01,2026-04-03,food-insecurity,Z59.41,positive,general',
].join('\n');

describe('ops job runtime', () => {
  beforeEach(() => {
    _resetSharedProjectionStores();
    resetJobRegistry();
    _resetOpsRuntime();
  });

  it('the shared ops driver is a stable singleton', () => {
    expect(getSharedOpsJobDriver()).toBe(getSharedOpsJobDriver());
  });

  it('registers drain + dev ingest in mock', () => {
    ensureCoreJobsRegistered();
    expect(listJobs()).toContain('projection.drain');
    expect(listJobs()).toContain('ingest.cbo-sdoh');
  });

  it('drives ingest -> drain through the shared driver; status persists', async () => {
    ensureCoreJobsRegistered();
    const driver = getSharedOpsJobDriver();
    await driver.trigger('ingest.cbo-sdoh', { payload: CSV });
    const handle = await driver.trigger('projection.drain');
    const st = await driver.status(handle);
    expect(st?.result?.metrics.applied).toBeGreaterThan(0);
    expect((await getSharedProjectionStores().graph.listEdges()).length).toBeGreaterThan(0);
  });

  it('unknown job fails closed', async () => {
    ensureCoreJobsRegistered();
    await expect(getSharedOpsJobDriver().trigger('no.such.job')).rejects.toBeInstanceOf(
      JobNotRegisteredError
    );
  });
});
