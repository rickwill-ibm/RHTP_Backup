/**
 * SECURITY LENS — Attack class 4: input validation at boundaries.
 *
 * Asserts routes reject malformed bodies with 400 BEFORE the value reaches a
 * store/FHIR/engine call (parse-don't-validate, conventions §5). Every reject
 * body is PHI-safe.
 *
 * FIXED (was Med, it.fails): /api/match now validates the $member-match Parameters
 * resource shape AND requires a MemberPatient selector BEFORE the dev-mock/consent/
 * engine branches — a malformed or selector-less body is a PHI-safe 400 instead of a
 * 200 with a default member identity. The sibling /api/bulk/status (mock mode) now
 * likewise requires a well-formed patientId rather than defaulting to a seed member's
 * full PHI export. The former it.fails is now a positive assertion of the fixed behavior.
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
import { GET as bulkStatusGET } from '@/app/api/bulk/status/route';

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

describe('/api/match — body validation in mock mode (fixed)', () => {
  it('a malformed $member-match body is a 400, not a 200 default identity', async () => {
    const res = await matchPOST(makeRequest('/api/match', { method: 'POST', rawBody: 'not-json' }));
    await expectPhiSafeError(res, 400);
  });

  it('a well-formed but MemberPatient-less Parameters body is a 400 (no default-identity leak, no consent skip)', async () => {
    const res = await matchPOST(
      makeRequest('/api/match', { method: 'POST', body: { resourceType: 'Parameters', parameter: [] } })
    );
    await expectPhiSafeError(res, 400);
  });

  it('a valid $member-match body still returns the matched identity (200)', async () => {
    const res = await matchPOST(
      makeRequest('/api/match', {
        method: 'POST',
        body: { resourceType: 'Parameters', parameter: [{ name: 'MemberPatient', resource: { resourceType: 'Patient', id: 'PAT-0042' } }] },
      })
    );
    expect(res.status).toBe(200);
  });

  it('a well-formed but UNREGISTERED member id is a 404, not a 200 defaulted to the seed member', async () => {
    // closes the default-to-seed class: unknown id must not return devMemberMatch's ?? MARIA_SD_001 identity
    const res = await matchPOST(
      makeRequest('/api/match', {
        method: 'POST',
        body: { resourceType: 'Parameters', parameter: [{ name: 'MemberPatient', resource: { resourceType: 'Patient', id: 'ZZZZ-UNKNOWN-9' } }] },
      })
    );
    await expectPhiSafeError(res, 404);
  });
});

describe('/api/bulk/status — member-scoped export requires an explicit patientId (mock mode)', () => {
  it('a missing patientId is a 400, not a default member’s full PHI export', async () => {
    const res = await bulkStatusGET(makeRequest('/api/bulk/status?jobId=dev-p2p-job-001'));
    await expectPhiSafeError(res, 400);
  });

  it('an injection-shaped patientId is a 400 (never reaches the mock lookup)', async () => {
    const res = await bulkStatusGET(
      makeRequest('/api/bulk/status?jobId=dev-p2p-job-001&patientId=' + encodeURIComponent('../../etc/passwd'))
    );
    await expectPhiSafeError(res, 400);
  });

  it('a well-formed patientId still returns the member-scoped status (200)', async () => {
    const res = await bulkStatusGET(makeRequest('/api/bulk/status?jobId=dev-p2p-job-001&patientId=PAT-0087'));
    expect(res.status).toBe(200);
  });

  it('a well-formed but UNREGISTERED patientId is a 404, not the seed member’s full export', async () => {
    const res = await bulkStatusGET(makeRequest('/api/bulk/status?jobId=dev-p2p-job-001&patientId=ZZZZ-UNKNOWN-9'));
    await expectPhiSafeError(res, 404);
  });
});
