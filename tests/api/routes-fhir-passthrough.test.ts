/**
 * Route coverage (conventions §14): /api/fhir/[...path] - the BFF FHIR passthrough.
 *
 * Mock mode (ALLOW_DEV_MOCK_AUTH default) serves per-patient registry data so
 * GET happy paths run offline; the live POST path needs the FHIR gateway.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
import {
  makeRequest,
  readJson,
  routeParams,
  sessionState,
  resetSessionState,
  resetRouteEnv,
  setDevMock,
  expectPhiSafeError,
} from './_helpers';

vi.mock('@/lib/server/smartSession', async () =>
  (await import('./_helpers')).smartSessionMock()
);

import { GET, POST } from '@/app/api/fhir/[...path]/route';

beforeEach(() => {
  resetSessionState();
  resetRouteEnv();
  vi.clearAllMocks();
});

describe('GET /api/fhir/[...path]', () => {
  it('401 with a PHI-safe OperationOutcome when unauthenticated', async () => {
    sessionState.authenticated = false;
    const res = await GET(
      makeRequest('/api/fhir/Patient?patient=MARIA_SD_001'),
      routeParams({ path: ['Patient'] })
    );
    const body = (await expectPhiSafeError(res, 401)) as { resourceType: string };
    expect(body.resourceType).toBe('OperationOutcome');
  });

  it('echoes the correlation id header on the 401 response', async () => {
    sessionState.authenticated = false;
    const res = await GET(
      makeRequest('/api/fhir/Patient', { headers: { 'x-correlation-id': 'cid-test-123' } }),
      routeParams({ path: ['Patient'] })
    );
    expect(res.status).toBe(401);
    expect(res.headers.get('x-correlation-id')).toBe('cid-test-123');
  });

  it('200 Patient read returns the requested patient resource (mock happy path)', async () => {
    const res = await GET(
      makeRequest('/api/fhir/Patient?patient=MARIA_SD_001'),
      routeParams({ path: ['Patient'] })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      resourceType: string;
      id: string;
      name: { family?: string }[];
    };
    expect(body.resourceType).toBe('Patient');
    expect(body.id).toBe('MARIA_SD_001');
    expect(body.name[0].family).toBeTruthy();
  });

  it('200 Condition search returns a Bundle scoped to the requested patient', async () => {
    const res = await GET(
      makeRequest('/api/fhir/Condition?patient=PAT-0042'),
      routeParams({ path: ['Condition'] })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      resourceType: string;
      type: string;
      total: number;
      entry: { resource: { subject: { reference: string } } }[];
    };
    expect(body.resourceType).toBe('Bundle');
    expect(body.type).toBe('searchset');
    expect(body.total).toBeGreaterThan(0);
    for (const e of body.entry) {
      expect(e.resource.subject.reference).toBe('Patient/PAT-0042');
    }
  });

  it('200 ClaimResponse search carries per-patient PA history with dispositions', async () => {
    const res = await GET(
      makeRequest('/api/fhir/ClaimResponse?patient=MARIA_SD_001'),
      routeParams({ path: ['ClaimResponse'] })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      resourceType: string;
      total: number;
      entry: { resource: { resourceType: string; patient: { reference: string } } }[];
    };
    expect(body.resourceType).toBe('Bundle');
    expect(body.total).toBeGreaterThan(0);
    expect(body.entry[0].resource.resourceType).toBe('ClaimResponse');
    expect(body.entry[0].resource.patient.reference).toBe('Patient/MARIA_SD_001');
  });

  it('200 with an empty Bundle for an unmapped resource type (mock fallback)', async () => {
    const res = await GET(
      makeRequest('/api/fhir/Appointment?patient=MARIA_SD_001'),
      routeParams({ path: ['Appointment'] })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { resourceType: string; total: number };
    expect(body.resourceType).toBe('Bundle');
    expect(body.total).toBe(0);
  });
});

describe('POST /api/fhir/[...path]', () => {
  it('401 with a PHI-safe body when unauthenticated', async () => {
    sessionState.authenticated = false;
    const res = await POST(
      makeRequest('/api/fhir/Observation', {
        method: 'POST',
        body: { resourceType: 'Observation' },
      }),
      routeParams({ path: ['Observation'] })
    );
    await expectPhiSafeError(res, 401);
  });

  it.skip('201 create against the live gateway - requires the Docker HAPI/APIM backbone', async () => {
    setDevMock(false);
    const res = await POST(
      makeRequest('/api/fhir/Observation', {
        method: 'POST',
        body: { resourceType: 'Observation', status: 'final' },
      }),
      routeParams({ path: ['Observation'] })
    );
    expect(res.status).toBe(201);
  });
});
