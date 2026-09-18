/**
 * Wave-11 C1 + C3 — cross-route double-submit binding and verify-before-reseal on the
 * re-read latest, exercised against BOTH real recovery routes (decision + action) over the
 * REAL evidence spine (no fakes).
 *
 * C1: the decision route submits the appeal under `${recoveryId}-submission`; the action
 * route submits an `appeal` under a governed-action id (`${recoveryId}-gact-appeal`). Before
 * Wave-11 the two id schemes were invisible to each other's terminal short-circuit, so one
 * underpayment could be appealed TWICE. Both paths are now bound to ONE submission-intent:
 * whichever route submits first, the other refuses (409), and the ledger carries exactly one
 * appeal submission.
 *
 * C3: the action route re-verifies the RE-READ latest record's seal before re-sealing — a
 * tamper landing between the base read and the re-read is refused (409), not laundered.
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

import { POST as decisionPOST } from '@/app/api/recovery/[id]/decision/route';
import { POST as actionPOST } from '@/app/api/recovery/[id]/action/route';
import { NextRequest } from 'next/server';
import {
  createEvidenceRecord,
  recordRecovery,
  sealRecord,
  type EvidenceRecord,
} from '@/lib/evidence';
import { createInMemoryEvidenceStore, type EvidenceStore } from '@/lib/evidence/evidenceStore';
import { getEvidenceStore, setProductionEvidenceStoreFactory } from '@/lib/evidence/store';
import { getSigningKeyLoader } from '@/lib/dataSources/signingKey';
import { REVENUE_CYCLE_AGENT_ID } from '@/lib/agents/revenueCycle';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';

process.env.AUDIT_LOG_DIR = path.join(os.tmpdir(), 'rhtp-recovery-crossroute-audit');

const TS = '2026-09-01T00:00:00.000Z';
const FUTURE_DEADLINE = '2027-06-01T00:00:00.000Z';
let seq = 0;

async function seed(): Promise<{ recordId: string; recoveryId: string }> {
  const memberId = 'MARIA_SD_001';
  const recordId = `ev-${memberId}-72148-${5000 + seq++}`;
  const recoveryId = `${recordId}-recovery`;
  let rec = createEvidenceRecord({
    id: recordId,
    memberId,
    order: { code: '72148' },
    createdAt: TS,
  });
  rec = recordRecovery(rec, {
    id: recoveryId,
    ts: TS,
    action: 'draft-appeal',
    rung: 'A1',
    remittanceId: 'RA-UHC-72148-0001',
    filingDeadline: FUTURE_DEADLINE,
    priority: 'routine',
    actor: REVENUE_CYCLE_AGENT_ID,
    taskClaimId: `${recordId}-claim`,
    taskAuthId: `auth-${memberId}-72148`,
    taskDelta: 1234,
    taskEvidenceTier: 'D3',
  });
  const key = await getSigningKeyLoader().load(TS);
  rec = { ...rec, seal: sealRecord(rec, key, TS) };
  await getEvidenceStore().save(rec);
  return { recordId, recoveryId };
}

function postDecision(recoveryId: string, decision: unknown): Promise<Response> {
  const req = new NextRequest(`http://localhost/api/recovery/${recoveryId}/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision }),
  });
  return decisionPOST(req, {
    params: Promise.resolve({ id: recoveryId }),
  }) as unknown as Promise<Response>;
}

function postAction(recoveryId: string, actionType: unknown, decision: unknown): Promise<Response> {
  const req = new NextRequest(`http://localhost/api/recovery/${recoveryId}/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ actionType, decision }),
  });
  return actionPOST(req, {
    params: Promise.resolve({ id: recoveryId }),
  }) as unknown as Promise<Response>;
}

async function load(recordId: string): Promise<EvidenceRecord> {
  const r = await getEvidenceStore().get(recordId);
  if (!r) throw new Error('record missing');
  return r;
}

const submissionEntries = (r: EvidenceRecord): number =>
  r.entries.filter((e) => e.type === 'submission').length;
const executedAppeals = (r: EvidenceRecord): number =>
  r.entries.filter(
    (e) => e.type === 'governed-action' && e.actionType === 'appeal' && e.status === 'executed'
  ).length;

beforeEach(() => {
  process.env.NEXT_PUBLIC_FLAG_GOLDEN_THREAD_E2E = 'true';
  h.session.authenticated = true;
  h.session.role = 'pa-reviewer';
  h.session.fhirUser = 'Practitioner/rev-1';
  h.session.patient = 'MARIA_SD_001';
  h.session.tenantId = undefined;
  h.session.tenantIds = undefined;
  clearSessionDataModes();
});

afterEach(() => {
  clearSessionDataModes();
  setProductionEvidenceStoreFactory(null);
  delete process.env.NEXT_PUBLIC_FLAG_GOLDEN_THREAD_E2E;
});

describe('C1 — one submission-intent per recovery across the decision + action routes', () => {
  it('DECISION submits, then ACTION appeal is refused (409) — exactly ONE submission', async () => {
    const { recordId, recoveryId } = await seed();
    expect((await postDecision(recoveryId, 'approved')).status).toBe(200);
    const res2 = await postAction(recoveryId, 'appeal', 'approved');
    expect(res2.status).toBe(409);
    const rec = await load(recordId);
    expect(submissionEntries(rec)).toBe(1); // the decision route's submission
    expect(executedAppeals(rec)).toBe(0); // the action route never executed a second appeal
  });

  it('ACTION appeal executes, then DECISION approve is refused (409) — exactly ONE submission', async () => {
    const { recordId, recoveryId } = await seed();
    expect((await postAction(recoveryId, 'appeal', 'approved')).status).toBe(200);
    const res2 = await postDecision(recoveryId, 'approved');
    expect(res2.status).toBe(409);
    const rec = await load(recordId);
    expect(executedAppeals(rec)).toBe(1); // the action route's governed appeal
    expect(submissionEntries(rec)).toBe(0); // the decision route never wrote a second submission
  });

  it('the action route STILL allows a non-appeal governed action after a decision submit', async () => {
    // C1 binds only the payer appeal; a distinct governed action (e.g. x12-276) is unaffected.
    const { recordId, recoveryId } = await seed();
    expect((await postDecision(recoveryId, 'approved')).status).toBe(200);
    expect((await postAction(recoveryId, 'x12-276', 'approved')).status).toBe(200);
    const rec = await load(recordId);
    expect(submissionEntries(rec)).toBe(1);
    expect(
      rec.entries.filter(
        (e) => e.type === 'governed-action' && e.actionType === 'x12-276' && e.status === 'executed'
      ).length
    ).toBe(1);
  });
});

describe('C3 — action route re-verifies the RE-READ latest seal before re-sealing', () => {
  it('a tamper landing between the base read and the re-read latest → 409, nothing written', async () => {
    // A store whose 2nd get (the route's re-read latest) returns a record tampered AFTER its
    // seal — the base read (1st get) is intact so the base guard passes; only the C3 latest
    // guard can catch it. Without C3 the tamper would be laundered (re-signed valid).
    const inner = createInMemoryEvidenceStore();
    let gets = 0;
    const key = await getSigningKeyLoader().load(TS);
    const wrapped: EvidenceStore = {
      save: (r) => inner.save(r),
      list: () => inner.list(),
      async get(id) {
        gets += 1;
        const r = await inner.get(id);
        if (r && gets === 2) {
          // Tamper: mutate a sealed entry WITHOUT re-sealing → seal no longer matches.
          const entries = r.entries.map((e) =>
            e.type === 'recovery' ? { ...e, taskDelta: 999999 } : e
          );
          return { ...r, entries };
        }
        return r;
      },
    };
    setProductionEvidenceStoreFactory(() => wrapped);
    setSessionDataMode('evidence', 'production');
    // Seed directly into the wrapped store (a valid, sealed record).
    const recordId = `ev-MARIA_SD_001-72148-${6000 + seq++}`;
    const recoveryId = `${recordId}-recovery`;
    let rec = createEvidenceRecord({
      id: recordId,
      memberId: 'MARIA_SD_001',
      order: { code: '72148' },
      createdAt: TS,
    });
    rec = recordRecovery(rec, {
      id: recoveryId,
      ts: TS,
      action: 'draft-appeal',
      rung: 'A1',
      remittanceId: 'RA-UHC-72148-0001',
      priority: 'routine',
      actor: REVENUE_CYCLE_AGENT_ID,
      taskClaimId: `${recordId}-claim`,
      taskAuthId: 'auth-1',
      taskDelta: 1234,
      taskEvidenceTier: 'D3',
    });
    rec = { ...rec, seal: sealRecord(rec, key, TS) };
    await wrapped.save(rec);

    const res = await postAction(recoveryId, 'x12-276', 'approved');
    expect(res.status).toBe(409);
    // Nothing was written (the last saved version is the untampered seed — the tamper was a
    // read-time injection, and the route refused before save).
    const persisted = await inner.get(recordId);
    expect(
      persisted?.entries.filter((e) => e.type === 'governed-action' && e.status === 'executed')
        .length
    ).toBe(0);
  });

  it('decision route: a tamper on the re-read latest → 409, no submission/terminal written', async () => {
    const inner = createInMemoryEvidenceStore();
    let gets = 0;
    const key = await getSigningKeyLoader().load(TS);
    const wrapped: EvidenceStore = {
      save: (r) => inner.save(r),
      list: () => inner.list(),
      async get(id) {
        gets += 1;
        const r = await inner.get(id);
        if (r && gets === 2) {
          const entries = r.entries.map((e) =>
            e.type === 'recovery' ? { ...e, taskDelta: 424242 } : e
          );
          return { ...r, entries };
        }
        return r;
      },
    };
    setProductionEvidenceStoreFactory(() => wrapped);
    setSessionDataMode('evidence', 'production');
    const recordId = `ev-MARIA_SD_001-72148-${7000 + seq++}`;
    const recoveryId = `${recordId}-recovery`;
    let rec = createEvidenceRecord({
      id: recordId,
      memberId: 'MARIA_SD_001',
      order: { code: '72148' },
      createdAt: TS,
    });
    rec = recordRecovery(rec, {
      id: recoveryId,
      ts: TS,
      action: 'draft-appeal',
      rung: 'A1',
      remittanceId: 'RA-UHC-72148-0001',
      filingDeadline: FUTURE_DEADLINE,
      priority: 'routine',
      actor: REVENUE_CYCLE_AGENT_ID,
      taskClaimId: `${recordId}-claim`,
      taskAuthId: 'auth-1',
      taskDelta: 1234,
      taskEvidenceTier: 'D3',
    });
    rec = { ...rec, seal: sealRecord(rec, key, TS) };
    await wrapped.save(rec);

    expect((await postDecision(recoveryId, 'approved')).status).toBe(409);
    const persisted = await inner.get(recordId);
    expect(persisted?.entries.some((e) => e.type === 'submission')).toBe(false);
    expect(persisted?.entries.some((e) => e.type === 'recovery-decision')).toBe(false);
  });
});
