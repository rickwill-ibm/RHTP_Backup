/**
 * Route coverage (conventions §14): /api/financial-clearance - the hardened
 * Golden Thread orchestrator surface (flag + auth + authz + validation + audit).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
import {
  makeRequest,
  readJson,
  sessionState,
  resetSessionState,
  guardState,
  resetGuardState,
  resetRouteEnv,
  setDevMock,
  expectPhiSafeError,
} from './_helpers';

vi.mock('@/lib/server/smartSession', async () =>
  (await import('./_helpers')).smartSessionMock()
);
vi.mock('@/lib/authz/guard', async () => (await import('./_helpers')).guardMock());

import { POST } from '@/app/api/financial-clearance/route';

function post(body: unknown): ReturnType<typeof POST> {
  return POST(makeRequest('/api/financial-clearance', { method: 'POST', body }));
}

beforeEach(() => {
  resetSessionState();
  resetGuardState();
  resetRouteEnv();
  vi.clearAllMocks();
});

describe('POST /api/financial-clearance', () => {
  it('404 when the goldenThread feature flag is off (flag gate)', async () => {
    process.env.NEXT_PUBLIC_FLAG_GOLDEN_THREAD = 'false';
    const res = await post({ patientId: 'MARIA_SD_001' });
    await expectPhiSafeError(res, 404);
  });

  it('401 with a PHI-safe body when unauthenticated', async () => {
    sessionState.authenticated = false;
    const res = await post({ patientId: 'MARIA_SD_001' });
    await expectPhiSafeError(res, 401);
  });

  it('400 with a PHI-safe body for a patientId with invalid characters (validation)', async () => {
    const res = await post({ patientId: 'MARIA<script>' });
    const body = (await expectPhiSafeError(res, 400)) as { resourceType: string };
    expect(body.resourceType).toBe('OperationOutcome');
  });

  it('400 with a PHI-safe body for an invalid CPT/HCPCS orderCode (validation)', async () => {
    const res = await post({ patientId: 'MARIA_SD_001', orderCode: 'not-a-code' });
    await expectPhiSafeError(res, 400);
  });

  it('400 with a PHI-safe body for a malformed providerNpi (validation)', async () => {
    const res = await post({ patientId: 'MARIA_SD_001', providerNpi: '123' });
    await expectPhiSafeError(res, 400);
  });

  it('403 with a PHI-safe body when the authz guard denies (authz)', async () => {
    guardState.deny = true;
    const res = await post({ patientId: 'MARIA_SD_001' });
    const body = (await expectPhiSafeError(res, 403)) as { resourceType: string };
    expect(body.resourceType).toBe('OperationOutcome');
  });

  it('200 runs the clearance thread and returns the evidence summary (mock happy path)', async () => {
    const res = await post({ patientId: 'MARIA_SD_001' });
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      evidenceId: string;
      memberId: string;
      netRequiresPA: boolean;
      netOutcome: string;
      medicalNecessity: unknown;
      workItem: unknown;
    };
    expect(body.evidenceId).toMatch(/^ev-MARIA_SD_001-/);
    expect(body.memberId).toBe('MARIA_SD_001');
    expect(typeof body.netRequiresPA).toBe('boolean');
    expect(body.netOutcome).toBeTruthy();
    expect(body.medicalNecessity).toBeDefined();
  });

  it('200 clearance is patient-specific: a different member yields a different evidence id', async () => {
    const a = (await readJson(await post({ patientId: 'MARIA_SD_001' }))) as {
      evidenceId: string;
    };
    const b = (await readJson(await post({ patientId: 'PAT-0087' }))) as {
      evidenceId: string;
    };
    expect(b.evidenceId).toMatch(/^ev-PAT-0087-/);
    expect(a.evidenceId).not.toBe(b.evidenceId);
  });

  it.skip('422 for an order resolved to an invalid code from live FHIR - requires the Docker HAPI backbone (mock registry orders are always valid)', async () => {
    setDevMock(false);
    const res = await post({ patientId: 'MARIA_SD_001' });
    expect(res.status).toBe(422);
  });
});
