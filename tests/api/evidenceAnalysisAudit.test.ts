/**
 * Wave-11 A5 + A-audit — GET /api/evidence/[id]?party=&analysis=.
 *
 * A5: when the flag-gated party/analysis (workbench) path is engaged AND the record is
 * PERSISTED in the shared store, the analysis is sourced from THAT real record — the SAME one
 * the Wave-9 action route acts on — not the dev-mock seed skeleton. So the finding the analyst
 * SEES (e.g. real remittance aggregates) is the basis for the action, closing the rubber-stamp
 * gap where the analyst saw an empty seed while the action ran against the full sealed thread.
 *
 * A-audit: the read audit records WHICH analysis was asked over PHI-adjacent data + the party
 * + the gate outcome — ids only (PHI-safe).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  makeRequest,
  routeParams,
  resetSessionState,
  resetGuardState,
  resetRouteEnv,
} from './_helpers';

vi.mock('@/lib/server/smartSession', async () => (await import('./_helpers')).smartSessionMock());
vi.mock('@/lib/authz/guard', async () => (await import('./_helpers')).guardMock());

const auditCalls: Array<{ action: string; detail?: string; outcome: string }> = [];
vi.mock('@/lib/server/audit', async (orig) => {
  const actual = await orig<typeof import('@/lib/server/audit')>();
  return {
    ...actual,
    audit: vi.fn(async (e: { action: string; detail?: string; outcome: string }) => {
      auditCalls.push(e);
    }),
  };
});

import { GET as evidenceGET } from '@/app/api/evidence/[id]/route';
import {
  createEvidenceRecord,
  recordRemittance,
  recordReconciliation,
  recordPasDecision,
  sealRecord,
  type EvidenceRecord,
} from '@/lib/evidence';
import { getEvidenceStore } from '@/lib/evidence/store';
import { getSigningKeyLoader } from '@/lib/dataSources/signingKey';

const MEMBER = 'PAT-0042';
const EV_ID = `ev-${MEMBER}-75561-1730154783`;
const TS = '2026-05-15T14:22:00.000Z';

async function persistReal(): Promise<void> {
  let r: EvidenceRecord = createEvidenceRecord({
    id: EV_ID,
    memberId: MEMBER,
    order: { code: '75561' },
    createdAt: TS,
  });
  r = recordRemittance(r, {
    id: `${EV_ID}-rem`,
    ts: TS,
    remittanceId: 'rem-real',
    paidAmount: 40,
    adjustments: [
      { group: 'CO', amount: 60 },
      { group: 'PR', amount: 10 },
    ],
    carcCodes: ['45'],
    rarcCodes: [],
    carcGroups: ['CO', 'PR'],
  });
  r = recordReconciliation(r, {
    id: `${EV_ID}-recon`,
    ts: TS,
    verdict: 'underpaid',
    contractedAllowed: 100,
    paidAmount: 40,
    delta: 60,
    toleranceApplied: 5,
  });
  r = recordPasDecision(r, { id: `${EV_ID}-pas`, ts: TS, authId: 'auth-x', decision: 'approved' });
  const key = await getSigningKeyLoader().load(TS);
  r = { ...r, seal: sealRecord(r, key, TS) };
  await getEvidenceStore().save(r);
}

beforeEach(() => {
  resetSessionState();
  resetGuardState();
  resetRouteEnv();
  auditCalls.length = 0;
  process.env.NEXT_PUBLIC_FLAG_GOLDEN_THREAD_E2E = 'true';
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_FLAG_GOLDEN_THREAD_E2E;
  vi.clearAllMocks();
});

describe('A5 — the analysis is sourced from the PERSISTED store record, not the seed', () => {
  it('denial-rca over a persisted record shows the REAL remittance aggregates (not the empty seed)', async () => {
    // The dev-mock seed for this id carries NO remittance → denial-rca would report
    // hasRemittance:false. With a real record persisted, A5 reads THAT record → real byGroup.
    await persistReal();
    const res = await evidenceGET(
      makeRequest(`/api/evidence/${EV_ID}?party=payer&analysis=denial-rca`),
      routeParams({ id: EV_ID })
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      analysis?: { outcome: string; finding?: { data: Record<string, unknown> } };
    };
    expect(body.analysis?.outcome).toBe('ok');
    const data = body.analysis?.finding?.data ?? {};
    // The seed would give { hasRemittance: false }; the real record gives computed aggregates.
    expect(data.hasRemittance).not.toBe(false);
    expect(data.byGroup).toEqual({ CO: 60, PR: 10 });
    expect(data.totalAdjusted).toBe(70);
  });

  it('A-audit: the evidence.read audit records the analysis id + party + gate outcome (ids only)', async () => {
    await persistReal();
    await evidenceGET(
      makeRequest(`/api/evidence/${EV_ID}?party=payer&analysis=denial-rca`),
      routeParams({ id: EV_ID })
    );
    const read = auditCalls.find((c) => c.action === 'evidence.read' && c.outcome === 'success');
    expect(read).toBeDefined();
    expect(read?.detail).toContain('party=payer');
    expect(read?.detail).toContain('analysis=denial-rca');
    expect(read?.detail).toContain('gate=ok');
    // PHI-safe: ids only — no member id in the audit detail.
    expect(read?.detail).not.toContain(MEMBER);
  });

  it('A-audit: a plan-rejected gate outcome is recorded (ids only)', async () => {
    await persistReal();
    await evidenceGET(
      makeRequest(`/api/evidence/${EV_ID}?party=payer&analysis=member-cohort-drilldown`),
      routeParams({ id: EV_ID })
    );
    const read = auditCalls.find((c) => c.action === 'evidence.read' && c.outcome === 'success');
    expect(read?.detail).toContain('analysis=member-cohort-drilldown');
    expect(read?.detail).toContain('gate=plan-rejected');
  });
});
