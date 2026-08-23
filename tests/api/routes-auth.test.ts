/**
 * Route coverage (conventions §14): /api/auth/* - login, callback, logout, session.
 *
 * Session seam is mocked; the handlers are the real exported GET/POST.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
import {
  makeRequest,
  readJson,
  smartSession,
  sessionState,
  resetSessionState,
  resetRouteEnv,
  expectPhiSafeError,
} from './_helpers';

vi.mock('@/lib/server/smartSession', async () =>
  (await import('./_helpers')).smartSessionMock()
);

import { GET as loginGET } from '@/app/api/auth/login/route';
import { GET as callbackGET } from '@/app/api/auth/callback/route';
import { POST as logoutPOST } from '@/app/api/auth/logout/route';
import { GET as sessionGET, POST as sessionPOST } from '@/app/api/auth/session/route';

beforeEach(() => {
  resetSessionState();
  resetRouteEnv();
  vi.clearAllMocks();
});

describe('GET /api/auth/login', () => {
  it('redirects to the IdP authorize URL when WSO2 is configured (happy path)', async () => {
    smartSession.beginSmartLaunch.mockResolvedValueOnce({
      authorizeUrl: 'https://idp.example.test/oauth2/authorize?client_id=x',
    });
    const res = await loginGET(makeRequest('/api/auth/login'));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get('location')).toContain('https://idp.example.test/oauth2/authorize');
  });

  it('falls back to the dev session and redirects to /cms when WSO2 is unconfigured', async () => {
    sessionState.devSessionOk = true; // beginSmartLaunch default impl throws
    const res = await loginGET(makeRequest('/api/auth/login'));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get('location')).toContain('/cms');
    expect(smartSession.startDevSession).toHaveBeenCalled();
  });

  it('returns 503 with a PHI-safe OperationOutcome when no auth path is available', async () => {
    sessionState.devSessionOk = false;
    const res = await loginGET(makeRequest('/api/auth/login'));
    const body = (await expectPhiSafeError(res, 503)) as {
      resourceType: string;
      issue: { code: string }[];
    };
    expect(body.resourceType).toBe('OperationOutcome');
    expect(body.issue[0].code).toBe('login');
  });
});

describe('GET /api/auth/callback', () => {
  it('400 when code or state is missing (validation)', async () => {
    const res = await callbackGET(makeRequest('/api/auth/callback?code=abc'));
    const body = (await expectPhiSafeError(res, 400)) as { resourceType: string };
    expect(body.resourceType).toBe('OperationOutcome');
  });

  it('redirects into the app after a successful token exchange (happy path)', async () => {
    const res = await callbackGET(makeRequest('/api/auth/callback?code=abc&state=xyz'));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get('location')).toContain('/md-smart-launch');
    expect(smartSession.completeSmartCallback).toHaveBeenCalledWith('abc', 'xyz');
  });

  it('401 with a PHI-safe body when the token exchange fails', async () => {
    smartSession.completeSmartCallback.mockRejectedValueOnce(
      new Error('Invalid PKCE state')
    );
    const res = await callbackGET(makeRequest('/api/auth/callback?code=abc&state=bad'));
    const body = (await expectPhiSafeError(res, 401)) as { resourceType: string };
    expect(body.resourceType).toBe('OperationOutcome');
  });
});

describe('POST /api/auth/logout', () => {
  it('clears the session and redirects to / (happy path)', async () => {
    const res = await logoutPOST(makeRequest('/api/auth/logout', { method: 'POST' }));
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(smartSession.logout).toHaveBeenCalled();
  });
});

describe('GET /api/auth/session', () => {
  it('returns authenticated=true plus the patient id (happy path, 200)', async () => {
    const res = await sessionGET();
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { authenticated: boolean; patient: string | null };
    expect(body.authenticated).toBe(true);
    expect(body.patient).toBe('MARIA_SD_001');
  });

  it('returns authenticated=false when no session exists (401-equivalent for this route)', async () => {
    sessionState.authenticated = false;
    const res = await sessionGET();
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { authenticated: boolean; patient: string | null };
    expect(body.authenticated).toBe(false);
    expect(body.patient).toBeNull();
  });

  it('degrades to authenticated=false when the session layer throws', async () => {
    smartSession.isAuthenticated.mockRejectedValueOnce(new Error('cookie store down'));
    const res = await sessionGET();
    const body = (await readJson(res)) as { authenticated: boolean };
    expect(body.authenticated).toBe(false);
  });
});

describe('POST /api/auth/session', () => {
  it('400 when the patient field is missing (validation)', async () => {
    const res = await sessionPOST(
      makeRequest('/api/auth/session', { method: 'POST', body: {} })
    );
    await expectPhiSafeError(res, 400);
  });

  it('400 on a malformed JSON body (validation)', async () => {
    const res = await sessionPOST(
      makeRequest('/api/auth/session', { method: 'POST', rawBody: '{not json' })
    );
    await expectPhiSafeError(res, 400);
  });

  it('200 when the dev session patient switch succeeds (happy path)', async () => {
    const res = await sessionPOST(
      makeRequest('/api/auth/session', { method: 'POST', body: { patient: 'PAT-0042' } })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { ok: boolean; patient: string | null };
    expect(body.ok).toBe(true);
    expect(body.patient).toBe('PAT-0042');
  });

  it('409 when the dev session switch is refused (e.g. real WSO2 configured)', async () => {
    sessionState.devSessionOk = false;
    const res = await sessionPOST(
      makeRequest('/api/auth/session', { method: 'POST', body: { patient: 'PAT-0042' } })
    );
    expect(res.status).toBe(409);
    const body = (await readJson(res)) as { ok: boolean };
    expect(body.ok).toBe(false);
  });
});
