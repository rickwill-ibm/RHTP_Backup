/**
 * SECURITY LENS — Attack class 6: AI guardrail (state machine gates authority).
 *
 * Asserts that no decision-support / agent-prepared output can set an
 * authoritative state on its own. The PA submission is HUMAN-GATED: without an
 * explicit approver the route refuses to submit (blueprint §4D, conventions §9).
 * CDS/CRD cards are advisory only and never carry an approval that flips PA state.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
import {
  makeRequest,
  readJson,
  sessionState,
  resetSessionState,
  resetRouteEnv,
} from '../api/_helpers';

vi.mock('@/lib/server/smartSession', async () => (await import('../api/_helpers')).smartSessionMock());

import { POST as pasPOST } from '@/app/api/pas/submit/route';
import { POST as cdsPOST } from '@/app/api/cds/route';

beforeEach(() => {
  resetSessionState();
  resetRouteEnv();
  sessionState.authenticated = true;
  vi.clearAllMocks();
});

describe('Human gate — PA submission refuses without an approver', () => {
  it('202 (not a submission) when approvedBy is absent — agent may prepare, not submit', async () => {
    const res = await pasPOST(makeRequest('/api/pas/submit', { method: 'POST', body: { claimBundle: { resourceType: 'Bundle' } } }));
    expect(res.status).toBe(202);
    const body = (await readJson(res)) as { resourceType: string; issue: { diagnostics: string }[] };
    expect(body.resourceType).toBe('OperationOutcome');
    // The 202 body must NOT be an authoritative approved ClaimResponse.
    expect(JSON.stringify(body)).not.toMatch(/ClaimResponse|"outcome"\s*:\s*"complete"|Auth#/);
    expect(body.issue[0].diagnostics).toMatch(/human approval/i);
  });

  it('a claimBundle alone cannot self-approve — approver is required to reach submit', async () => {
    // Same bundle, still no approver via body OR header → still gated at 202.
    const res = await pasPOST(makeRequest('/api/pas/submit', { method: 'POST', body: { claimBundle: { entry: [] } }, headers: {} }));
    expect(res.status).toBe(202);
  });

  it('200 only once an explicit human approver is supplied (gate satisfied)', async () => {
    const res = await pasPOST(
      makeRequest('/api/pas/submit', { method: 'POST', body: { claimBundle: { resourceType: 'Bundle' }, approvedBy: 'reviewer:jdoe' } })
    );
    expect(res.status).toBe(200);
  });
});

describe('Decision-support cards are advisory, not authoritative', () => {
  it('CRD returns cards only — no field that sets an authoritative PA approval', async () => {
    const res = await cdsPOST(
      makeRequest('/api/cds', { method: 'POST', body: { hookId: 'order-sign', hookRequest: { context: { patientId: 'PAT-0042' } } } })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as { cards?: unknown[] };
    expect(Array.isArray(body.cards)).toBe(true);
    // Cards must not encode an authoritative PA decision / approval number.
    expect(JSON.stringify(body)).not.toMatch(/"paApproved"|"authoritative"\s*:\s*true|Auth#\s*\d/);
  });
});
