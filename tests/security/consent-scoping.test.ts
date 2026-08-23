/**
 * SECURITY LENS — Attack class 2: Consent / 42 CFR Part 2 scoping (highest value).
 *
 * CMS-0057-F: a member who has opted out of Provider Access must not have their
 * data released to a requesting provider, regardless of treatment relationship,
 * except for audited break-glass.
 *
 * SAFE behavior now enforced on /api/match, /api/fhir/[...path], and
 * /api/evidence/[id] (the consent gate was extended to both read routes in
 * Iteration 1 wave C): each consults the Provider Access opt-out store before
 * releasing member PHI, and 403s an opted-out member, break-glass excepted.
 *
 * The two HIGH consent-bypass findings from cycle 3 are now FIXED; the former
 * it.fails records are converted to positive assertions of the fixed behavior
 * below (plus break-glass override cases).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { vi } from 'vitest';
import {
  makeRequest,
  routeParams,
  readJson,
  sessionState,
  resetSessionState,
  resetRouteEnv,
  expectPhiSafeError,
} from '../api/_helpers';

vi.mock('@/lib/server/smartSession', async () => (await import('../api/_helpers')).smartSessionMock());

import { POST as matchPOST } from '@/app/api/match/route';
import { GET as fhirGET } from '@/app/api/fhir/[...path]/route';
import { GET as evidenceGET } from '@/app/api/evidence/[id]/route';
import { getProviderAccessConsentStore } from '@/lib/consent/providerAccessOptOut';

function matchParams(pid: string): unknown {
  return { resourceType: 'Parameters', parameter: [{ name: 'MemberPatient', resource: { resourceType: 'Patient', id: pid } }] };
}

const OPTED_OUT = ['SEC-OPTOUT-1', 'SEC-OPTOUT-2', 'SEC-OPTOUT-3', 'PAT-0103'];

beforeEach(() => {
  resetSessionState();
  resetRouteEnv();
  vi.clearAllMocks();
});

afterEach(() => {
  // Reset consent state — the store is a module singleton shared across tests.
  for (const id of OPTED_OUT) getProviderAccessConsentStore().revokeOptOut(id, 'test-cleanup');
});

describe('CONSENT GATE — /api/match honors Provider Access opt-out (fixed this cycle)', () => {
  it('403 PHI-safe when the matched member has opted out', async () => {
    getProviderAccessConsentStore().optOut('SEC-OPTOUT-1', 'member:SEC-OPTOUT-1', 'portal');
    const res = await matchPOST(makeRequest('/api/match', { method: 'POST', body: matchParams('SEC-OPTOUT-1') }));
    await expectPhiSafeError(res, 403);
  });

  it('200 for a member with no opt-out record (identity released as designed)', async () => {
    const res = await matchPOST(makeRequest('/api/match', { method: 'POST', body: matchParams('PAT-0042') }));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { parameter: { resource: { id: string } }[] };
    expect(body.parameter[0].resource.id).toBe('PAT-0042');
  });

  it('200 with audited break-glass overrides an opt-out (emergency access)', async () => {
    getProviderAccessConsentStore().optOut('SEC-OPTOUT-2', 'member:SEC-OPTOUT-2');
    const res = await matchPOST(
      makeRequest('/api/match', { method: 'POST', body: matchParams('SEC-OPTOUT-2'), headers: { 'x-break-glass': 'true' } })
    );
    expect(res.status).toBe(200);
  });
});

describe('CONSENT GATE — FHIR passthrough honors Provider Access opt-out (fixed wave C)', () => {
  // Session is scoped to the opted-out member so the consent gate (not the IDOR
  // gate) is the reason for the 403.
  it('403 PHI-safe when /api/fhir Patient read targets an opted-out member', async () => {
    sessionState.patient = 'PAT-0103';
    getProviderAccessConsentStore().optOut('PAT-0103', 'member:PAT-0103');
    const res = await fhirGET(
      makeRequest('/api/fhir/Patient?subject=Patient/PAT-0103'),
      routeParams({ path: ['Patient'] })
    );
    await expectPhiSafeError(res, 403);
  });

  it('200 with audited break-glass overrides an opt-out on the FHIR Patient read', async () => {
    sessionState.patient = 'PAT-0103';
    getProviderAccessConsentStore().optOut('PAT-0103', 'member:PAT-0103');
    const res = await fhirGET(
      makeRequest('/api/fhir/Patient?subject=Patient/PAT-0103', {
        headers: { 'x-break-glass': 'true' },
      }),
      routeParams({ path: ['Patient'] })
    );
    expect(res.status).toBe(200);
  });
});

describe('CONSENT GATE — Evidence read honors Provider Access opt-out (fixed wave C)', () => {
  it('403 PHI-safe when /api/evidence targets an opted-out member', async () => {
    getProviderAccessConsentStore().optOut('SEC-OPTOUT-3', 'member:SEC-OPTOUT-3');
    const id = 'ev-SEC-OPTOUT-3-72148-1715782920000';
    const res = await evidenceGET(makeRequest(`/api/evidence/${id}`), routeParams({ id }));
    await expectPhiSafeError(res, 403);
  });

  it('200 with audited break-glass overrides an opt-out on the Evidence read', async () => {
    getProviderAccessConsentStore().optOut('SEC-OPTOUT-3', 'member:SEC-OPTOUT-3');
    const id = 'ev-SEC-OPTOUT-3-72148-1715782920000';
    const res = await evidenceGET(
      makeRequest(`/api/evidence/${id}`, { headers: { 'x-break-glass': 'true' } }),
      routeParams({ id })
    );
    expect(res.status).toBe(200);
  });
});
