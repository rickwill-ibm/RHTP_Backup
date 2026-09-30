/**
 * Route coverage (conventions §14): /api/evidence/[id] and /api/work-queue -
 * the Golden Thread read surfaces (auth + authz + validation + flag gates).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

vi.mock('@/lib/server/smartSession', async () => (await import('./_helpers')).smartSessionMock());
vi.mock('@/lib/authz/guard', async () => (await import('./_helpers')).guardMock());

import { GET as evidenceGET } from '@/app/api/evidence/[id]/route';
import { GET as workQueueGET } from '@/app/api/work-queue/route';

const EV_ID = 'ev-PAT-0042-75561-1730154782';

beforeEach(() => {
  resetSessionState();
  resetGuardState();
  resetRouteEnv();
  vi.clearAllMocks();
});

afterEach(() => {
  // Wave-6 tests toggle this flag explicitly; clear it so it never leaks to other files.
  delete process.env.NEXT_PUBLIC_FLAG_GOLDEN_THREAD_E2E;
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
    const res = await evidenceGET(makeRequest('/api/evidence/bad'), routeParams({ id: bad }));
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

  // Wave-6: dual-party view is additive, behind goldenThreadE2E + ?party=.
  it('does NOT augment the response when ?party is absent (byte-identical default)', async () => {
    process.env.NEXT_PUBLIC_FLAG_GOLDEN_THREAD_E2E = 'true';
    const res = await evidenceGET(
      makeRequest(`/api/evidence/${EV_ID}`),
      routeParams({ id: EV_ID })
    );
    const body = (await readJson(res)) as Record<string, unknown>;
    expect(body.partyView).toBeUndefined();
    expect(body.escalation).toBeUndefined();
    // Wave-7: the routed-escalation augmentation is param-gated too.
    expect(body.routedEscalation).toBeUndefined();
  });

  it('does NOT augment when the flag is off even with ?party (flag gate)', async () => {
    process.env.NEXT_PUBLIC_FLAG_GOLDEN_THREAD_E2E = 'false';
    const res = await evidenceGET(
      makeRequest(`/api/evidence/${EV_ID}?party=payer`),
      routeParams({ id: EV_ID })
    );
    const body = (await readJson(res)) as Record<string, unknown>;
    expect(body.partyView).toBeUndefined();
    expect(body.escalation).toBeUndefined();
    expect(body.routedEscalation).toBeUndefined();
  });

  it('augments with a PHI-safe party view + escalation when flag on AND ?party=payer', async () => {
    process.env.NEXT_PUBLIC_FLAG_GOLDEN_THREAD_E2E = 'true';
    const res = await evidenceGET(
      makeRequest(`/api/evidence/${EV_ID}?party=payer`),
      routeParams({ id: EV_ID })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      partyView?: { viewer: string; header: { recordRef: string }; events: unknown[] };
      escalation?: { gate: string; signals: unknown[] };
    };
    expect(body.partyView?.viewer).toBe('payer');
    expect(body.partyView?.header.recordRef).toBe('evidence-record');
    expect(Array.isArray(body.partyView?.events)).toBe(true);
    expect(body.escalation?.gate).toBeDefined();
    // The party projection itself never leaks the member id embedded in the record id.
    expect(JSON.stringify(body.partyView)).not.toContain('PAT-0042');
  });

  it('additively routes the escalation through the queue engine (Wave-7 bridge) when flag on AND ?party', async () => {
    process.env.NEXT_PUBLIC_FLAG_GOLDEN_THREAD_E2E = 'true';
    const res = await evidenceGET(
      makeRequest(`/api/evidence/${EV_ID}?party=provider`),
      routeParams({ id: EV_ID })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      routedEscalation?: {
        gate: string;
        queueItem: { recordRef: string } | null;
        escalationStep: unknown;
        notifications: { payer: unknown[]; provider: unknown[] };
      };
    };
    // The bridge is wired: the routed-escalation block is present with the per-party lens.
    expect(body.routedEscalation?.gate).toBeDefined();
    expect(Array.isArray(body.routedEscalation?.notifications.payer)).toBe(true);
    expect(Array.isArray(body.routedEscalation?.notifications.provider)).toBe(true);
    // The seeded demo record carries no recovery draft → no queue item, no hop.
    expect(body.routedEscalation?.queueItem).toBeNull();
    expect(body.routedEscalation?.escalationStep).toBeNull();
    // PHI-safe: the routed block never leaks the member id embedded in the record id.
    expect(JSON.stringify(body.routedEscalation)).not.toContain('PAT-0042');
  });

  // Wave-8: the curated ledger analysis is additive, behind goldenThreadE2E + ?party= + ?analysis=.
  it('does NOT add analysis when ?analysis is absent (byte-identical to Wave-7)', async () => {
    process.env.NEXT_PUBLIC_FLAG_GOLDEN_THREAD_E2E = 'true';
    const res = await evidenceGET(
      makeRequest(`/api/evidence/${EV_ID}?party=payer`),
      routeParams({ id: EV_ID })
    );
    const body = (await readJson(res)) as Record<string, unknown>;
    expect(body.analysis).toBeUndefined();
  });

  it('does NOT add analysis when the flag is off even with ?party&?analysis (flag gate)', async () => {
    process.env.NEXT_PUBLIC_FLAG_GOLDEN_THREAD_E2E = 'false';
    const res = await evidenceGET(
      makeRequest(`/api/evidence/${EV_ID}?party=payer&analysis=denial-rca`),
      routeParams({ id: EV_ID })
    );
    const body = (await readJson(res)) as Record<string, unknown>;
    expect(body.analysis).toBeUndefined();
    expect(body.partyView).toBeUndefined();
  });

  it('runs the curated analysis additively when flag on AND ?party AND ?analysis', async () => {
    process.env.NEXT_PUBLIC_FLAG_GOLDEN_THREAD_E2E = 'true';
    const res = await evidenceGET(
      makeRequest(`/api/evidence/${EV_ID}?party=payer&analysis=denial-rca`),
      routeParams({ id: EV_ID })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      analysis?: {
        outcome: string;
        party: string;
        finding?: { recordRef: string; anomaly: boolean };
      };
    };
    expect(body.analysis?.outcome).toBe('ok');
    expect(body.analysis?.party).toBe('payer');
    expect(body.analysis?.finding?.recordRef).toBe('evidence-record');
    // PHI-safe: the analysis block never leaks the member id embedded in the record id.
    expect(JSON.stringify(body.analysis)).not.toContain('PAT-0042');
  });

  it('surfaces a plan-validate rejection through the wired path (out-of-scope)', async () => {
    process.env.NEXT_PUBLIC_FLAG_GOLDEN_THREAD_E2E = 'true';
    const res = await evidenceGET(
      makeRequest(`/api/evidence/${EV_ID}?party=provider&analysis=recovery-verification`),
      routeParams({ id: EV_ID })
    );
    const body = (await readJson(res)) as { analysis?: { outcome: string } };
    expect(body.analysis?.outcome).toBe('plan-rejected');
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
