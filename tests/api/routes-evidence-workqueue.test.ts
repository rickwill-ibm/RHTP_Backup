/**
 * Route coverage (conventions §14): /api/evidence/[id] and /api/work-queue -
 * the Golden Thread read surfaces (auth + authz + validation + flag gates).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
import {
  makeRequest,
  readJson,
  routeParams,
  sessionState,
  resetSessionState,
  guardState,
  resetGuardState,
  resetRouteEnv,
  expectPhiSafeError,
} from './_helpers';

vi.mock('@/lib/server/smartSession', async () =>
  (await import('./_helpers')).smartSessionMock()
);
vi.mock('@/lib/authz/guard', async () => (await import('./_helpers')).guardMock());

import { GET as evidenceGET } from '@/app/api/evidence/[id]/route';
import { GET as workQueueGET } from '@/app/api/work-queue/route';

const EV_ID = 'ev-PAT-0042-75561-1730154783';

beforeEach(() => {
  resetSessionState();
  resetGuardState();
  resetRouteEnv();
  vi.clearAllMocks();
});

describe('GET /api/evidence/[id]', () => {
  it('401 with a PHI-safe body when unauthenticated', async () => {
    sessionState.authenticated = false;
    const res = await evidenceGET(
      makeRequest(`/api/evidence/${EV_ID}`),
      routeParams({ id: EV_ID })
    );
    await expectPhiSafeError(res, 401);
  });

  it('400 with a PHI-safe body for an injection-shaped evidence id (validation)', async () => {
    const bad = 'ev/../etc/passwd';
    const res = await evidenceGET(
      makeRequest('/api/evidence/bad'),
      routeParams({ id: bad })
    );
    const body = (await expectPhiSafeError(res, 400)) as { resourceType: string };
    expect(body.resourceType).toBe('OperationOutcome');
  });

  it('403 with a PHI-safe body when the authz guard denies (authz)', async () => {
    guardState.deny = true;
    const res = await evidenceGET(
      makeRequest(`/api/evidence/${EV_ID}`),
      routeParams({ id: EV_ID })
    );
    const body = (await expectPhiSafeError(res, 403)) as { resourceType: string };
    expect(body.resourceType).toBe('OperationOutcome');
  });

  it('200 returns the evidence record with its audit-spine entries (mock happy path)', async () => {
    const res = await evidenceGET(
      makeRequest(`/api/evidence/${EV_ID}`),
      routeParams({ id: EV_ID })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      id: string;
      memberId: string;
      order: { code: string };
      entries: { stage: string }[];
    };
    expect(body.id).toBe(EV_ID);
    expect(body.memberId).toBe('PAT-0042');
    expect(body.order.code).toBe('75561');
    expect(body.entries.length).toBeGreaterThan(0);
  });
});

describe('GET /api/work-queue', () => {
  it('404 when the goldenThread feature flag is off (flag gate)', async () => {
    process.env.NEXT_PUBLIC_FLAG_GOLDEN_THREAD = 'false';
    const res = await workQueueGET(makeRequest('/api/work-queue'));
    await expectPhiSafeError(res, 404);
  });

  it('401 with a PHI-safe body when unauthenticated', async () => {
    sessionState.authenticated = false;
    const res = await workQueueGET(makeRequest('/api/work-queue'));
    await expectPhiSafeError(res, 401);
  });

  it('403 with a PHI-safe body when the authz guard denies (authz)', async () => {
    guardState.deny = true;
    const res = await workQueueGET(makeRequest('/api/work-queue'));
    const body = (await expectPhiSafeError(res, 403)) as { resourceType: string };
    expect(body.resourceType).toBe('OperationOutcome');
  });

  it('200 returns grouped work items with a count (mock happy path)', async () => {
    const res = await workQueueGET(makeRequest('/api/work-queue'));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      count: number;
      groups: Record<string, { queue: string }[]>;
    };
    expect(body.count).toBeGreaterThan(0);
    expect(body.groups).toBeDefined();
    const grouped = Object.values(body.groups).reduce((n, items) => n + items.length, 0);
    expect(grouped).toBe(body.count);
  });
});
