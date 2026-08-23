/**
 * Route coverage (conventions §14): /api/match ($member-match),
 * /api/bulk/start, /api/bulk/status - Provider Access + Payer-to-Payer slices.
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

import { POST as matchPOST } from '@/app/api/match/route';
import { POST as bulkStartPOST } from '@/app/api/bulk/start/route';
import { GET as bulkStatusGET } from '@/app/api/bulk/status/route';

function memberMatchParameters(pid: string): unknown {
  return {
    resourceType: 'Parameters',
    parameter: [
      { name: 'MemberPatient', resource: { resourceType: 'Patient', id: pid } },
    ],
  };
}

beforeEach(() => {
  resetSessionState();
  resetRouteEnv();
  vi.clearAllMocks();
});

describe('POST /api/match', () => {
  it('401 with a PHI-safe body when unauthenticated', async () => {
    sessionState.authenticated = false;
    const res = await matchPOST(
      makeRequest('/api/match', { method: 'POST', body: memberMatchParameters('PAT-0042') })
    );
    await expectPhiSafeError(res, 401);
  });

  it('400 with a PHI-safe body when the Parameters body is malformed (live mode)', async () => {
    setDevMock(false);
    const res = await matchPOST(
      makeRequest('/api/match', { method: 'POST', rawBody: 'not-json' })
    );
    const body = (await expectPhiSafeError(res, 400)) as { resourceType: string };
    expect(body.resourceType).toBe('OperationOutcome');
  });

  it('200 returns the matched member identity for the requested patient (mock happy path)', async () => {
    const res = await matchPOST(
      makeRequest('/api/match', { method: 'POST', body: memberMatchParameters('PAT-0042') })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      resourceType: string;
      parameter: { resource: { id: string } }[];
    };
    expect(body.resourceType).toBe('Parameters');
    expect(body.parameter[0].resource.id).toBe('PAT-0042');
  });
});

describe('POST /api/bulk/start', () => {
  it('401 with a PHI-safe body when unauthenticated', async () => {
    sessionState.authenticated = false;
    const res = await bulkStartPOST(
      makeRequest('/api/bulk/start', { method: 'POST', body: { priorPayer: 'Aetna' } })
    );
    await expectPhiSafeError(res, 401);
  });

  it('400 with a PHI-safe body when priorPayer is missing (validation)', async () => {
    const res = await bulkStartPOST(
      makeRequest('/api/bulk/start', { method: 'POST', body: { patientId: 'MARIA_SD_001' } })
    );
    const body = (await expectPhiSafeError(res, 400)) as { resourceType: string };
    expect(body.resourceType).toBe('OperationOutcome');
  });

  it('400 with a PHI-safe body on a malformed JSON body', async () => {
    const res = await bulkStartPOST(
      makeRequest('/api/bulk/start', { method: 'POST', rawBody: '{{' })
    );
    await expectPhiSafeError(res, 400);
  });

  it('202 accepted with a jobId and correlation id (mock happy path)', async () => {
    const res = await bulkStartPOST(
      makeRequest('/api/bulk/start', {
        method: 'POST',
        body: { priorPayer: 'Aetna Better Health', patientId: 'MARIA_SD_001' },
        headers: { 'x-correlation-id': 'cid-bulk-1' },
      })
    );
    expect(res.status).toBe(202);
    const body = (await readJson(res)) as {
      jobId: string;
      patientId: string;
      correlationId: string;
    };
    expect(body.jobId).toBeTruthy();
    expect(body.patientId).toBe('MARIA_SD_001');
    expect(body.correlationId).toBe('cid-bulk-1');
  });
});

describe('GET /api/bulk/status', () => {
  it('401 with a PHI-safe body when unauthenticated', async () => {
    sessionState.authenticated = false;
    const res = await bulkStatusGET(makeRequest('/api/bulk/status?jobId=j1'));
    await expectPhiSafeError(res, 401);
  });

  it('400 with a PHI-safe body when jobId is missing (validation)', async () => {
    const res = await bulkStatusGET(makeRequest('/api/bulk/status'));
    const body = (await expectPhiSafeError(res, 400)) as { resourceType: string };
    expect(body.resourceType).toBe('OperationOutcome');
  });

  it('200 returns per-patient export status with PA history (mock happy path)', async () => {
    const res = await bulkStatusGET(
      makeRequest('/api/bulk/status?jobId=dev-p2p-job-001&patientId=PAT-0087')
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      paHistory: { service: string; decision: string }[];
      resourceCounts: Record<string, number>;
      coveragePeriod: { start: string };
    };
    expect(body.paHistory.length).toBeGreaterThan(0);
    expect(body.resourceCounts.ExplanationOfBenefit).toBeGreaterThan(0);
    expect(body.coveragePeriod.start).toBeTruthy();
  });

  it.skip('200 live export polling - requires the bulk gateway (Ballerina backbone)', async () => {
    setDevMock(false);
    const res = await bulkStatusGET(makeRequest('/api/bulk/status?jobId=live-job'));
    expect(res.status).toBe(200);
  });
});
