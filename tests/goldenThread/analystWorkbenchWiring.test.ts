/**
 * Wave-12 FIX-2 — the Analyst Workbench governed-action path closes end-to-end.
 *
 * The workbench page persists the seed order→cash thread (with a recovery draft) via the
 * REAL orchestrator, the RUN reads that persisted record through GET /api/evidence
 * (party + curated analysis), and the Approve triggers POST /api/recovery/:id/action.
 *
 * Proves:
 *  - the persisted seed thread carries a recovery draft under `${EVIDENCE_ID}-recovery`;
 *  - the GET analysis (workbench) path returns THAT persisted, sealed record (not the seed
 *    skeleton), so the finding the analyst sees is the basis for the action;
 *  - the governed Approve resolves + executes against the SAME persisted record — a MOCK,
 *    not-transmitted submission — with NO 404 (the walkthrough defect);
 *  - FIX-2 regression guard: with no persisted record, the governed (analysis) path returns
 *    an honest not-found on RUN instead of a phantom seed skeleton the Approve can't act on;
 *    a party-only view (no analysis) still gets the dev-mock skeleton (behavior unchanged).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'os';
import path from 'path';

const h = vi.hoisted(() => ({
  session: {
    authenticated: true,
    role: 'pa-reviewer' as string | null,
    fhirUser: 'Practitioner/rev-1' as string | null,
    patient: 'MARIA_SD_001' as string | null,
    scope: 'launch openid fhirUser' as string | null,
    tenantId: undefined as string | undefined,
    tenantIds: undefined as string[] | undefined,
  },
}));
vi.mock('@/lib/server/smartSession', () => ({
  isAuthenticated: async () => h.session.authenticated,
  getSessionAuthContext: async () => (h.session.authenticated ? { ...h.session } : null),
  getSessionPatient: async () => h.session.patient,
}));

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/evidence/[id]/route';
import { POST as ACTION_POST } from '@/app/api/recovery/[id]/action/route';
import type { MemberContext } from '@/lib/policy';
import { loadMockLibrary } from '@/lib/policy';
import { mockGoldCardDataSource } from '@/lib/policy/goldCardSource';
import { mockDenialRateProvider } from '@/lib/policy/denialRates';
import { getEvidenceStore, setProductionEvidenceStoreFactory } from '@/lib/evidence/store';
import { runOrderToCash } from '@/lib/goldenThread/orderToCash';
import type { StageOrder } from '@/lib/goldenThread';
import type { CoverageInfo } from '@/lib/goldenThread/eligibility';
import type { ThreadInputs } from '@/lib/goldenThread/fromFhirBundle';
import { getRemittanceGatewayLoader, getContractRepositoryLoader } from '@/lib/dataSources';
import { getSigningKeyLoader } from '@/lib/dataSources/signingKey';
import { createRuntime, createManualClock } from '@/lib/agentRuntime';
import { createRecoveryWorkflow } from '@/lib/agents/revenueCycle';
import { getAgentManifest } from '@/lib/agents/manifest';
import { clearSessionDataModes } from '@/lib/config/dataMode';

process.env.AUDIT_LOG_DIR = path.join(os.tmpdir(), 'rhtp-workbench-wiring-audit');

// The SAME deterministic scenario constants the workbench page uses.
const TS = '2026-08-30T00:00:00.000Z';
const MEMBER_ID = 'MARIA_SD_001';
const PAYER = 'UnitedHealthcare Community Plan';
const ORDER_CODE = '72148';
const PROVIDER_NPI = '1518998765';
const EVIDENCE_ID = `ev-${MEMBER_ID}-${ORDER_CODE}-${Date.parse(TS)}`;

beforeEach(() => {
  process.env.NEXT_PUBLIC_FLAG_GOLDEN_THREAD_E2E = 'true';
  process.env.ALLOW_DEV_MOCK_AUTH = 'true'; // dev-mock posture (WSO2 unset) → seed skeleton enabled
  delete process.env.WSO2_TOKEN_URL;
  h.session.authenticated = true;
  h.session.role = 'pa-reviewer';
  h.session.fhirUser = 'Practitioner/rev-1';
  h.session.patient = 'MARIA_SD_001';
  clearSessionDataModes();
});
afterEach(() => {
  clearSessionDataModes();
  setProductionEvidenceStoreFactory(null);
  delete process.env.NEXT_PUBLIC_FLAG_GOLDEN_THREAD_E2E;
  delete process.env.ALLOW_DEV_MOCK_AUTH;
});

/** Mirror the workbench page's persistSeedThread: real orchestrator, shared store, same ids. */
async function persistSeedThread(): Promise<void> {
  const member: MemberContext = { memberId: MEMBER_ID, diagnoses: [] };
  const order: StageOrder = {
    code: ORDER_CODE,
    codeSystem: 'CPT',
    display: 'MRI lumbar spine w/o contrast',
    providerNpi: PROVIDER_NPI,
    payer: PAYER,
  };
  const coverage: CoverageInfo = {
    status: 'active',
    payer: PAYER,
    plan: 'Texas STAR',
    type: 'Medicaid managed care',
  };
  const inputs: ThreadInputs = { member, order, coverage };
  const [remittance, feeSchedule, signer] = await Promise.all([
    getRemittanceGatewayLoader().load(TS),
    getContractRepositoryLoader().load(TS),
    getSigningKeyLoader().load(TS),
  ]);
  const recoveryRuntime = createRuntime({ clock: createManualClock(Date.parse(TS)) });
  await runOrderToCash(inputs, {
    library: loadMockLibrary(),
    goldCardSource: mockGoldCardDataSource,
    denialRates: mockDenialRateProvider,
    store: getEvidenceStore(),
    ts: TS,
    remittance,
    feeSchedule,
    pasDecision: 'approved',
    reviewerAuthId: `auth-${MEMBER_ID}-${ORDER_CODE}`,
    recoveryAgentTier: getAgentManifest('revenue-cycle-agent').autonomyTier,
    recovery: { engine: recoveryRuntime.engine, makeWorkflow: createRecoveryWorkflow },
    signer,
    sealTs: TS,
    idempotency: false,
    ids: {
      evidence: EVIDENCE_ID,
      determination: `${EVIDENCE_ID}-det`,
      goldCard: `${EVIDENCE_ID}-gc`,
      propensity: `${EVIDENCE_ID}-prop`,
      eligibility: `${EVIDENCE_ID}-elig`,
      estimation: `${EVIDENCE_ID}-est`,
      pasDecision: `${EVIDENCE_ID}-pas`,
      claim: `${EVIDENCE_ID}-claim`,
      remittance: `${EVIDENCE_ID}-rem`,
      reconciliation: `${EVIDENCE_ID}-recon`,
      underpayment: `${EVIDENCE_ID}-under`,
      recovery: `${EVIDENCE_ID}-recovery`,
    },
  });
}

function getEvidence(id: string, qs: string): Promise<Response> {
  const req = new NextRequest(`http://localhost/api/evidence/${id}?${qs}`, {
    headers: { 'x-correlation-id': 'wb-test' },
  });
  return GET(req, { params: Promise.resolve({ id }) }) as unknown as Promise<Response>;
}
function postAction(recoveryId: string, actionType: string): Promise<Response> {
  const req = new NextRequest(`http://localhost/api/recovery/${recoveryId}/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ actionType, decision: 'approved' }),
  });
  return ACTION_POST(req, {
    params: Promise.resolve({ id: recoveryId }),
  }) as unknown as Promise<Response>;
}

describe('Analyst Workbench governed-action path — closes end-to-end (FIX-2)', () => {
  it('persists a recovery draft under ${EVIDENCE_ID}-recovery', async () => {
    await persistSeedThread();
    const rec = await getEvidenceStore().get(EVIDENCE_ID);
    expect(rec).not.toBeNull();
    const recovery = rec!.entries.find((e) => e.type === 'recovery');
    expect(recovery?.id).toBe(`${EVIDENCE_ID}-recovery`);
  });

  it('the RUN (party + analysis) returns the PERSISTED sealed record, not the seed skeleton', async () => {
    await persistSeedThread();
    const res = await getEvidence(EVIDENCE_ID, 'party=payer&analysis=recovery-verification');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      createdAt: string;
      entries: Array<{ type: string }>;
      analysis?: { analysisId: string };
      routedEscalation?: { queueItem: unknown };
    };
    expect(body.createdAt).toBe(TS); // the persisted record's ts (seed skeleton is 2026-05-15)
    expect(body.entries.some((e) => e.type === 'recovery')).toBe(true);
    expect(body.analysis?.analysisId).toBe('recovery-verification');
    // The routed queue item is present (a persisted recovery draft) — the signal the client
    // uses to OFFER the governed Approve (FIX-2).
    expect(body.routedEscalation?.queueItem).not.toBeNull();
  });

  it('the Approve resolves + executes against the SAME persisted record (mock, not-transmitted; no 404)', async () => {
    await persistSeedThread();
    const res = await postAction(`${EVIDENCE_ID}-recovery`, 'appeal');
    expect(res.status).toBe(200); // NOT 404 — the walkthrough defect is closed
    const body = (await res.json()) as {
      outcome: string;
      isSubmission: boolean;
      ref: string;
      workItemId: string;
    };
    expect(body.outcome).toBe('executed');
    expect(body.isSubmission).toBe(true);
    expect(body.ref).toBeTruthy();
    expect(body.ref).not.toContain(MEMBER_ID); // FIX-1: PHI-safe ref
    expect(body.workItemId).toBe(`${EVIDENCE_ID}-recovery`);
  });

  it('FIX-2: over a NON-persisted record the analysis RUN reports NO routed recovery (client withholds Approve), and a direct Approve is an honest 404', async () => {
    const cold = `ev-${MEMBER_ID}-${ORDER_CODE}-1700000000000`; // never persisted → seed skeleton
    // The analysis-over-skeleton READ still works (Wave-8 / API-Explorer feature), BUT the
    // routed escalation has NO queue item — the record carries no recovery draft — which is the
    // signal the workbench client uses to WITHHOLD the governed Approve (so it never 404s).
    const governed = await getEvidence(cold, 'party=payer&analysis=recovery-verification');
    expect(governed.status).toBe(200);
    const body = (await governed.json()) as {
      routedEscalation?: { queueItem: unknown };
    };
    expect(body.routedEscalation?.queueItem).toBeNull();
    // A governed action posted directly against the absent recovery is an honest 404 (the
    // route's not-found handling is preserved) — which is exactly why the client withholds it.
    const action = await postAction(`${cold}-recovery`, 'appeal');
    expect(action.status).toBe(404);
  });
});
