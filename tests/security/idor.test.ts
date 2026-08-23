/**
 * SECURITY LENS — Attack class 5: IDOR (cross-member access).
 *
 * The session carries a launch/patient context (getSessionPatient). These tests
 * authenticate a session scoped to MARIA_SD_001 and then request a DIFFERENT
 * member's data (PAT-0042 / PAT-0103). SAFE behavior is that the read is scoped
 * to (or checked against) the session patient.
 *
 * STATUS (Iteration 3 — closed):
 *  - FIXED (wave C): /api/fhir/[...path] Patient identity read is scoped to the
 *    session principal — a session scoped to member A that requests member B's
 *    Patient demographics gets a PHI-safe 403 (break-glass excepted, audited).
 *  - FIXED (Iteration 3): /api/evidence/[id] and /api/financial-clearance now use
 *    the session-principal role model (src/lib/authz/principal). The MEMBER-scoped
 *    session modeled below (fhirUser 'Patient/<id>') is self-only, so a cross-
 *    member read is a PHI-safe 403 — the request-supplied id is no longer trusted
 *    over the session, and the hardcoded role:'pa-reviewer' is gone. A REVIEWER
 *    session (fhirUser 'Practitioner/...') keeps its legitimate cross-member ops
 *    reads (asserted in principal-authz.test.ts and the routes-* contract tests).
 *    The two former it.fails are now positive assertions of the fixed behavior.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
import {
  makeRequest,
  routeParams,
  readJson,
  sessionState,
  resetSessionState,
  resetRouteEnv,
} from '../api/_helpers';

vi.mock('@/lib/server/smartSession', async () => (await import('../api/_helpers')).smartSessionMock());

import { GET as fhirGET } from '@/app/api/fhir/[...path]/route';
import { GET as evidenceGET } from '@/app/api/evidence/[id]/route';
import { POST as clearancePOST } from '@/app/api/financial-clearance/route';

const SESSION_MEMBER = 'MARIA_SD_001';
const OTHER_MEMBER = 'PAT-0042';

beforeEach(() => {
  resetSessionState();
  resetRouteEnv();
  sessionState.authenticated = true;
  sessionState.patient = SESSION_MEMBER; // caller is scoped to Maria
  sessionState.fhirUser = `Patient/${SESSION_MEMBER}`; // a MEMBER-scoped session (self-only)
  vi.clearAllMocks();
});

describe('IDOR — a session scoped to member A must not read member B', () => {
  it('FIXED: fhir Patient read for another member is 403, not the other member', async () => {
    const res = await fhirGET(
      makeRequest(`/api/fhir/Patient?subject=Patient/${OTHER_MEMBER}`),
      routeParams({ path: ['Patient'] })
    );
    expect(res.status, 'cross-member Patient read must be forbidden').toBe(403);
    const body = (await readJson(res)) as { id?: string; resourceType?: string };
    expect(body.id, 'must not return another member id').not.toBe(OTHER_MEMBER);
    expect(body.resourceType).toBe('OperationOutcome');
  });

  it('FIXED: evidence read for another member is 403 and returns no member record', async () => {
    const id = `ev-${OTHER_MEMBER}-75561-1715782920000`;
    const res = await evidenceGET(makeRequest(`/api/evidence/${id}`), routeParams({ id }));
    expect(res.status, 'cross-member evidence read must be forbidden').toBe(403);
    const body = (await readJson(res)) as { memberId?: string; resourceType?: string };
    expect(body.memberId, 'must not return another member record').not.toBe(OTHER_MEMBER);
    expect(body.resourceType).toBe('OperationOutcome');
  });

  it('FIXED: financial-clearance rejects a body patientId outside session scope', async () => {
    const res = await clearancePOST(
      makeRequest('/api/financial-clearance', { method: 'POST', body: { patientId: OTHER_MEMBER } })
    );
    // A member-scoped session gets 403 — never PAT-0042's clearance.
    expect(res.status, 'cross-member clearance should be forbidden').toBe(403);
    const body = (await readJson(res)) as { resourceType?: string };
    expect(body.resourceType).toBe('OperationOutcome');
  });
});
