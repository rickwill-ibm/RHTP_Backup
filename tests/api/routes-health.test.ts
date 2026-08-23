/**
 * routes-health.test.ts — the readiness + liveness health probes.
 *
 * readiness reflects the preflight: 200 when ready, 503 when not, naming the
 * unmet requirement, PHI-safe. liveness is a cheap always-200 process check.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readJson, expectPhiSafeBody } from './_helpers';
import { GET as readinessGET } from '@/app/api/health/readiness/route';
import { GET as livenessGET } from '@/app/api/health/liveness/route';
import { clearSessionDataModes, DATA_MODE_SEAMS, seamEnvVar } from '@/lib/config/dataMode';

let snapshot: NodeJS.ProcessEnv;

function clearDataModeEnv(): void {
  delete process.env.DATA_MODE;
  for (const seam of DATA_MODE_SEAMS) delete process.env[seamEnvVar(seam)];
}

beforeEach(() => {
  snapshot = { ...process.env };
  clearSessionDataModes();
  clearDataModeEnv();
});

afterEach(() => {
  for (const k of Object.keys(process.env)) if (!(k in snapshot)) delete process.env[k];
  Object.assign(process.env, snapshot);
  clearSessionDataModes();
});

describe('GET /api/health/readiness', () => {
  it('200 when ready (development posture, default mock seams)', async () => {
    process.env.DEPLOY_ENV = 'development';
    const res = await readinessGET();
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { ready: boolean; environment: string; unmet: unknown[] };
    expect(body.ready).toBe(true);
    expect(body.environment).toBe('development');
    expect(body.unmet).toEqual([]);
    expectPhiSafeBody(body, 'readiness 200 body');
  });

  it('503 when not-ready (production posture, missing required keys), naming the unmet key', async () => {
    process.env.DEPLOY_ENV = 'production';
    delete process.env.SESSION_SECRET;
    const res = await readinessGET();
    expect(res.status).toBe(503);
    const body = (await readJson(res)) as {
      ready: boolean;
      unmet: Array<{ name: string; kind: string; reason: string }>;
    };
    expect(body.ready).toBe(false);
    expect(body.unmet.map((u) => u.name)).toContain('SESSION_SECRET');
    expectPhiSafeBody(body, 'readiness 503 body');
  });

  it('503 names a NotConfigured production seam backend', async () => {
    process.env.DEPLOY_ENV = 'production';
    process.env.SESSION_SECRET = 'set';
    process.env.WSO2_AUTHORIZE_URL = 'https://a';
    process.env.WSO2_TOKEN_URL = 'https://t';
    process.env.WSO2_CLIENT_ID = 'id';
    process.env.WSO2_CLIENT_SECRET = 'sec';
    process.env[seamEnvVar('crossReference')] = 'production';
    delete process.env.DATABASE_URL; // substrate single entry unset -> NotConfigured
    const res = await readinessGET();
    expect(res.status).toBe(503);
    const body = (await readJson(res)) as {
      unmet: Array<{ name: string; seam?: string; wouldThrow?: string }>;
    };
    const miss = body.unmet.find((u) => u.seam === 'crossReference');
    expect(miss).toBeDefined();
    // crossReference is substrate-backed: its single entry is DATABASE_URL and the
    // boot-time error is the substrate's (the preflight consults the substrate).
    expect(miss!.name).toBe('DATABASE_URL');
    expect(miss!.wouldThrow).toBe('SubstrateNotConfiguredError');
    expectPhiSafeBody(body, 'readiness seam 503 body');
  });
});

describe('GET /api/health/liveness', () => {
  it('200 alive regardless of deployment config (cheap process check)', async () => {
    process.env.DEPLOY_ENV = 'production';
    delete process.env.SESSION_SECRET; // readiness would be 503; liveness must not care
    const res = await livenessGET();
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { status: string; pid: number; uptimeSeconds: number };
    expect(body.status).toBe('alive');
    expect(typeof body.pid).toBe('number');
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expectPhiSafeBody(body, 'liveness body');
  });
});
