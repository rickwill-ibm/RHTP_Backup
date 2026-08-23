/**
 * Route coverage (conventions §14): /api/network-adequacy - analytics GET and
 * deterministic assistant POST (flag + auth + validation, no member PHI).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
import {
  makeRequest,
  readJson,
  sessionState,
  resetSessionState,
  resetRouteEnv,
  expectPhiSafeError,
} from './_helpers';

vi.mock('@/lib/server/smartSession', async () =>
  (await import('./_helpers')).smartSessionMock()
);

import { GET, POST } from '@/app/api/network-adequacy/route';

beforeEach(() => {
  resetSessionState();
  resetRouteEnv();
  vi.clearAllMocks();
});

describe('GET /api/network-adequacy', () => {
  it('404 when the networkAdequacy feature flag is off (flag gate)', async () => {
    process.env.NEXT_PUBLIC_FLAG_NETWORK_ADEQUACY = 'false';
    const res = await GET(makeRequest('/api/network-adequacy?state=SD'));
    await expectPhiSafeError(res, 404);
  });

  it('401 with a PHI-safe body when unauthenticated', async () => {
    sessionState.authenticated = false;
    const res = await GET(makeRequest('/api/network-adequacy?state=SD'));
    await expectPhiSafeError(res, 401);
  });

  it('200 returns metrics and prioritized gaps for a state (happy path)', async () => {
    const res = await GET(makeRequest('/api/network-adequacy?state=SD'));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      state: string;
      metrics: unknown;
      gaps: unknown[];
    };
    expect(body.state).toBe('SD');
    expect(body.metrics).toBeDefined();
    expect(Array.isArray(body.gaps)).toBe(true);
  });

  it('200 defaults to ALL states when no state filter is given', async () => {
    const res = await GET(makeRequest('/api/network-adequacy'));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { state: string };
    expect(body.state).toBe('ALL');
  });
});

describe('POST /api/network-adequacy (assistant)', () => {
  it('404 when the networkAdequacy feature flag is off (flag gate)', async () => {
    process.env.NEXT_PUBLIC_FLAG_NETWORK_ADEQUACY = 'false';
    const res = await POST(
      makeRequest('/api/network-adequacy', { method: 'POST', body: { query: 'gaps in SD?' } })
    );
    await expectPhiSafeError(res, 404);
  });

  it('401 with a PHI-safe body when unauthenticated', async () => {
    sessionState.authenticated = false;
    const res = await POST(
      makeRequest('/api/network-adequacy', { method: 'POST', body: { query: 'gaps in SD?' } })
    );
    await expectPhiSafeError(res, 401);
  });

  it('400 with a PHI-safe body when query is missing or not a string (validation)', async () => {
    const res = await POST(
      makeRequest('/api/network-adequacy', { method: 'POST', body: { query: 42 } })
    );
    const body = (await expectPhiSafeError(res, 400)) as { resourceType: string };
    expect(body.resourceType).toBe('OperationOutcome');
  });

  it('400 with a PHI-safe body when the query exceeds the 500-char cap (validation)', async () => {
    const res = await POST(
      makeRequest('/api/network-adequacy', {
        method: 'POST',
        body: { query: 'x'.repeat(501) },
      })
    );
    await expectPhiSafeError(res, 400);
  });

  it('200 answers deterministically with an intent and scope (happy path)', async () => {
    const res = await POST(
      makeRequest('/api/network-adequacy', {
        method: 'POST',
        body: { query: 'Where are the biggest specialist gaps?', defaultState: 'SD' },
      })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { intent: string; scope: unknown };
    expect(body.intent).toBeTruthy();
    expect(body.scope).toBeDefined();
  });
});
