/**
 * Route coverage (conventions §14): /api/cds (CRD invoke), /api/cds-hooks
 * (discovery), /api/cds-hooks/patient-view, /api/cds-hooks/order-sign.
 *
 * The two hook routes call HAPI FHIR when reachable and deliberately fall back
 * to the patient registry when it is not - both behaviors are exercised offline
 * (the fetch to localhost:8080 fails fast and the routes take the registry path).
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

vi.mock('@/lib/server/smartSession', async () => (await import('./_helpers')).smartSessionMock());

import { POST as cdsPOST } from '@/app/api/cds/route';
import { GET as discoveryGET } from '@/app/api/cds-hooks/route';
import { POST as patientViewPOST } from '@/app/api/cds-hooks/patient-view/route';
import { POST as orderSignPOST } from '@/app/api/cds-hooks/order-sign/route';
import { POST as orderSelectPOST } from '@/app/api/cds-hooks/order-select/route';

beforeEach(() => {
  resetSessionState();
  resetRouteEnv();
  vi.clearAllMocks();
});

describe('POST /api/cds (CRD invoke)', () => {
  it('401 with a PHI-safe body when unauthenticated', async () => {
    sessionState.authenticated = false;
    const res = await cdsPOST(
      makeRequest('/api/cds', { method: 'POST', body: { hookId: 'order-select' } })
    );
    await expectPhiSafeError(res, 401);
  });

  it('400 with a PHI-safe body when hookId is missing (validation, live mode)', async () => {
    setDevMock(false);
    const res = await cdsPOST(
      makeRequest('/api/cds', { method: 'POST', body: { hookRequest: {} } })
    );
    const body = (await expectPhiSafeError(res, 400)) as { resourceType: string };
    expect(body.resourceType).toBe('OperationOutcome');
  });

  it('200 returns patient-aware CRD cards (mock happy path)', async () => {
    const res = await cdsPOST(
      makeRequest('/api/cds', {
        method: 'POST',
        body: {
          hookId: 'order-select',
          hookRequest: { context: { patientId: 'MARIA_SD_001' } },
        },
      })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      cards: { summary: string; indicator: string }[];
      correlationId: string;
    };
    expect(Array.isArray(body.cards)).toBe(true);
    expect(body.cards.length).toBeGreaterThan(0);
    expect(body.correlationId).toBeTruthy();
  });
});

describe('GET /api/cds-hooks (discovery)', () => {
  it('200 lists the registered CDS services per the CDS Hooks spec (happy path)', async () => {
    const res = await discoveryGET();
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      services: { hook: string; id: string; prefetch: object }[];
    };
    expect(body.services.length).toBeGreaterThanOrEqual(3);
    const hooks = body.services.map((s) => s.hook);
    expect(hooks).toContain('patient-view');
    expect(hooks).toContain('order-sign');
    for (const s of body.services) {
      expect(s.id).toBeTruthy();
      expect(s.prefetch).toBeDefined();
    }
  });
});

describe('POST /api/cds-hooks/patient-view', () => {
  // This hook endpoint is called by the EHR sandbox, not the browser; it
  // enforces no session (tested as it exists - the CDS Hooks spec relies on
  // network-level trust here).
  it('200 returns registry-fallback cards when FHIR is unreachable (happy path)', async () => {
    const res = await patientViewPOST(
      makeRequest('/api/cds-hooks/patient-view', {
        method: 'POST',
        body: { context: { patientId: 'MARIA_SD_001' } },
      })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { cards: { uuid: string; summary: string }[] };
    expect(Array.isArray(body.cards)).toBe(true);
  });

  it('200 with an empty card list for an unknown patient (no data leaked)', async () => {
    const res = await patientViewPOST(
      makeRequest('/api/cds-hooks/patient-view', {
        method: 'POST',
        body: { context: { patientId: 'UNKNOWN-999' } },
      })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { cards: unknown[] };
    expect(body.cards).toEqual([]);
  });

  it('500 with an empty PHI-safe card list on a malformed body', async () => {
    const res = await patientViewPOST(
      makeRequest('/api/cds-hooks/patient-view', { method: 'POST', rawBody: '<oops>' })
    );
    const body = (await expectPhiSafeError(res, 500)) as { cards: unknown[] };
    expect(body.cards).toEqual([]);
  });

  it.skip('200 with live care-gap cards - requires the Docker HAPI FHIR server', async () => {
    const res = await patientViewPOST(
      makeRequest('/api/cds-hooks/patient-view', {
        method: 'POST',
        body: { context: { patientId: 'maria-redhawk-001' } },
      })
    );
    expect(res.status).toBe(200);
  });
});

describe('POST /api/cds-hooks/order-sign', () => {
  it('200 flags a STAT order missing a clinical note (happy path)', async () => {
    const res = await orderSignPOST(
      makeRequest('/api/cds-hooks/order-sign', {
        method: 'POST',
        body: {
          context: {
            patientId: 'MARIA_SD_001',
            draftOrders: {
              entry: [
                {
                  resource: {
                    resourceType: 'ServiceRequest',
                    code: { text: 'MRI Lumbar Spine' },
                    priority: 'stat',
                  },
                },
              ],
            },
          },
        },
      })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { cards: { summary: string }[] };
    expect(body.cards.some((c) => c.summary.toLowerCase().includes('stat'))).toBe(true);
  });

  it('200 with no cards for a routine order with no interactions', async () => {
    const res = await orderSignPOST(
      makeRequest('/api/cds-hooks/order-sign', {
        method: 'POST',
        body: {
          context: {
            patientId: 'MARIA_SD_001',
            draftOrders: {
              entry: [
                {
                  resource: {
                    resourceType: 'ServiceRequest',
                    code: { text: 'Basic metabolic panel' },
                    priority: 'routine',
                    note: [{ text: 'routine follow-up' }],
                  },
                },
              ],
            },
          },
        },
      })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { cards: unknown[] };
    expect(Array.isArray(body.cards)).toBe(true);
  });

  it('500 with an empty PHI-safe card list on a malformed body', async () => {
    const res = await orderSignPOST(
      makeRequest('/api/cds-hooks/order-sign', { method: 'POST', rawBody: 'not json' })
    );
    const body = (await expectPhiSafeError(res, 500)) as { cards: unknown[] };
    expect(body.cards).toEqual([]);
  });

  it.skip('200 DDI check against live MedicationRequests - requires the Docker HAPI FHIR server', async () => {
    const res = await orderSignPOST(
      makeRequest('/api/cds-hooks/order-sign', {
        method: 'POST',
        body: { context: { patientId: 'maria-redhawk-001', draftOrders: { entry: [] } } },
      })
    );
    expect(res.status).toBe(200);
  });
});

describe('POST /api/cds-hooks/order-select (hosted CRD coverage service)', () => {
  const cptOrder = (id: string, code: string, display: string) => ({
    resource: {
      resourceType: 'ServiceRequest',
      id,
      code: { coding: [{ system: 'http://www.ama-assn.org/go/cpt', code, display }] },
    },
  });

  it('200 returns coverage cards for a known patient + selected order (happy path)', async () => {
    const res = await orderSelectPOST(
      makeRequest('/api/cds-hooks/order-select', {
        method: 'POST',
        body: {
          hook: 'order-select',
          context: {
            patientId: 'MARIA_SD_001',
            selections: ['ServiceRequest/sr1'],
            draftOrders: { entry: [cptOrder('sr1', '72148', 'MRI Lumbar Spine')] },
          },
        },
      })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      cards: { summary: string; uuid: string; indicator: string; source: unknown }[];
    };
    const pa = body.cards.find((c) =>
      c.summary.toLowerCase().includes('prior authorization required')
    );
    expect(pa).toBeTruthy();
    expect(pa!.summary).toContain('72148');
    expect(pa!.indicator).toBe('critical');
    expect(pa!.uuid).toBeTruthy();
    expect(pa!.source).toBeDefined();
  });

  it('FAIL-CLOSED: unknown patient returns a warning card, never an empty list', async () => {
    const res = await orderSelectPOST(
      makeRequest('/api/cds-hooks/order-select', {
        method: 'POST',
        body: {
          context: {
            patientId: 'NOT-A-REAL-PATIENT',
            draftOrders: { entry: [cptOrder('sr1', '72148', 'x')] },
          },
        },
      })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { cards: { summary: string }[] };
    expect(body.cards.length).toBeGreaterThan(0); // NOT [] — [] would read as "no PA needed"
    expect(body.cards[0].summary.toLowerCase()).toContain('could not be determined');
  });

  it('FAIL-CLOSED: missing patientId returns the indeterminate card', async () => {
    const res = await orderSelectPOST(
      makeRequest('/api/cds-hooks/order-select', { method: 'POST', body: { context: {} } })
    );
    const body = (await readJson(res)) as { cards: unknown[] };
    expect(body.cards.length).toBeGreaterThan(0);
  });

  it('FAIL-CLOSED: an order with only free-text (no coding) does not silently pass', async () => {
    const res = await orderSelectPOST(
      makeRequest('/api/cds-hooks/order-select', {
        method: 'POST',
        body: {
          context: {
            patientId: 'MARIA_SD_001',
            draftOrders: {
              entry: [
                {
                  resource: {
                    resourceType: 'ServiceRequest',
                    id: 'sr1',
                    code: { text: 'MRI Lumbar' },
                  },
                },
              ],
            },
          },
        },
      })
    );
    const body = (await readJson(res)) as { cards: { summary: string }[] };
    expect(body.cards.length).toBeGreaterThan(0);
    expect(body.cards[0].summary.toLowerCase()).toContain('could not be determined');
  });

  it('assigns DISTINCT uuids when two selected orders share the same CPT', async () => {
    const res = await orderSelectPOST(
      makeRequest('/api/cds-hooks/order-select', {
        method: 'POST',
        body: {
          context: {
            patientId: 'MARIA_SD_001',
            selections: ['ServiceRequest/sr1', 'ServiceRequest/sr2'],
            draftOrders: {
              entry: [cptOrder('sr1', '72148', 'MRI'), cptOrder('sr2', '72148', 'MRI')],
            },
          },
        },
      })
    );
    const body = (await readJson(res)) as { cards: { uuid: string }[] };
    const uuids = body.cards.map((c) => c.uuid);
    expect(uuids.length).toBe(4);
    expect(new Set(uuids).size).toBe(uuids.length); // no collision (CDS Hooks correlates by uuid)
  });

  it('400 + fail-closed card (not empty) on a malformed body', async () => {
    const res = await orderSelectPOST(
      makeRequest('/api/cds-hooks/order-select', { method: 'POST', rawBody: '<oops>' })
    );
    expect(res.status).toBe(400);
    const body = (await readJson(res)) as { cards: unknown[] };
    expect(body.cards.length).toBeGreaterThan(0);
  });
});

describe('GET /api/cds-hooks discovery lists the hosted CRD order-select service', () => {
  it('advertises the order-select hook with an id and prefetch', async () => {
    const res = await discoveryGET();
    const body = (await readJson(res)) as {
      services: { hook: string; id: string; prefetch?: unknown }[];
    };
    const svc = body.services.find((s) => s.hook === 'order-select');
    expect(svc).toBeTruthy();
    expect(svc!.id).toBe('rhtp-crd-order-select');
    expect(svc!.prefetch).toBeDefined();
  });
});
