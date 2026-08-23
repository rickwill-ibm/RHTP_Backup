/**
 * SECURITY LENS — Iteration 1 wave C: the two cycle-3 HIGH read-path fixes.
 *
 * This file asserts the FIXED behavior end to end and, in particular, that a
 * break-glass override of the Provider Access opt-out is AUDITED (the audit sink
 * is spied here so we can assert the emergency-access event is recorded, not just
 * that the read succeeds).
 *
 * Covered:
 *  1. Consent-read bypass (fhir passthrough + evidence read): an opted-out member
 *     gets a PHI-safe 403; a break-glass request succeeds AND emits an audited
 *     break-glass event.
 *  2. IDOR (fhir Patient identity read): a session scoped to member A that
 *     requests member B's Patient demographics gets a PHI-safe 403.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

// Spy the audit sink so we can assert the break-glass override is recorded.
interface AuditArg {
  action?: string;
  outcome?: string;
}
const auditSpy = vi.fn(async (_event: AuditArg): Promise<void> => undefined);
vi.mock('@/lib/server/audit', () => ({
  audit: (event: AuditArg) => auditSpy(event),
  redactPhi: (x: unknown) => x,
  assertPhiSafe: () => undefined,
}));

import { GET as fhirGET } from '@/app/api/fhir/[...path]/route';
import { GET as evidenceGET } from '@/app/api/evidence/[id]/route';
import { getProviderAccessConsentStore } from '@/lib/consent/providerAccessOptOut';

const OPTED_OUT = 'SEC-WC-OPTOUT';

beforeEach(() => {
  resetSessionState();
  resetRouteEnv();
  auditSpy.mockClear();
  // Fresh opt-out each test; scope the session to the member so IDOR does not fire.
  getProviderAccessConsentStore().revokeOptOut(OPTED_OUT, 'test-cleanup');
});

function lastAuditAction(): string | undefined {
  const calls = auditSpy.mock.calls;
  if (calls.length === 0) return undefined;
  return calls[calls.length - 1][0]?.action;
}

describe('wave C — consent-read bypass fixed on the FHIR passthrough', () => {
  it('403 PHI-safe when an opted-out member is read', async () => {
    sessionState.patient = OPTED_OUT;
    getProviderAccessConsentStore().optOut(OPTED_OUT, `member:${OPTED_OUT}`);
    const res = await fhirGET(
      makeRequest(`/api/fhir/Patient?subject=Patient/${OPTED_OUT}`),
      routeParams({ path: ['Patient'] })
    );
    await expectPhiSafeError(res, 403);
    expect(lastAuditAction()).toBe('fhir.read.consent-denied');
  });

  it('break-glass overrides the opt-out AND is audited as break-glass', async () => {
    sessionState.patient = OPTED_OUT;
    getProviderAccessConsentStore().optOut(OPTED_OUT, `member:${OPTED_OUT}`);
    const res = await fhirGET(
      makeRequest(`/api/fhir/Patient?subject=Patient/${OPTED_OUT}`, {
        headers: { 'x-break-glass': 'true' },
      }),
      routeParams({ path: ['Patient'] })
    );
    expect(res.status).toBe(200);
    const auditedBreakGlass = auditSpy.mock.calls.some(
      (c) => c[0]?.action === 'fhir.read.break-glass'
    );
    expect(auditedBreakGlass, 'break-glass access must be audited').toBe(true);
  });
});

describe('wave C — consent-read bypass fixed on the Evidence read', () => {
  const evId = `ev-${OPTED_OUT}-72148-1715782920000`;

  it('403 PHI-safe when an opted-out member record is read', async () => {
    getProviderAccessConsentStore().optOut(OPTED_OUT, `member:${OPTED_OUT}`);
    const res = await evidenceGET(makeRequest(`/api/evidence/${evId}`), routeParams({ id: evId }));
    await expectPhiSafeError(res, 403);
    expect(lastAuditAction()).toBe('evidence.read.consent-denied');
  });

  it('break-glass overrides the opt-out AND is audited as break-glass', async () => {
    getProviderAccessConsentStore().optOut(OPTED_OUT, `member:${OPTED_OUT}`);
    const res = await evidenceGET(
      makeRequest(`/api/evidence/${evId}`, { headers: { 'x-break-glass': 'true' } }),
      routeParams({ id: evId })
    );
    expect(res.status).toBe(200);
    const auditedBreakGlass = auditSpy.mock.calls.some(
      (c) => c[0]?.action === 'evidence.read.break-glass'
    );
    expect(auditedBreakGlass, 'break-glass access must be audited').toBe(true);
  });
});

describe('wave C — IDOR fixed on the FHIR Patient identity read', () => {
  it('403 PHI-safe when a session scoped to member A requests member B demographics', async () => {
    sessionState.patient = 'MARIA_SD_001';
    const res = await fhirGET(
      makeRequest('/api/fhir/Patient?subject=Patient/PAT-0042'),
      routeParams({ path: ['Patient'] })
    );
    const body = (await expectPhiSafeError(res, 403)) as { id?: string };
    expect(lastAuditAction()).toBe('fhir.read.idor-denied');
    expect(body.id).not.toBe('PAT-0042');
  });

  it('200 when the session reads its own member demographics (scope match)', async () => {
    sessionState.patient = 'MARIA_SD_001';
    const res = await fhirGET(
      makeRequest('/api/fhir/Patient?subject=Patient/MARIA_SD_001'),
      routeParams({ path: ['Patient'] })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { id?: string; resourceType?: string };
    expect(body.resourceType).toBe('Patient');
    expect(body.id).toBe('MARIA_SD_001');
  });
});
