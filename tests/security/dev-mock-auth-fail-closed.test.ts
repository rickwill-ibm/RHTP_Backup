/**
 * U1 fix — dev-mock auth must fail CLOSED, not OPEN.
 *
 * Proves: (a) the flag defaults OFF, (b) it is IMPOSSIBLE once real auth is
 * configured (tokenUrl set) even when the flag is on, (c) explicit mock mode
 * (flag on, no tokenUrl) still enables the demo stubs, and (d) the PAS route
 * therefore never returns the canned devClaimResponseApproved on a production
 * deploy with real auth wired.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/lib/server/smartSession', async () =>
  (await import('../api/_helpers')).smartSessionMock()
);
// Real auth path substitute: a submitPas that returns a clearly-real sentinel.
vi.mock('@/lib/server/pasClient', () => ({
  submitPas: vi.fn(async () => ({
    ok: true,
    status: 200,
    claimResponse: { resourceType: 'ClaimResponse', id: 'real-backbone-adjudication', disposition: 'from live PAS' },
    correlationId: 'corr-test',
  })),
}));

import { devMockEnabled } from '@/lib/server/devStubs';
import { POST as pasPOST } from '@/app/api/pas/submit/route';
import { makeRequest, readJson, resetSessionState, resetRouteEnv } from '../api/_helpers';

const KEYS = ['ALLOW_DEV_MOCK_AUTH', 'WSO2_TOKEN_URL'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  resetSessionState();
  vi.clearAllMocks();
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('devMockEnabled() — fail-closed gating (U1)', () => {
  it('defaults OFF when the flag is unset (no fail-open default)', () => {
    delete process.env.ALLOW_DEV_MOCK_AUTH;
    delete process.env.WSO2_TOKEN_URL;
    expect(devMockEnabled()).toBe(false);
  });

  it('is impossible once real auth is configured, even with the flag ON', () => {
    process.env.ALLOW_DEV_MOCK_AUTH = 'true';
    process.env.WSO2_TOKEN_URL = 'https://wso2.example/oauth2/token';
    expect(devMockEnabled()).toBe(false);
  });

  it('is enabled only in explicit mock mode: flag ON and no real tokenUrl (demo)', () => {
    process.env.ALLOW_DEV_MOCK_AUTH = 'true';
    delete process.env.WSO2_TOKEN_URL;
    expect(devMockEnabled()).toBe(true);
  });
});

const CLAIM_BUNDLE = {
  resourceType: 'Bundle',
  type: 'collection',
  entry: [{ resource: { resourceType: 'Claim', patient: { reference: 'Patient/PAT-0042' } } }],
};

describe('POST /api/pas/submit — never serves a fake approval in production (U1)', () => {
  it('with real auth wired + flag ON, returns the live adjudication, NOT devClaimResponseApproved', async () => {
    process.env.ALLOW_DEV_MOCK_AUTH = 'true';
    process.env.WSO2_TOKEN_URL = 'https://wso2.example/oauth2/token';
    const res = await pasPOST(
      makeRequest('/api/pas/submit', {
        method: 'POST',
        body: { claimBundle: CLAIM_BUNDLE, approvedBy: 'Dr. Reviewer MD' },
      })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { id?: string; disposition?: string };
    // The canned dev approval (id `dev-cr-approved-*`, disposition "…dev demo…")
    // must NEVER appear when real auth is configured.
    expect(body.id).not.toMatch(/^dev-cr-approved/);
    expect(body.disposition ?? '').not.toMatch(/dev demo/i);
    expect(body.id).toBe('real-backbone-adjudication');
  });

  it('in explicit mock mode (demo) it still returns the canned approval — demo stays green', async () => {
    resetRouteEnv(); // flag ON, no tokenUrl
    const res = await pasPOST(
      makeRequest('/api/pas/submit', {
        method: 'POST',
        body: { claimBundle: CLAIM_BUNDLE, approvedBy: 'Dr. Reviewer MD' },
      })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { id?: string; disposition?: string };
    expect(body.id).toMatch(/^dev-cr-approved/);
    expect(body.disposition ?? '').toMatch(/dev demo/i);
  });
});
