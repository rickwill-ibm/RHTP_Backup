/**
 * Route coverage (conventions §14): /api/consent/provider-access -
 * member-controlled Provider Access opt-out (attributed writes only).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
import {
  makeRequest,
  readJson,
  sessionState,
  resetSessionState,
  resetRouteEnv,
  setDevMock,
  expectPhiSafeError,
} from './_helpers';

vi.mock('@/lib/server/smartSession', async () =>
  (await import('./_helpers')).smartSessionMock()
);

import { GET, POST } from '@/app/api/consent/provider-access/route';

beforeEach(() => {
  resetSessionState();
  resetRouteEnv();
  vi.clearAllMocks();
});

describe('GET /api/consent/provider-access', () => {
  it('401 with a PHI-safe body when unauthenticated outside mock mode', async () => {
    setDevMock(false);
    sessionState.authenticated = false;
    const res = await GET(makeRequest('/api/consent/provider-access?memberId=M1'));
    await expectPhiSafeError(res, 401);
  });

  it('400 with a PHI-safe body when memberId is missing (validation)', async () => {
    const res = await GET(makeRequest('/api/consent/provider-access'));
    const body = (await expectPhiSafeError(res, 400)) as { resourceType: string };
    expect(body.resourceType).toBe('OperationOutcome');
  });

  it('200 reports optedOut=false for a member with no consent record (happy path)', async () => {
    const res = await GET(
      makeRequest('/api/consent/provider-access?memberId=CONSENT-TEST-NONE')
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { memberId: string; optedOut: boolean };
    expect(body.memberId).toBe('CONSENT-TEST-NONE');
    expect(body.optedOut).toBe(false);
  });
});

describe('POST /api/consent/provider-access', () => {
  it('401 with a PHI-safe body when unauthenticated outside mock mode', async () => {
    setDevMock(false);
    sessionState.authenticated = false;
    const res = await POST(
      makeRequest('/api/consent/provider-access', {
        method: 'POST',
        body: { memberId: 'M1', action: 'opt-out', recordedBy: 'member:M1' },
      })
    );
    await expectPhiSafeError(res, 401);
  });

  it('400 with a PHI-safe body when memberId or action is missing (validation)', async () => {
    const res = await POST(
      makeRequest('/api/consent/provider-access', {
        method: 'POST',
        body: { memberId: 'M1' },
      })
    );
    await expectPhiSafeError(res, 400);
  });

  it('400 with a PHI-safe body when recordedBy is absent - consent writes must be attributed', async () => {
    const res = await POST(
      makeRequest('/api/consent/provider-access', {
        method: 'POST',
        body: { memberId: 'CONSENT-TEST-ANON', action: 'opt-out' },
      })
    );
    const body = (await expectPhiSafeError(res, 400)) as {
      issue: { diagnostics: string }[];
    };
    expect(body.issue[0].diagnostics).toContain('recordedBy');
  });

  it('200 records an opt-out and a subsequent revoke, both attributed (happy path)', async () => {
    const optOut = await POST(
      makeRequest('/api/consent/provider-access', {
        method: 'POST',
        body: {
          memberId: 'CONSENT-TEST-FLOW',
          action: 'opt-out',
          recordedBy: 'member:CONSENT-TEST-FLOW',
          reason: 'member request',
        },
      })
    );
    expect(optOut.status).toBe(200);
    const out = (await readJson(optOut)) as { optedOut: boolean };
    expect(out.optedOut).toBe(true);

    const revoke = await POST(
      makeRequest('/api/consent/provider-access', {
        method: 'POST',
        body: {
          memberId: 'CONSENT-TEST-FLOW',
          action: 'revoke',
          recordedBy: 'member:CONSENT-TEST-FLOW',
        },
      })
    );
    expect(revoke.status).toBe(200);
    const back = (await readJson(revoke)) as { optedOut: boolean };
    expect(back.optedOut).toBe(false);
  });

  it('accepts recordedBy via the x-recorded-by header as the route allows', async () => {
    const res = await POST(
      makeRequest('/api/consent/provider-access', {
        method: 'POST',
        body: { memberId: 'CONSENT-TEST-HDR', action: 'opt-out' },
        headers: { 'x-recorded-by': 'csr:agent-7' },
      })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { optedOut: boolean };
    expect(body.optedOut).toBe(true);
  });
});
