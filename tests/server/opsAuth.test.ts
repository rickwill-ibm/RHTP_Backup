/** Ops jobs service-token auth — fail-closed, timing-safe (WPC-01 Phase 5). */
import { describe, it, expect, afterEach } from 'vitest';
import { checkOpsJobsAuth } from '@/lib/server/opsAuth';

afterEach(() => {
  delete process.env.OPS_JOBS_TOKEN;
});

describe('ops jobs auth', () => {
  it('fails closed (503) when no token is configured', () => {
    delete process.env.OPS_JOBS_TOKEN;
    expect(checkOpsJobsAuth('Bearer anything')).toMatchObject({ ok: false, status: 503 });
  });
  it('401 when the bearer token is missing', () => {
    process.env.OPS_JOBS_TOKEN = 'secret';
    expect(checkOpsJobsAuth(null)).toMatchObject({ ok: false, status: 401 });
  });
  it('401 when the token does not match', () => {
    process.env.OPS_JOBS_TOKEN = 'secret';
    expect(checkOpsJobsAuth('Bearer wrong')).toMatchObject({ ok: false, status: 401 });
  });
  it('ok when the token matches', () => {
    process.env.OPS_JOBS_TOKEN = 'secret';
    expect(checkOpsJobsAuth('Bearer secret')).toMatchObject({ ok: true, status: 200 });
  });
});
