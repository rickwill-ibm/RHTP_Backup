/**
 * Route coverage (conventions §14): the value-set governance BFF (Iter 8a-iii,
 * Wave C). Proves role-gating, maker-checker AT THE ROUTE BOUNDARY, call-not-
 * duplicate (the route delegates to the governance backend port), and PHI-safe
 * bodies. Fail-closed (E9): unauth'd / wrong-role governance actions => 401/403.
 *
 *   POST /api/value-set-governance/submit   — STEWARD
 *   POST /api/value-set-governance/approve  — REVIEWER (maker-checker at boundary)
 *   POST /api/value-set-governance/reject   — STEWARD
 *   POST /api/value-set-governance/retire   — STEWARD
 *   POST /api/value-set-governance/replay   — STEWARD or REVIEWER
 *   GET  /api/value-set-governance/history  — STEWARD or REVIEWER
 *
 * Governance roles (value-set-steward, value-set-reviewer) are added to the
 * authz vocabulary by Wave A; here they are injected through the session's role
 * field exactly as the guard would surface them.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import os from 'os';
import path from 'path';

process.env.AUDIT_LOG_DIR = path.join(os.tmpdir(), 'rhtp-vsgov-audit');

// Controllable session: authenticated flag + acting identity (fhirUser) + role.
const session = {
  authenticated: true,
  fhirUser: 'Practitioner/steward-alice' as string | null,
  role: 'value-set-steward' as string | null,
};

vi.mock('@/lib/server/smartSession', () => ({
  isAuthenticated: vi.fn(async () => session.authenticated),
  getSessionAuthContext: vi.fn(async () =>
    session.authenticated
      ? { patient: null, fhirUser: session.fhirUser, scope: 'launch', role: session.role }
      : null,
  ),
}));

import { makeRequest, readJson, expectPhiSafeBody } from './_helpers';
import { POST as submitPOST } from '@/app/api/value-set-governance/submit/route';
import { POST as approvePOST } from '@/app/api/value-set-governance/approve/route';
import { POST as rejectPOST } from '@/app/api/value-set-governance/reject/route';
import { POST as retirePOST } from '@/app/api/value-set-governance/retire/route';
import { POST as replayPOST } from '@/app/api/value-set-governance/replay/route';
import { GET as historyGET } from '@/app/api/value-set-governance/history/route';
import { __resetGovernanceBackendForTest } from '@/app/api/value-set-governance/_lib/backendAdapter';

const P = '/api/value-set-governance';

/** Set the acting principal (identity + governance role) for the next call. */
function as(fhirUser: string, role: string | null): void {
  session.authenticated = true;
  session.fhirUser = fhirUser;
  session.role = role;
}

const STEWARD = 'Practitioner/steward-alice';
const REVIEWER = 'Practitioner/reviewer-bob';

beforeEach(() => {
  session.authenticated = true;
  session.fhirUser = STEWARD;
  session.role = 'value-set-steward';
  __resetGovernanceBackendForTest();
  vi.clearAllMocks();
});

// ── Authentication: fail-closed 401 (E9) ─────────────────────────────────────

describe('authentication (E9 fail-closed)', () => {
  it('401 (PHI-safe) when unauthenticated on submit', async () => {
    session.authenticated = false;
    const res = await submitPOST(
      makeRequest(`${P}/submit`, { method: 'POST', body: { valueSetId: 'vs-icd10', version: '1.0.0' } }),
    );
    expect(res.status).toBe(401);
    expectPhiSafeBody(await readJson(res), '401 body');
  });

  it('401 (PHI-safe) when unauthenticated on approve', async () => {
    session.authenticated = false;
    const res = await approvePOST(
      makeRequest(`${P}/approve`, { method: 'POST', body: { valueSetId: 'vs-icd10' } }),
    );
    expect(res.status).toBe(401);
    expectPhiSafeBody(await readJson(res), '401 body');
  });

  it('401 (PHI-safe) when unauthenticated on history', async () => {
    session.authenticated = false;
    const res = await historyGET(makeRequest(`${P}/history?valueSetId=vs-icd10`));
    expect(res.status).toBe(401);
    expectPhiSafeBody(await readJson(res), '401 body');
  });
});

// ── Role-gating (E9 fail-closed 403) ─────────────────────────────────────────

describe('role-gating', () => {
  it('200 steward submit', async () => {
    as(STEWARD, 'value-set-steward');
    const res = await submitPOST(
      makeRequest(`${P}/submit`, { method: 'POST', body: { valueSetId: 'vs-icd10', version: '1.0.0' } }),
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { state: string; submittedBy: string };
    expect(body.state).toBe('pending-approval');
    expect(body.submittedBy).toBe(STEWARD);
    expectPhiSafeBody(body, 'submit body');
  });

  it('403 (PHI-safe) when a steward tries to approve (wrong role)', async () => {
    // Seed a pending version from a different steward.
    as('Practitioner/steward-carol', 'value-set-steward');
    await submitPOST(
      makeRequest(`${P}/submit`, { method: 'POST', body: { valueSetId: 'vs-loinc', version: '2.0.0' } }),
    );
    // Now a steward (not a reviewer) attempts approve.
    as(STEWARD, 'value-set-steward');
    const res = await approvePOST(
      makeRequest(`${P}/approve`, { method: 'POST', body: { valueSetId: 'vs-loinc' } }),
    );
    expect(res.status).toBe(403);
    expectPhiSafeBody(await readJson(res), '403 body');
  });

  it('403 (PHI-safe) when a reviewer tries to submit (wrong role)', async () => {
    as(REVIEWER, 'value-set-reviewer');
    const res = await submitPOST(
      makeRequest(`${P}/submit`, { method: 'POST', body: { valueSetId: 'vs-icd10', version: '1.0.0' } }),
    );
    expect(res.status).toBe(403);
    expectPhiSafeBody(await readJson(res), '403 body');
  });

  it('403 (PHI-safe) when a principal holds neither governance role', async () => {
    as('Practitioner/pa-reviewer-x', 'pa-reviewer');
    const res = await historyGET(makeRequest(`${P}/history?valueSetId=vs-icd10`));
    expect(res.status).toBe(403);
    expectPhiSafeBody(await readJson(res), '403 body');
  });

  it('403 when a reviewer tries to retire (wrong role)', async () => {
    as(REVIEWER, 'value-set-reviewer');
    const res = await retirePOST(
      makeRequest(`${P}/retire`, { method: 'POST', body: { valueSetId: 'vs-icd10', version: '1.0.0' } }),
    );
    expect(res.status).toBe(403);
  });
});

// ── Maker-checker AT THE ROUTE BOUNDARY (brief §2, defense in depth) ──────────

describe('maker-checker at the route boundary', () => {
  it('403 (PHI-safe) self-approve: the submitter may not approve their own version', async () => {
    // Alice submits.
    as(STEWARD, 'value-set-steward');
    await submitPOST(
      makeRequest(`${P}/submit`, { method: 'POST', body: { valueSetId: 'vs-snomed', version: '3.1.0' } }),
    );
    // Same identity (Alice) now acts as a reviewer and tries to approve — blocked
    // at the route boundary BEFORE any backend state change.
    as(STEWARD, 'value-set-reviewer');
    const res = await approvePOST(
      makeRequest(`${P}/approve`, { method: 'POST', body: { valueSetId: 'vs-snomed' } }),
    );
    expect(res.status).toBe(403);
    const body = await readJson(res);
    expect(JSON.stringify(body)).toMatch(/maker-checker/i);
    expectPhiSafeBody(body, '403 maker-checker body');
  });

  it('200 reviewer approve when the approver is a different principal', async () => {
    // Alice (steward) submits.
    as(STEWARD, 'value-set-steward');
    await submitPOST(
      makeRequest(`${P}/submit`, { method: 'POST', body: { valueSetId: 'vs-cpt', version: '4.0.0' } }),
    );
    // Bob (reviewer) approves — maker != checker.
    as(REVIEWER, 'value-set-reviewer');
    const res = await approvePOST(
      makeRequest(`${P}/approve`, { method: 'POST', body: { valueSetId: 'vs-cpt' } }),
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { state: string; approvedBy: string };
    expect(body.state).toBe('approved');
    expect(body.approvedBy).toBe(REVIEWER);
    expectPhiSafeBody(body, 'approve body');
  });
});

// ── History read (both roles) ────────────────────────────────────────────────

describe('history read', () => {
  it('200 steward reads history (PHI-safe, records the transitions)', async () => {
    as(STEWARD, 'value-set-steward');
    await submitPOST(
      makeRequest(`${P}/submit`, { method: 'POST', body: { valueSetId: 'vs-hcc', version: '5.0.0' } }),
    );
    const res = await historyGET(makeRequest(`${P}/history?valueSetId=vs-hcc`));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { count: number; entries: { action: string }[] };
    expect(body.count).toBeGreaterThanOrEqual(1);
    expect(body.entries.some((e) => e.action === 'submit')).toBe(true);
    expectPhiSafeBody(body, 'history body');
  });

  it('200 reviewer reads history', async () => {
    as(STEWARD, 'value-set-steward');
    await submitPOST(
      makeRequest(`${P}/submit`, { method: 'POST', body: { valueSetId: 'vs-hcc', version: '5.0.0' } }),
    );
    as(REVIEWER, 'value-set-reviewer');
    const res = await historyGET(makeRequest(`${P}/history?valueSetId=vs-hcc`));
    expect(res.status).toBe(200);
    expectPhiSafeBody(await readJson(res), 'history body');
  });

  it('400 when valueSetId query param is missing', async () => {
    as(STEWARD, 'value-set-steward');
    const res = await historyGET(makeRequest(`${P}/history`));
    expect(res.status).toBe(400);
    expectPhiSafeBody(await readJson(res), '400 body');
  });
});

// ── Replay (returns the chosen-version binding) ──────────────────────────────

describe('replay', () => {
  it('200 replay returns the chosen-version binding (steward)', async () => {
    as(STEWARD, 'value-set-steward');
    const res = await replayPOST(
      makeRequest(`${P}/replay`, { method: 'POST', body: { valueSetId: 'vs-icd10', version: '2.1.0' } }),
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { valueSetId: string; version: string; boundVersion: string };
    expect(body.valueSetId).toBe('vs-icd10');
    expect(body.version).toBe('2.1.0');
    expect(body.boundVersion).toBe('2.1.0');
    expectPhiSafeBody(body, 'replay body');
  });

  it('200 replay permitted for a reviewer too', async () => {
    as(REVIEWER, 'value-set-reviewer');
    const res = await replayPOST(
      makeRequest(`${P}/replay`, { method: 'POST', body: { valueSetId: 'vs-icd10', version: '2.1.0' } }),
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { boundVersion: string };
    expect(body.boundVersion).toBe('2.1.0');
  });

  it('403 replay denied for a non-governance principal', async () => {
    as('Practitioner/admin-x', 'admin');
    const res = await replayPOST(
      makeRequest(`${P}/replay`, { method: 'POST', body: { valueSetId: 'vs-icd10', version: '2.1.0' } }),
    );
    expect(res.status).toBe(403);
    expectPhiSafeBody(await readJson(res), '403 body');
  });
});

// ── Validation (PHI-safe) ────────────────────────────────────────────────────

describe('validation', () => {
  it('400 when valueSetId is missing on submit', async () => {
    as(STEWARD, 'value-set-steward');
    const res = await submitPOST(
      makeRequest(`${P}/submit`, { method: 'POST', body: { version: '1.0.0' } }),
    );
    expect(res.status).toBe(400);
    expectPhiSafeBody(await readJson(res), '400 body');
  });

  it('400 when version is missing on submit', async () => {
    as(STEWARD, 'value-set-steward');
    const res = await submitPOST(
      makeRequest(`${P}/submit`, { method: 'POST', body: { valueSetId: 'vs-icd10' } }),
    );
    expect(res.status).toBe(400);
    expectPhiSafeBody(await readJson(res), '400 body');
  });
});

// ── Steward reject / retire happy paths ──────────────────────────────────────

describe('steward lifecycle', () => {
  it('200 steward rejects a pending version', async () => {
    as('Practitioner/steward-carol', 'value-set-steward');
    await submitPOST(
      makeRequest(`${P}/submit`, { method: 'POST', body: { valueSetId: 'vs-rx', version: '1.0.0' } }),
    );
    as(STEWARD, 'value-set-steward');
    const res = await rejectPOST(
      makeRequest(`${P}/reject`, { method: 'POST', body: { valueSetId: 'vs-rx' } }),
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { state: string };
    expect(body.state).toBe('rejected');
    expectPhiSafeBody(body, 'reject body');
  });

  it('200 steward retires a version', async () => {
    as(STEWARD, 'value-set-steward');
    const res = await retirePOST(
      makeRequest(`${P}/retire`, { method: 'POST', body: { valueSetId: 'vs-rx', version: '1.0.0' } }),
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { state: string };
    expect(body.state).toBe('retired');
    expectPhiSafeBody(body, 'retire body');
  });
});
