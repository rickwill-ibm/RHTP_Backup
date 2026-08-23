/**
 * SECURITY LENS — Attack class 1: AuthZ bypass.
 *
 * Asserts SAFE behavior: privileged BFF routes reject unauthenticated callers
 * (401) and honor an authorization DENY from the guard (403). Every error body
 * is PHI-safe.
 *
 * FINDING (Med, documented — not fixed here): the read routes that call
 * canReadMemberData (evidence/[id], work-queue, financial-clearance) invoke it
 * with a HARDCODED `{ role: 'pa-reviewer', purpose: 'operations' }`, not the
 * authenticated session principal. The guard therefore cannot deny based on WHO
 * is calling — every authenticated caller is treated as a reviewer. The 403 path
 * below is real (it fires when the guard is forced to deny), but in production
 * the guard is never fed the caller's true role. Fix rec: derive role/purpose
 * from the session (smartSession) and pass them to canReadMemberData.
 * See src/app/api/evidence/[id]/route.ts:~150, work-queue/route.ts:~34,
 * financial-clearance/route.ts:~180.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
import {
  makeRequest,
  routeParams,
  sessionState,
  guardState,
  resetSessionState,
  resetGuardState,
  resetRouteEnv,
  setDevMock,
  expectPhiSafeError,
} from '../api/_helpers';

vi.mock('@/lib/server/smartSession', async () => (await import('../api/_helpers')).smartSessionMock());
vi.mock('@/lib/authz/guard', async () => (await import('../api/_helpers')).guardMock());

import { POST as matchPOST } from '@/app/api/match/route';
import { GET as evidenceGET } from '@/app/api/evidence/[id]/route';
import { GET as workQueueGET } from '@/app/api/work-queue/route';
import { POST as clearancePOST } from '@/app/api/financial-clearance/route';
import { GET as naGET, POST as naPOST } from '@/app/api/network-adequacy/route';
import { GET as consentGET, POST as consentPOST } from '@/app/api/consent/provider-access/route';
import { POST as pasPOST } from '@/app/api/pas/submit/route';
import { POST as cdsPOST } from '@/app/api/cds/route';
import { POST as bulkStartPOST } from '@/app/api/bulk/start/route';
import { GET as fhirGET } from '@/app/api/fhir/[...path]/route';

const VALID_EVIDENCE_ID = 'ev-PAT-0042-75561-1715782920000';

beforeEach(() => {
  resetSessionState();
  resetGuardState();
  resetRouteEnv();
  vi.clearAllMocks();
});

describe('AuthZ bypass — unauthenticated callers are rejected (401)', () => {
  beforeEach(() => {
    // consent bypasses auth in dev-mock; force real-auth path so 401 is reachable.
    setDevMock(false);
    sessionState.authenticated = false;
  });

  it('POST /api/match → 401 PHI-safe', async () => {
    const res = await matchPOST(makeRequest('/api/match', { method: 'POST', body: { resourceType: 'Parameters' } }));
    await expectPhiSafeError(res, 401);
  });

  it('GET /api/evidence/:id → 401 PHI-safe', async () => {
    const res = await evidenceGET(makeRequest(`/api/evidence/${VALID_EVIDENCE_ID}`), routeParams({ id: VALID_EVIDENCE_ID }));
    await expectPhiSafeError(res, 401);
  });

  it('GET /api/work-queue → 401 PHI-safe', async () => {
    const res = await workQueueGET(makeRequest('/api/work-queue'));
    await expectPhiSafeError(res, 401);
  });

  it('POST /api/financial-clearance → 401 PHI-safe', async () => {
    const res = await clearancePOST(makeRequest('/api/financial-clearance', { method: 'POST', body: { patientId: 'PAT-0042' } }));
    await expectPhiSafeError(res, 401);
  });

  it('GET /api/network-adequacy → 401 PHI-safe', async () => {
    const res = await naGET(makeRequest('/api/network-adequacy?state=SD'));
    await expectPhiSafeError(res, 401);
  });

  it('POST /api/network-adequacy → 401 PHI-safe', async () => {
    const res = await naPOST(makeRequest('/api/network-adequacy', { method: 'POST', body: { query: 'gaps' } }));
    await expectPhiSafeError(res, 401);
  });

  it('GET /api/consent/provider-access → 401 PHI-safe', async () => {
    const res = await consentGET(makeRequest('/api/consent/provider-access?memberId=PAT-0042'));
    await expectPhiSafeError(res, 401);
  });

  it('POST /api/consent/provider-access → 401 PHI-safe', async () => {
    const res = await consentPOST(makeRequest('/api/consent/provider-access', { method: 'POST', body: { memberId: 'PAT-0042', action: 'opt-out', recordedBy: 'x' } }));
    await expectPhiSafeError(res, 401);
  });

  it('POST /api/pas/submit → 401 PHI-safe', async () => {
    const res = await pasPOST(makeRequest('/api/pas/submit', { method: 'POST', body: { claimBundle: {}, approvedBy: 'x' } }));
    await expectPhiSafeError(res, 401);
  });

  it('POST /api/cds → 401 PHI-safe', async () => {
    const res = await cdsPOST(makeRequest('/api/cds', { method: 'POST', body: { hookId: 'x' } }));
    await expectPhiSafeError(res, 401);
  });

  it('POST /api/bulk/start → 401 PHI-safe', async () => {
    const res = await bulkStartPOST(makeRequest('/api/bulk/start', { method: 'POST', body: { priorPayer: 'Aetna' } }));
    await expectPhiSafeError(res, 401);
  });

  it('GET /api/fhir/:path → 401 PHI-safe', async () => {
    const res = await fhirGET(makeRequest('/api/fhir/Patient?subject=Patient/PAT-0042'), routeParams({ path: ['Patient'] }));
    await expectPhiSafeError(res, 401);
  });
});

describe('AuthZ deny — guard DENY is honored (403)', () => {
  beforeEach(() => {
    sessionState.authenticated = true;
    guardState.deny = true;
  });

  it('GET /api/evidence/:id → 403 PHI-safe when guard denies', async () => {
    const res = await evidenceGET(makeRequest(`/api/evidence/${VALID_EVIDENCE_ID}`), routeParams({ id: VALID_EVIDENCE_ID }));
    await expectPhiSafeError(res, 403);
  });

  it('GET /api/work-queue → 403 PHI-safe when guard denies', async () => {
    const res = await workQueueGET(makeRequest('/api/work-queue'));
    await expectPhiSafeError(res, 403);
  });

  it('POST /api/financial-clearance → 403 PHI-safe when guard denies', async () => {
    const res = await clearancePOST(makeRequest('/api/financial-clearance', { method: 'POST', body: { patientId: 'PAT-0042' } }));
    await expectPhiSafeError(res, 403);
  });
});
