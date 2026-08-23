/**
 * Route coverage (conventions §14): /api/dtr/evaluate and /api/dtr/package.
 *
 * Note: /api/dtr/evaluate enforces no session gate in source (it is reachable
 * pre-auth by design for the demo flow) - tested as it exists.
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

import { POST as evaluatePOST } from '@/app/api/dtr/evaluate/route';
import { GET as packageGET } from '@/app/api/dtr/package/route';

beforeEach(() => {
  resetSessionState();
  resetRouteEnv();
  vi.clearAllMocks();
});

describe('POST /api/dtr/evaluate', () => {
  it('400 with a PHI-safe body when cptCode is missing (validation)', async () => {
    const res = await evaluatePOST(
      makeRequest('/api/dtr/evaluate', { method: 'POST', body: { patientId: 'MARIA_SD_001' } })
    );
    const body = (await expectPhiSafeError(res, 400)) as { error: string };
    expect(body.error).toContain('cptCode');
  });

  it('400 with a PHI-safe body on a malformed JSON body', async () => {
    const res = await evaluatePOST(
      makeRequest('/api/dtr/evaluate', { method: 'POST', rawBody: '][' })
    );
    await expectPhiSafeError(res, 400);
  });

  it('200 returns the patient-aware policy evaluation (mock happy path)', async () => {
    const res = await evaluatePOST(
      makeRequest('/api/dtr/evaluate', {
        method: 'POST',
        body: { patientId: 'MARIA_SD_001', cptCode: '72148' },
      })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      policyTitle: string;
      groups: { status: string }[];
    };
    expect(body.policyTitle).toContain('72148');
    expect(body.groups.length).toBeGreaterThan(0);
  });

  it.skip('200 via the live Policy Engine - requires POLICY_ENGINE_URL service (backbone)', async () => {
    setDevMock(false);
    const res = await evaluatePOST(
      makeRequest('/api/dtr/evaluate', {
        method: 'POST',
        body: { patientId: 'MARIA_SD_001', cptCode: '72148' },
      })
    );
    expect(res.status).toBe(200);
  });
});

describe('GET /api/dtr/package', () => {
  it('401 with a PHI-safe body when unauthenticated', async () => {
    sessionState.authenticated = false;
    const res = await packageGET(makeRequest('/api/dtr/package?cptCode=72148'));
    await expectPhiSafeError(res, 401);
  });

  it('400 with a PHI-safe body when neither questionnaire nor cptCode is given', async () => {
    const res = await packageGET(makeRequest('/api/dtr/package'));
    const body = (await expectPhiSafeError(res, 400)) as { resourceType: string };
    expect(body.resourceType).toBe('OperationOutcome');
  });

  it('200 returns a questionnaire package for a CPT code (mock happy path)', async () => {
    const res = await packageGET(makeRequest('/api/dtr/package?cptCode=72148'));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as Record<string, unknown>;
    expect(body).toBeTruthy();
    expect(JSON.stringify(body).length).toBeGreaterThan(2);
  });

  it.skip('200 $questionnaire-package from fhir-service - requires the Docker FHIR backbone', async () => {
    setDevMock(false);
    const res = await packageGET(
      makeRequest('/api/dtr/package?questionnaire=http://example.org/Questionnaire/q1')
    );
    expect(res.status).toBe(200);
  });
});
