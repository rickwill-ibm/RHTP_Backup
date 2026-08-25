/**
 * Route coverage (conventions §14): /api/pas/submit (human-gated PAS submit)
 * and /api/webhooks/claim-response (secret-verified inbound webhook).
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

import { POST as pasPOST } from '@/app/api/pas/submit/route';
import { POST as webhookPOST } from '@/app/api/webhooks/claim-response/route';

const CLAIM_BUNDLE = {
  resourceType: 'Bundle',
  type: 'collection',
  entry: [
    {
      resource: {
        resourceType: 'Claim',
        patient: { reference: 'Patient/PAT-0042' },
      },
    },
  ],
};

beforeEach(() => {
  resetSessionState();
  resetRouteEnv();
  vi.clearAllMocks();
});

describe('POST /api/pas/submit', () => {
  it('401 with a PHI-safe body when unauthenticated', async () => {
    sessionState.authenticated = false;
    const res = await pasPOST(
      makeRequest('/api/pas/submit', { method: 'POST', body: { claimBundle: CLAIM_BUNDLE } })
    );
    await expectPhiSafeError(res, 401);
  });

  it('400 with a PHI-safe body when claimBundle is missing (validation)', async () => {
    const res = await pasPOST(
      makeRequest('/api/pas/submit', { method: 'POST', body: { approvedBy: 'Dr. A' } })
    );
    const body = (await expectPhiSafeError(res, 400)) as { resourceType: string };
    expect(body.resourceType).toBe('OperationOutcome');
  });

  it('202 human gate: refuses to submit without approvedBy and says so (guardrail §4D)', async () => {
    const res = await pasPOST(
      makeRequest('/api/pas/submit', { method: 'POST', body: { claimBundle: CLAIM_BUNDLE } })
    );
    expect(res.status).toBe(202);
    const body = (await readJson(res)) as {
      resourceType: string;
      issue: { severity: string; diagnostics: string }[];
    };
    expect(body.resourceType).toBe('OperationOutcome');
    expect(body.issue[0].severity).toBe('information');
    expect(body.issue[0].diagnostics).toContain('human approval');
  });

  it('200 submits with an approver and returns the ClaimResponse (mock happy path)', async () => {
    const res = await pasPOST(
      makeRequest('/api/pas/submit', {
        method: 'POST',
        body: { claimBundle: CLAIM_BUNDLE, approvedBy: 'Dr. Reviewer MD' },
      })
    );
    expect(res.status).toBe(200);
    const body = (await readJson(res)) as {
      resourceType: string;
      patient: { reference: string };
      disposition: string;
    };
    expect(body.resourceType).toBe('ClaimResponse');
    expect(body.patient.reference).toBe('Patient/PAT-0042');
    // approver of record is bound server-side from the authenticated session — the
    // client-supplied string is NOT echoed into the ClaimResponse (spoof closed).
    expect(body.disposition).toContain('reviewer-dev');
    expect(body.disposition).not.toContain('Dr. Reviewer MD');
  });

  it('accepts the approver via the x-approved-by header as the route allows', async () => {
    const res = await pasPOST(
      makeRequest('/api/pas/submit', {
        method: 'POST',
        body: { claimBundle: CLAIM_BUNDLE },
        headers: { 'x-approved-by': 'reviewer@rhtp-health.org' },
      })
    );
    expect(res.status).toBe(200);
  });

  it.skip('200 live PAS submit via Ballerina - requires the Docker services backbone', async () => {
    setDevMock(false);
    const res = await pasPOST(
      makeRequest('/api/pas/submit', {
        method: 'POST',
        body: { claimBundle: CLAIM_BUNDLE, approvedBy: 'Dr. Reviewer MD' },
      })
    );
    expect(res.status).toBe(200);
  });
});

describe('POST /api/webhooks/claim-response', () => {
  it('401 with a PHI-safe body when no shared secret is configured (spoof refusal)', async () => {
    delete process.env.WEBHOOK_SHARED_SECRET;
    const res = await webhookPOST(
      makeRequest('/api/webhooks/claim-response', {
        method: 'POST',
        body: { id: 'cr-1', outcome: 'complete' },
        headers: { 'x-webhook-secret': 'anything' },
      })
    );
    await expectPhiSafeError(res, 401);
  });

  it('401 with a PHI-safe body when the provided secret is wrong (authn)', async () => {
    process.env.WEBHOOK_SHARED_SECRET = 'expected-secret';
    const res = await webhookPOST(
      makeRequest('/api/webhooks/claim-response', {
        method: 'POST',
        body: { id: 'cr-1', outcome: 'complete' },
        headers: { 'x-webhook-secret': 'wrong-secret' },
      })
    );
    const body = (await expectPhiSafeError(res, 401)) as { resourceType: string };
    expect(body.resourceType).toBe('OperationOutcome');
  });

  it('202 accepts and acknowledges a verified callback (happy path)', async () => {
    process.env.WEBHOOK_SHARED_SECRET = 'expected-secret';
    const res = await webhookPOST(
      makeRequest('/api/webhooks/claim-response', {
        method: 'POST',
        body: { id: 'cr-42', outcome: 'complete' },
        headers: { 'x-webhook-secret': 'expected-secret', 'x-correlation-id': 'cid-wh-1' },
      })
    );
    expect(res.status).toBe(202);
    const body = (await readJson(res)) as { received: boolean; correlationId: string };
    expect(body.received).toBe(true);
    expect(body.correlationId).toBe('cid-wh-1');
  });

  it('202 tolerates a malformed body once authenticated (accept + audit only)', async () => {
    process.env.WEBHOOK_SHARED_SECRET = 'expected-secret';
    const res = await webhookPOST(
      makeRequest('/api/webhooks/claim-response', {
        method: 'POST',
        rawBody: 'not-json',
        headers: { 'x-webhook-secret': 'expected-secret' },
      })
    );
    expect(res.status).toBe(202);
    const body = (await readJson(res)) as { received: boolean };
    expect(body.received).toBe(true);
  });
});
