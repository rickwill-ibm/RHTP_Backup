/**
 * SECURITY LENS — Attack class 4: input validation at boundaries.
 *
 * Asserts routes reject malformed bodies with 400 BEFORE the value reaches a
 * store/FHIR/engine call (parse-don't-validate, conventions §5). Every reject
 * body is PHI-safe.
 *
 * FINDING (Med, it.fails): /api/match performs NO structural validation of the
 * $member-match Parameters body in dev-mock mode — a garbage body yields a 200
 * with a default member identity instead of a 400. src/app/api/match/route.ts
 * short-circuits on devMockEnabled() before the `!parameters` check. Fix rec:
 * validate the Parameters resource shape ahead of the mock branch.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
import {
  makeRequest,
  sessionState,
  resetSessionState,
  resetRouteEnv,
  expectPhiSafeError,
} from '../api/_helpers';

vi.mock('@/lib/server/smartSession', async () => (await import('../api/_helpers')).smartSessionMock());

import { POST as matchPOST } from '@/app/api/match/route';
import { POST as consentPOST } from '@/app/api/consent/provider-access/route';
import { POST as dtrPOST } from '@/app/api/dtr/evaluate/route';
import { POST as naPOST } from '@/app/api/network-adequacy/route';
import { POST as clearancePOST } from '@/app/api/financial-clearance/route';
import { POST as pasPOST } from '@/app/api/pas/submit/route';

beforeEach(() => {
  resetSessionState();
  resetRouteEnv();
  sessionState.authenticated = true;
  vi.clearAllMocks();
});

describe('Boundary validation — malformed bodies are rejected (400)', () => {
  it('consent: missing action → 400 PHI-safe', async () => {
    const res = await consentPOST(makeRequest('/api/consent/provider-access', { method: 'POST', body: { memberId: 'M1' } }));
    await expectPhiSafeError(res, 400);
  });

  it('consent: opt-out without recordedBy → 400 (attributed writes only)', async () => {
    const res = await consentPOST(makeRequest('/api/consent/provider-access', { method: 'POST', body: { memberId: 'M1', action: 'opt-out' } }));
    await expectPhiSafeError(res, 400);
  });

  it('dtr: missing cptCode → 400', async () => {
    const res = await dtrPOST(makeRequest('/api/dtr/evaluate', { method: 'POST', body: { patientId: 'PAT-0042' } }));
    expect(res.status).toBe(400);
  });

  it('network-adequacy: missing query → 400 PHI-safe', async () => {
    const res = await naPOST(makeRequest('/api/network-adequacy', { method: 'POST', body: {} }));
    await expectPhiSafeError(res, 400);
  });

  it('network-adequacy: oversized query (>500 chars) → 400 PHI-safe', async () => {
    const res = await naPOST(makeRequest('/api/network-adequacy', { method: 'POST', body: { query: 'x'.repeat(501) } }));
    await expectPhiSafeError(res, 400);
  });

  it('financial-clearance: patientId with invalid chars → 400 PHI-safe (never reaches FHIR)', async () => {
    const res = await clearancePOST(makeRequest('/api/financial-clearance', { method: 'POST', body: { patientId: '../../etc/passwd' } }));
    await expectPhiSafeError(res, 400);
  });

  it('financial-clearance: invalid orderCode → 400 PHI-safe', async () => {
    const res = await clearancePOST(makeRequest('/api/financial-clearance', { method: 'POST', body: { patientId: 'PAT-0042', orderCode: 'NOTACODE!' } }));
    await expectPhiSafeError(res, 400);
  });

  it('pas/submit: missing claimBundle → 400 PHI-safe', async () => {
    const res = await pasPOST(makeRequest('/api/pas/submit', { method: 'POST', body: { approvedBy: 'reviewer:1' } }));
    await expectPhiSafeError(res, 400);
  });
});

describe('FINDING — /api/match skips body validation in mock mode', () => {
  it.fails('SAFE would be: a malformed $member-match body is 400, not a 200 identity', async () => {
    const res = await matchPOST(makeRequest('/api/match', { method: 'POST', rawBody: 'not-json' }));
    // dev-mock returns a default member identity (200) → this assertion fails.
    expect(res.status).toBe(400);
  });
});
