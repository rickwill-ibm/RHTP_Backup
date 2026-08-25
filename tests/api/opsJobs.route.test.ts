/** Ops jobs HTTP surface — run + status routes, service-token gated (WPC-01 Phase 5). */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/ops/jobs/run/route';
import { GET } from '@/app/api/ops/jobs/status/route';
import { _resetSharedProjectionStores } from '@/lib/runtime/projectionRuntime';
import { resetJobRegistry } from '@/lib/jobs/registry';
import { _resetOpsRuntime } from '@/lib/jobs/opsRuntime';

const TOKEN = 'test-ops-token';

function runReq(bodyObj: unknown, token?: string): NextRequest {
  return new NextRequest('http://localhost/api/ops/jobs/run', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(bodyObj),
  });
}

describe('ops jobs HTTP surface', () => {
  beforeEach(() => {
    _resetSharedProjectionStores();
    resetJobRegistry();
    _resetOpsRuntime();
    process.env.OPS_JOBS_TOKEN = TOKEN;
  });
  afterEach(() => {
    delete process.env.OPS_JOBS_TOKEN;
  });

  it('rejects a request without a valid token (401)', async () => {
    const res = await POST(runReq({ name: 'projection.drain' }));
    expect(res.status).toBe(401);
  });

  it('fails closed (503) when the ops token is not configured', async () => {
    delete process.env.OPS_JOBS_TOKEN;
    const res = await POST(runReq({ name: 'projection.drain' }, 'anything'));
    expect(res.status).toBe(503);
  });

  it('runs projection.drain with a valid token and the status route reads it back', async () => {
    const res = await POST(runReq({ name: 'projection.drain' }, TOKEN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('succeeded');
    expect(body.runId).toBeTruthy();

    const statusRes = await GET(
      new NextRequest(`http://localhost/api/ops/jobs/status?runId=${body.runId}`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      })
    );
    expect(statusRes.status).toBe(200);
    const st = await statusRes.json();
    expect(st.runId).toBe(body.runId);
    expect(st.state).toBe('succeeded');
  });

  it('unknown job returns 404', async () => {
    const res = await POST(runReq({ name: 'no.such.job' }, TOKEN));
    expect(res.status).toBe(404);
  });
});
