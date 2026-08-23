/**
 * SECURITY LENS — Iteration 3: session-principal role model (closes the two
 * deferred IDOR findings on /api/evidence/[id] and /api/financial-clearance).
 *
 * Three layers:
 *  1. Unit — getPrincipal derivation + canAccessMember scope decisions (pure).
 *  2. Route — a MEMBER-scoped session cannot read another member (403); a
 *     REVIEWER session reads cross-member within scope (200) and is denied
 *     outside an assigned panel (403).
 *  3. Grep proof — the hardcoded role:'pa-reviewer' authorization is gone from
 *     both routes (the authz role now comes from the session principal).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import {
  makeRequest,
  routeParams,
  readJson,
  sessionState,
  resetSessionState,
  resetRouteEnv,
} from '../api/_helpers';

vi.mock('@/lib/server/smartSession', async () => (await import('../api/_helpers')).smartSessionMock());

import { GET as evidenceGET } from '@/app/api/evidence/[id]/route';
import { POST as clearancePOST } from '@/app/api/financial-clearance/route';
import {
  getPrincipal,
  canAccessMember,
  purposeForRole,
  type Principal,
} from '@/lib/authz/principal';

const SELF = 'MARIA_SD_001';
const OTHER = 'PAT-0042';

beforeEach(() => {
  resetSessionState();
  resetRouteEnv();
  vi.clearAllMocks();
});

// ── 1. Unit: getPrincipal derivation ────────────────────────────────────────
describe('getPrincipal — derives role + scope from session facts', () => {
  it('Practitioner fhirUser => reviewer with org-wide scope', () => {
    const p = getPrincipal({ patient: SELF, fhirUser: 'Practitioner/dev' });
    expect(p.role).toBe('pa-reviewer');
    expect(p.authorizedMemberScope.kind).toBe('org');
  });

  it('Patient fhirUser => member with self-only scope on the launch patient', () => {
    const p = getPrincipal({ patient: SELF, fhirUser: `Patient/${SELF}` });
    expect(p.role).toBe('member');
    expect(p.authorizedMemberScope).toMatchObject({ kind: 'self', memberId: SELF });
  });

  it('a reviewer with an assigned panel => panel scope', () => {
    const p = getPrincipal({ fhirUser: 'Practitioner/dev', panel: [SELF, 'PAT-0087'] });
    expect(p.authorizedMemberScope).toMatchObject({ kind: 'panel', panel: [SELF, 'PAT-0087'] });
  });

  it('an unidentifiable session fails secure (self-only member)', () => {
    const p = getPrincipal({ patient: SELF, fhirUser: null });
    expect(p.role).toBe('member');
    expect(p.authorizedMemberScope.kind).toBe('self');
  });

  it('an explicit IdP role wins over fhirUser derivation', () => {
    const p = getPrincipal({ fhirUser: 'Patient/x', role: 'care-manager' });
    expect(p.role).toBe('care-manager');
    expect(p.authorizedMemberScope.kind).toBe('org');
  });
});

// ── 1. Unit: canAccessMember scope decisions ────────────────────────────────
describe('canAccessMember — member self-only, reviewer within scope', () => {
  const member: Principal = {
    userId: `Patient/${SELF}`,
    role: 'member',
    authorizedMemberScope: { kind: 'self', memberId: SELF },
  };
  const reviewerOrg: Principal = {
    userId: 'Practitioner/dev',
    role: 'pa-reviewer',
    authorizedMemberScope: { kind: 'org' },
  };
  const reviewerPanel: Principal = {
    userId: 'Practitioner/dev',
    role: 'pa-reviewer',
    authorizedMemberScope: { kind: 'panel', panel: [SELF] },
  };

  it('member may read their own record', () => {
    expect(canAccessMember(member, SELF).allow).toBe(true);
  });
  it('member may NOT read another member', () => {
    const d = canAccessMember(member, OTHER);
    expect(d.allow).toBe(false);
    expect(d.reason).not.toContain(OTHER); // PHI-safe reason
  });
  it('reviewer (org) may read any member', () => {
    expect(canAccessMember(reviewerOrg, OTHER).allow).toBe(true);
  });
  it('reviewer (panel) may read within the panel', () => {
    expect(canAccessMember(reviewerPanel, SELF).allow).toBe(true);
  });
  it('reviewer (panel) is denied outside the panel', () => {
    expect(canAccessMember(reviewerPanel, OTHER).allow).toBe(false);
  });
  it('a missing target member is denied', () => {
    expect(canAccessMember(reviewerOrg, undefined).allow).toBe(false);
  });
  it('purposeForRole maps member=>patient-request, reviewer=>operations', () => {
    expect(purposeForRole('member')).toBe('patient-request');
    expect(purposeForRole('pa-reviewer')).toBe('operations');
    expect(purposeForRole('auditor')).toBe('audit');
  });
});

// ── 2. Route: member-scoped session cannot cross members ─────────────────────
describe('routes — a member-scoped session is self-only', () => {
  beforeEach(() => {
    sessionState.patient = SELF;
    sessionState.fhirUser = `Patient/${SELF}`; // member
  });

  it('evidence: member reading another member => 403 PHI-safe', async () => {
    const id = `ev-${OTHER}-75561-1715782920000`;
    const res = await evidenceGET(makeRequest(`/api/evidence/${id}`), routeParams({ id }));
    expect(res.status).toBe(403);
    const body = (await readJson(res)) as { resourceType?: string; memberId?: string };
    expect(body.resourceType).toBe('OperationOutcome');
    expect(body.memberId).toBeUndefined();
  });

  it('evidence: member reading their OWN record => 200', async () => {
    const id = `ev-${SELF}-72148-1715782920000`;
    const res = await evidenceGET(makeRequest(`/api/evidence/${id}`), routeParams({ id }));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { memberId?: string };
    expect(body.memberId).toBe(SELF);
  });

  it('financial-clearance: member supplying another member id => 403', async () => {
    const res = await clearancePOST(
      makeRequest('/api/financial-clearance', { method: 'POST', body: { patientId: OTHER } })
    );
    expect(res.status).toBe(403);
  });
});

// ── 2. Route: reviewer session keeps legitimate cross-member reads ───────────
describe('routes — a reviewer session reads within scope', () => {
  it('evidence: reviewer (org) reads another member => 200 (legitimate ops read)', async () => {
    sessionState.patient = SELF;
    sessionState.fhirUser = 'Practitioner/reviewer-dev'; // reviewer, org scope
    const id = `ev-${OTHER}-75561-1715782920000`;
    const res = await evidenceGET(makeRequest(`/api/evidence/${id}`), routeParams({ id }));
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { memberId?: string };
    expect(body.memberId).toBe(OTHER);
  });

  it('financial-clearance: reviewer (org) runs another member => 200', async () => {
    sessionState.patient = SELF;
    sessionState.fhirUser = 'Practitioner/reviewer-dev';
    const res = await clearancePOST(
      makeRequest('/api/financial-clearance', { method: 'POST', body: { patientId: 'PAT-0087' } })
    );
    expect(res.status).toBe(200);
  });

  it('evidence: reviewer with an assigned PANEL is denied OUTSIDE the panel => 403', async () => {
    sessionState.patient = SELF;
    sessionState.fhirUser = 'Practitioner/reviewer-dev';
    sessionState.panel = [SELF]; // panel does not include OTHER
    const id = `ev-${OTHER}-75561-1715782920000`;
    const res = await evidenceGET(makeRequest(`/api/evidence/${id}`), routeParams({ id }));
    expect(res.status).toBe(403);
  });

  it('evidence: reviewer with a panel reads WITHIN the panel => 200', async () => {
    sessionState.patient = SELF;
    sessionState.fhirUser = 'Practitioner/reviewer-dev';
    sessionState.panel = [SELF];
    const id = `ev-${SELF}-72148-1715782920000`;
    const res = await evidenceGET(makeRequest(`/api/evidence/${id}`), routeParams({ id }));
    expect(res.status).toBe(200);
  });
});

// ── 3. Grep proof: the hardcoded authorization role is gone ──────────────────
describe('grep proof — hardcoded role:pa-reviewer removed from both routes', () => {
  const routes = [
    'src/app/api/evidence/[id]/route.ts',
    'src/app/api/financial-clearance/route.ts',
  ];
  for (const rel of routes) {
    it(`${rel} no longer hardcodes the authz role`, async () => {
      const src = await fs.readFile(path.join(process.cwd(), rel), 'utf8');
      expect(src).not.toMatch(/role:\s*['"]pa-reviewer['"]/);
      expect(src).toContain('getPrincipal');
      expect(src).toContain('canAccessMember');
    });
  }
});
