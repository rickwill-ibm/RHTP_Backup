/**
 * Wave-4 — the recovery-decision route + reconstruct-and-signal resume. Proves TREE 2
 * against the REAL runtime + evidence spine: qualified-human APPROVE (exactly-once submission
 * + recovery-decision + re-seal), REJECT (no submission, drops from queue), system/autonomy
 * BLOCKED at every tier, exactly-once under concurrency, submission unreachable pre-approval,
 * deterministic proposalId, tenancy, verify-before-reseal, timely-filing, flag-off, tier-floor.
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

import { POST } from '@/app/api/recovery/[id]/decision/route';
import { NextRequest } from 'next/server';
import {
  createEvidenceRecord,
  recordRecovery,
  recordSubmission,
  recordReconciliation,
  sealRecord,
  verifyLedgerIntegrity,
  computeProcessTier,
  latestOfType,
  type EvidenceRecord,
} from '@/lib/evidence';
import { createInMemoryEvidenceStore, type EvidenceStore } from '@/lib/evidence/evidenceStore';
import { getEvidenceStore, setProductionEvidenceStoreFactory } from '@/lib/evidence/store';
import { getSigningKeyLoader } from '@/lib/dataSources/signingKey';
import {
  REVENUE_CYCLE_AGENT_ID,
  createRecoveryWorkflow,
  type RecoveryTask,
} from '@/lib/agents/revenueCycle';
import { recoveryReviewItem, overdueRecoveryItems } from '@/lib/goldenThread/workQueueView';
import { resetDefaultIdempotencyStore } from '@/lib/idempotency';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';
import { runtimeWithRegistry, registryWithTier, waitFor } from '../agents/helpers';

process.env.AUDIT_LOG_DIR = path.join(os.tmpdir(), 'rhtp-recovery-decision-audit');

const TS = '2026-09-01T00:00:00.000Z';
const FUTURE_DEADLINE = '2027-06-01T00:00:00.000Z';
const PAST_DEADLINE = '2020-01-01T00:00:00.000Z';

let seq = 0;

interface Seeded {
  recordId: string;
  recoveryId: string;
  memberId: string;
}

/** Build + seal + persist a recovery-draft record carrying the exact task fields. */
async function seed(opts?: {
  seal?: boolean;
  memberId?: string;
  filingDeadline?: string;
  tamper?: boolean;
  omitTaskFields?: boolean;
}): Promise<Seeded> {
  const memberId = opts?.memberId ?? 'MARIA_SD_001';
  const recordId = `ev-${memberId}-72148-${1000 + seq++}`;
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
    filingDeadline: opts?.filingDeadline ?? FUTURE_DEADLINE,
    priority: 'routine',
    actor: REVENUE_CYCLE_AGENT_ID,
    ...(opts?.omitTaskFields
      ? {}
      : {
          taskClaimId: `${recordId}-claim`,
          taskAuthId: `auth-${memberId}-72148`,
          taskDelta: 1234,
          taskEvidenceTier: 'D1',
        }),
  });
  if (opts?.seal !== false) {
    const key = await getSigningKeyLoader().load(TS);
    rec = { ...rec, seal: sealRecord(rec, key, TS) };
    if (opts?.tamper) {
      // Mutate an entry AFTER sealing → the seal no longer matches the live entries.
      const entries = rec.entries.map((e) =>
        e.type === 'recovery' ? { ...e, taskDelta: 999999 } : e
      );
      rec = { ...rec, entries };
    }
  }
  await getEvidenceStore().save(rec);
  return { recordId, recoveryId, memberId };
}

function post(recoveryId: string, decision: unknown): Promise<Response> {
  const req = new NextRequest(`http://localhost/api/recovery/${recoveryId}/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision }),
  });
  return POST(req, { params: Promise.resolve({ id: recoveryId }) }) as unknown as Promise<Response>;
}

async function load(recordId: string): Promise<EvidenceRecord> {
  const r = await getEvidenceStore().get(recordId);
  if (!r) throw new Error('record missing');
  return r;
}

const countType = (r: EvidenceRecord, t: string): number =>
  r.entries.filter((e) => e.type === t).length;

const sampleTask = (): RecoveryTask => ({
  claimId: 'c',
  remittanceId: 'r',
  authId: 'a',
  delta: 1,
  evidenceTier: 'D1',
  priority: 'routine',
});

beforeEach(() => {
  process.env.NEXT_PUBLIC_FLAG_GOLDEN_THREAD_E2E = 'true';
  h.session.authenticated = true;
  h.session.role = 'pa-reviewer';
  h.session.fhirUser = 'Practitioner/rev-1';
  h.session.patient = 'MARIA_SD_001';
  h.session.tenantId = undefined;
  h.session.tenantIds = undefined;
  resetDefaultIdempotencyStore();
  clearSessionDataModes();
});

afterEach(() => {
  clearSessionDataModes();
  setProductionEvidenceStoreFactory(null); // undo any per-test store wrapper
  delete process.env.NEXT_PUBLIC_FLAG_GOLDEN_THREAD_E2E;
});

function withUnrelated(rec: EvidenceRecord, id: string): EvidenceRecord {
  return recordReconciliation(rec, {
    id,
    ts: TS,
    verdict: 'matched',
    contractedAllowed: 100,
    paidAmount: 100,
    delta: 0,
    toleranceApplied: 0,
  });
}

describe('qualified-human APPROVE — governed submission exactly once + re-seal', () => {
  it('appends ONE submission + recovery-decision(submitted) and the record stays intact&&signed', async () => {
    const { recordId, recoveryId } = await seed();
    const res = await post(recoveryId, 'approved');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      outcome: string;
      submissionRef: string;
      workItemId: string;
    };
    expect(body.outcome).toBe('submitted');
    expect(body.submissionRef).toBeTruthy();
    // FIX-1 (PHI-in-DOM): the submissionRef reaches the client and is RENDERED. The seed's
    // taskClaimId is the member-embedding `ev-<memberId>-…-claim`, so assert the returned ref
    // carries NO member substring (the claim portion is minted PHI-safe at the source).
    expect(body.submissionRef).not.toContain('MARIA_SD_001');
    expect(body.workItemId).toBe(recoveryId);

    const rec = await load(recordId);
    expect(countType(rec, 'submission')).toBe(1);
    expect(countType(rec, 'recovery-decision')).toBe(1);
    const marker = latestOfType(rec, 'recovery-decision');
    expect(marker?.status).toBe('submitted');
    expect(marker?.decidedBy).toBe('Practitioner/rev-1');
    const key = await getSigningKeyLoader().load(TS);
    const v = verifyLedgerIntegrity(rec, rec.seal!, key);
    expect(v.intact && v.signed).toBe(true);
    const submission = rec.entries.find((e) => e.type === 'submission') as { channel: string };
    expect(submission.channel).toBe('mock');
  });

  it('no double-draft-on-resume: exactly ONE recovery entry after the decision run', async () => {
    const { recordId, recoveryId } = await seed();
    await post(recoveryId, 'approved');
    const rec = await load(recordId);
    expect(countType(rec, 'recovery')).toBe(1);
  });

  it('the submission does NOT lift the authority tier (action record, not evidence strength)', async () => {
    let rec = createEvidenceRecord({
      id: 'ev-tier',
      memberId: 'M',
      order: { code: '72148' },
      createdAt: TS,
    });
    rec = recordRecovery(rec, {
      id: 'ev-tier-recovery',
      ts: TS,
      action: 'draft-appeal',
      rung: 'A1',
    });
    const before = computeProcessTier(rec); // recovery is D3 → tier D3
    rec = recordSubmission(rec, {
      recoveryId: 'ev-tier-recovery',
      ts: TS,
      submissionRef: 'appeal-mock::c::r',
      submittedAt: TS,
      decidedBy: 'Practitioner/rev-1',
      rung: 'A1',
    });
    expect(computeProcessTier(rec)).toBe(before); // submission (D3) never lifts the tier
  });
});

describe('qualified-human REJECT — terminal, no submission, drops from the queue', () => {
  it('records recovery-decision(rejected), writes NO submission, and the work item disappears', async () => {
    const { recordId, recoveryId } = await seed();
    const res = await post(recoveryId, 'rejected');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { outcome: string; submissionRef?: string };
    expect(body.outcome).toBe('rejected');
    expect(body.submissionRef).toBeUndefined();

    const rec = await load(recordId);
    expect(countType(rec, 'submission')).toBe(0);
    expect(latestOfType(rec, 'recovery-decision')?.status).toBe('rejected');
    expect(recoveryReviewItem(rec)).toBeUndefined();
    expect(overdueRecoveryItems([rec], '2030-01-01T00:00:00.000Z')).toHaveLength(0);
  });
});

describe('a system / autonomy decider is BLOCKED (403, no submit)', () => {
  it('a `system` principal at HITL → 403 and no submission', async () => {
    const { recordId, recoveryId } = await seed();
    h.session.fhirUser = 'system'; // principal.userId === 'system' (role stays pa-reviewer)
    const res = await post(recoveryId, 'approved');
    expect(res.status).toBe(403);
    expect(countType(await load(recordId), 'submission')).toBe(0);
  });

  it('an `autonomy:*` principal → 403 and no submission', async () => {
    const { recordId, recoveryId } = await seed();
    h.session.fhirUser = 'autonomy:autonomous';
    const res = await post(recoveryId, 'approved');
    expect(res.status).toBe(403);
    expect(countType(await load(recordId), 'submission')).toBe(0);
  });

  it('manifest forced AUTONOMOUS → the workflow still SUSPENDS and a system signal never submits', async () => {
    const rt = runtimeWithRegistry(registryWithTier(REVENUE_CYCLE_AGENT_ID, 'autonomous'));
    const submitAppeal = vi.fn(async () => ({ submissionRef: 'should-never-run' }));
    const wf = createRecoveryWorkflow({
      async recordDraft() {
        return { recoveryRef: 'r' };
      },
      submitAppeal,
    });
    const task = sampleTask();
    const workflowId = 'auto::wf';
    const handle = rt.engine.start(wf, { memberId: 'M', input: task, workflowId });
    await waitFor(() => rt.engine.query(workflowId)?.status === 'waiting-decision', 'suspended');
    expect(submitAppeal).not.toHaveBeenCalled(); // no auto-submit at autonomous tier
    const proposalId = rt.engine.query(workflowId)!.awaitingProposalId!;
    await rt.engine.signal(workflowId, {
      name: 'agent.task.approved',
      proposalId,
      decidedBy: 'autonomy:autonomous',
    });
    await expect(handle.done).rejects.toThrow();
    expect(submitAppeal).not.toHaveBeenCalled();
  });
});

describe('submission is UNREACHABLE pre-approval', () => {
  it('while waiting-decision the workflow has NOT called submitAppeal', async () => {
    const rt = runtimeWithRegistry(registryWithTier(REVENUE_CYCLE_AGENT_ID, 'HITL'));
    const submitAppeal = vi.fn(async () => ({ submissionRef: 'x' }));
    const wf = createRecoveryWorkflow({
      async recordDraft() {
        return { recoveryRef: 'r' };
      },
      submitAppeal,
    });
    const task = sampleTask();
    rt.engine.start(wf, { memberId: 'M', input: task, workflowId: 'pre::wf' });
    await waitFor(() => rt.engine.query('pre::wf')?.status === 'waiting-decision', 'suspended');
    expect(submitAppeal).not.toHaveBeenCalled();
  });
});

describe('deterministic proposalId targeting', () => {
  it('a fresh engine re-executes to awaitingProposalId === `${recoveryId}::wf::p0`', async () => {
    const rt = runtimeWithRegistry(registryWithTier(REVENUE_CYCLE_AGENT_ID, 'HITL'));
    const wf = createRecoveryWorkflow({
      async recordDraft() {
        return { recoveryRef: 'r' };
      },
      submitAppeal: async () => ({ submissionRef: 'x' }),
    });
    const recoveryId = 'ev-M-72148-42-recovery';
    const workflowId = `${recoveryId}::wf`;
    const task = sampleTask();
    rt.engine.start(wf, { memberId: 'M', input: task, workflowId });
    await waitFor(() => rt.engine.query(workflowId)?.status === 'waiting-decision', 'suspended');
    expect(rt.engine.query(workflowId)?.awaitingProposalId).toBe(`${workflowId}::p0`);
  });
});

describe('exactly-once', () => {
  it('two concurrent approves → exactly ONE submission entry', async () => {
    const { recordId, recoveryId } = await seed();
    const [a, b] = await Promise.all([post(recoveryId, 'approved'), post(recoveryId, 'approved')]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const rec = await load(recordId);
    expect(countType(rec, 'submission')).toBe(1);
    expect(countType(rec, 'recovery-decision')).toBe(1);
  });

  it('terminal short-circuit: a second approve returns an idempotent 200 with no second submission', async () => {
    const { recordId, recoveryId } = await seed();
    const first = (await (await post(recoveryId, 'approved')).json()) as { submissionRef: string };
    const res2 = await post(recoveryId, 'approved');
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { outcome: string; submissionRef: string };
    expect(body2.outcome).toBe('submitted');
    expect(body2.submissionRef).toBe(first.submissionRef);
    expect(countType(await load(recordId), 'submission')).toBe(1);
  });
});

describe('fail-closed gates', () => {
  it('flag off → 404', async () => {
    const { recoveryId } = await seed();
    process.env.NEXT_PUBLIC_FLAG_GOLDEN_THREAD_E2E = 'false';
    expect((await post(recoveryId, 'approved')).status).toBe(404);
  });

  it('unauthenticated → 401', async () => {
    const { recoveryId } = await seed();
    h.session.authenticated = false;
    expect((await post(recoveryId, 'approved')).status).toBe(401);
  });

  it('non-reviewer role → 403', async () => {
    const { recoveryId, recordId } = await seed();
    h.session.role = 'member';
    h.session.fhirUser = 'Patient/MARIA_SD_001';
    expect((await post(recoveryId, 'approved')).status).toBe(403);
    expect(countType(await load(recordId), 'submission')).toBe(0);
  });

  it('a malformed id (no -recovery suffix / bad shape) → 400, never reaching the store', async () => {
    expect((await post('ev-MARIA_SD_001-72148-1', 'approved')).status).toBe(400);
    expect((await post('bad id !!', 'approved')).status).toBe(400);
  });

  it('an unknown recovery id → 404', async () => {
    expect((await post('ev-NOBODY-72148-999-recovery', 'approved')).status).toBe(404);
  });

  it('an invalid decision body → 400', async () => {
    const { recoveryId } = await seed();
    expect((await post(recoveryId, 'maybe')).status).toBe(400);
  });

  it('verify-before-reseal: a tampered stored record → 409 and no submission', async () => {
    const { recordId, recoveryId } = await seed({ tamper: true });
    const res = await post(recoveryId, 'approved');
    expect(res.status).toBe(409);
    expect(countType(await load(recordId), 'submission')).toBe(0);
  });

  it('timely-filing: an APPROVE past the filing deadline → 409 and no submission', async () => {
    const { recordId, recoveryId } = await seed({ filingDeadline: PAST_DEADLINE });
    const res = await post(recoveryId, 'approved');
    expect(res.status).toBe(409);
    expect(countType(await load(recordId), 'submission')).toBe(0);
  });

  it('timely-filing: a REJECT past the deadline is still allowed (terminal, no submission)', async () => {
    const { recordId, recoveryId } = await seed({ filingDeadline: PAST_DEADLINE });
    const res = await post(recoveryId, 'rejected');
    expect(res.status).toBe(200);
    expect(latestOfType(await load(recordId), 'recovery-decision')?.status).toBe('rejected');
  });

  it('unreconstructable task (draft persisted without task fields) → 409', async () => {
    const { recoveryId } = await seed({ omitTaskFields: true });
    expect((await post(recoveryId, 'approved')).status).toBe(409);
  });
});

describe('tenancy', () => {
  it('a reviewer outside the member tenant → 403 and no submission', async () => {
    setSessionDataMode('tenancy', 'production');
    const { recordId, recoveryId } = await seed({ memberId: 'EVREC_TEN_001' });
    h.session.fhirUser = 'Practitioner/rev-out';
    h.session.tenantId = 'tenant:OtherPayer'; // does not match the member's resolved tenant
    const res = await post(recoveryId, 'approved');
    expect(res.status).toBe(403);
    expect(countType(await load(recordId), 'submission')).toBe(0);
  });
});

describe('concurrency: no-clobber + lost-update (Finding 4)', () => {
  it('(i) a decision that is ALREADY terminal returns idempotent already-done and does NOT clobber a concurrent append', async () => {
    const { recordId, recoveryId } = await seed();
    const first = (await (await post(recoveryId, 'approved')).json()) as { submissionRef: string };

    // A concurrent writer appends + re-seals an UNRELATED entry (verify-before-reseal passes).
    const store = getEvidenceStore();
    const key = await getSigningKeyLoader().load(TS);
    let concurrent = withUnrelated(await load(recordId), `${recordId}-concurrent-after`);
    concurrent = { ...concurrent, seal: sealRecord(concurrent, key, TS) };
    await store.save(concurrent);

    const res2 = await post(recoveryId, 'approved');
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { outcome: string; submissionRef: string };
    expect(body2.outcome).toBe('submitted');
    expect(body2.submissionRef).toBe(first.submissionRef);

    const rec = await load(recordId);
    expect(countType(rec, 'submission')).toBe(1); // no second submission
    expect(countType(rec, 'recovery-decision')).toBe(1); // no second terminal
    expect(rec.entries.some((e) => e.id === `${recordId}-concurrent-after`)).toBe(true); // preserved
  });

  it('(ii) a concurrent UNRELATED append made between load and save is preserved through the decision save', async () => {
    // The route's re-read-latest (2nd get) returns a record with an extra UNRELATED entry.
    const base = createInMemoryEvidenceStore();
    let getCount = 0;
    let injected = false;
    const wrapped: EvidenceStore = {
      save: (r) => base.save(r),
      list: () => base.list(),
      async get(id) {
        getCount += 1;
        const r = await base.get(id);
        if (r && getCount === 2 && !injected) {
          injected = true;
          // C3: a REAL concurrent writer re-seals over its append (verify-before-reseal on the
          // re-read latest requires the seal to cover the live entries).
          const appended = withUnrelated(r, `${id}-concurrent-mid`);
          const key = await getSigningKeyLoader().load(TS);
          const concurrent = { ...appended, seal: sealRecord(appended, key, TS) };
          await base.save(concurrent);
          return concurrent;
        }
        return r;
      },
    };
    setProductionEvidenceStoreFactory(() => wrapped);
    setSessionDataMode('evidence', 'production');

    const { recordId, recoveryId } = await seed();
    const res = await post(recoveryId, 'approved');
    expect(res.status).toBe(200);

    const rec = await load(recordId);
    expect(rec.entries.some((e) => e.id === `${recordId}-concurrent-mid`)).toBe(true);
    expect(countType(rec, 'submission')).toBe(1);
    expect(countType(rec, 'recovery-decision')).toBe(1);
    const key = await getSigningKeyLoader().load(TS);
    const v = verifyLedgerIntegrity(rec, rec.seal!, key);
    expect(v.intact && v.signed).toBe(true);
  });
});
