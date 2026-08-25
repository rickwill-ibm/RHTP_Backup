/** HTTP ops driver — triggers/polls the ops surface of a remote runner (Phase 5). */
import { describe, it, expect } from 'vitest';
import { makeHttpOpsJobDriver } from '@/lib/jobs/httpOpsDriver';

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('http ops driver', () => {
  it('trigger POSTs to /run and returns the run handle', async () => {
    const urls: string[] = [];
    const driver = makeHttpOpsJobDriver({
      baseUrl: 'http://runner',
      token: 't',
      fetchImpl: async (url) => {
        urls.push(String(url));
        return jsonRes(200, { runId: 'r1', jobName: 'projection.drain', state: 'succeeded' });
      },
    });
    const h = await driver.trigger('projection.drain');
    expect(h.runId).toBe('r1');
    expect(urls[0]).toContain('/api/ops/jobs/run');
  });

  it('status GETs /status and returns the run status', async () => {
    const driver = makeHttpOpsJobDriver({
      baseUrl: 'http://runner',
      token: 't',
      fetchImpl: async () => jsonRes(200, { runId: 'r1', jobName: 'x', state: 'succeeded' }),
    });
    const st = await driver.status({ runId: 'r1', jobName: 'x' });
    expect(st?.state).toBe('succeeded');
  });

  it('status returns null on 404', async () => {
    const driver = makeHttpOpsJobDriver({
      baseUrl: 'http://runner',
      token: 't',
      fetchImpl: async () => jsonRes(404, {}),
    });
    expect(await driver.status({ runId: 'x', jobName: '' })).toBeNull();
  });

  it('trigger throws on a non-ok response', async () => {
    const driver = makeHttpOpsJobDriver({
      baseUrl: 'http://runner',
      token: 't',
      fetchImpl: async () => jsonRes(500, {}),
    });
    await expect(driver.trigger('nope')).rejects.toThrow();
  });
});
