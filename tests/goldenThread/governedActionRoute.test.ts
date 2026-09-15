/**
 * Wave-9 — the governed-action route (POST /api/recovery/:id/action).
 *
 * Proves the E14 wired path against the REAL runtime + evidence spine (no fakes),
 * MIRRORING the recovery-decision route's gates:
 *  - a qualified-human APPROVE of a payer-facing X12 executes the MOCK exactly once and
 *    appends the durable lifecycle (proposed → approved → executed) + re-seals;
 *  - a REJECT appends proposed → rejected, no execution;
 *  - an internal ticket-update executes with no gateway;
 *  - a system/autonomy decider is BLOCKED (403, nothing written) — no auto-execute of a
 *    payer-facing X12 without a qualified human;
 *  - exactly-once under two concurrent approves + a terminal short-circuit;
 *  - flag-off (404), auth (401), role (403), tenancy (403), verify-before-reseal (409),
 *    invalid action/decision/id (400), unknown record (404).
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

import { POST } from '@/app/api/recovery/[id]/action/route';
import { NextRequest } from 'next/server';
import {
  createEvidenceRecord,
  recordRecovery,
  sealRecord,
  verifyLedgerIntegrity,
  type EvidenceRecord,
} from '@/lib/evidence';
import { getEvidenceStore, setProductionEvidenceStoreFactory } from '@/lib/evidence/store';
import { getSigningKeyLoader } from '@/lib/dataSources/signingKey';
import { REVENUE_CYCLE_AGENT_ID } from '@/lib/agents/revenueCycle';
import { setSessionDataMode, clearSessionDataModes } from '@/lib/config/dataMode';

process.env.AUDIT_LOG_DIR = path.join(os.tmpdir(), 'rhtp-recovery-action-audit');

const TS = '2026-09-01T00:00:00.000Z';
let seq = 0;

interface Seeded {
  recordId: string;
  recoveryId: string;
}

async function seed(opts?: {
  seal?: boolean;
  memberId?: string;
  tamper?: boolean;
}): Promise<Seeded> {
  const memberId = opts?.memberId ?? 'MARIA_SD_001';
  const recordId = `ev-${memberId}-72148-${2000 + seq++}`;
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
    priority: 'high',
    actor: REVENUE_CYCLE_AGENT_ID,
    taskClaimId: `${recordId}-claim`,
    taskAuthId: `auth-${memberId}-72148`,
    taskDelta: 1234,
    taskEvidenceTier: 'D3',
  });
  if (opts?.seal !== false) {
    const key = await getSigningKeyLoader().load(TS);
    rec = { ...rec, seal: sealRecord(rec, key, TS) };
    if (opts?.tamper) {
      const entries = rec.entries.map((e) =>
        e.type === 'recovery' ? { ...e, taskDelta: 999999 } : e
      );
      rec = { ...rec, entries };
    }
  }
  await getEvidenceStore().save(rec);
  return { recordId, recoveryId };
}

function post(recoveryId: string, actionType: unknown, decision: unknown): Promise<Response> {
  const req = new NextRequest(`http://localhost/api/recovery/${recoveryId}/action`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ actionType, decision }),
  });
  return POST(req, { params: Promise.resolve({ id: recoveryId }) }) as unknown as Promise<Response>;
}

async function load(recordId: string): Promise<EvidenceRecord> {
  const r = await getEvidenceStore().get(recordId);
  if (!r) throw new Error('record missing');
  return r;
}

const countStage = (r: EvidenceRecord, status: string): number =>
  r.entries.filter((e) => e.type === 'governed-action' && e.status === status).length;

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

describe('qualified-human APPROVE of a payer-facing X12 — mock exec + durable lifecycle', () => {
  it('executes once, appends proposed→approved→executed, stays intact&&signed', async () => {
    const { recordId, recoveryId } = await seed();
    const res = await post(recoveryId, 'x12-278', 'approved');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      outcome: string;
      ref: string;
      isSubmission: boolean;
      workItemId: string;
    };
    expect(body.outcome).toBe('executed');
    expect(body.isSubmission).toBe(true);
    expect(body.ref).toBeTruthy();
    expect(body.workItemId).toBe(recoveryId);

    const rec = await load(recordId);
    expect(countStage(rec, 'proposed')).toBe(1);
    expect(countStage(rec, 'approved')).toBe(1);
    expect(countStage(rec, 'executed')).toBe(1);
    const exec = rec.entries.find(
      (e) => e.type === 'governed-action' && e.status === 'executed'
    ) as {
      channel: string;
      decidedBy: string;
    };
    expect(exec.channel).toBe('mock'); // not-transmitted
    expect(exec.decidedBy).toBe('Practitioner/rev-1'); // provenance

    const key = await getSigningKeyLoader().load(TS);
    expect(verifyLedgerIntegrity(rec, rec.seal!, key).intact).toBe(true);
  });

  it('an internal ticket-update executes with NO gateway', async () => {
    const { recordId, recoveryId } = await seed();
    const res = await post(recoveryId, 'ticket-update', 'approved');
    expect(res.status).toBe(200);
    expect((await res.json()).outcome).toBe('executed');
    expect(countStage(await load(recordId), 'executed')).toBe(1);
  });
});

describe('qualified-human REJECT — terminal, no execution', () => {
  it('appends proposed→rejected, writes no executed entry', async () => {
    const { recordId, recoveryId } = await seed();
    const res = await post(recoveryId, 'appeal', 'rejected');
    expect(res.status).toBe(200);
    expect((await res.json()).outcome).toBe('rejected');
    const rec = await load(recordId);
    expect(countStage(rec, 'rejected')).toBe(1);
    expect(countStage(rec, 'executed')).toBe(0);
  });
});

describe('a system / autonomy decider is BLOCKED (403, nothing written)', () => {
  it('a `system` principal → 403 and no governed-action entry', async () => {
    const { recordId, recoveryId } = await seed();
    h.session.fhirUser = 'system';
    expect((await post(recoveryId, 'x12-278', 'approved')).status).toBe(403);
    expect(countStage(await load(recordId), 'executed')).toBe(0);
    expect(countStage(await load(recordId), 'proposed')).toBe(0);
  });

  it('an `autonomy:*` principal → 403', async () => {
    const { recoveryId } = await seed();
    h.session.fhirUser = 'autonomy:autonomous';
    expect((await post(recoveryId, 'appeal', 'approved')).status).toBe(403);
  });
});

describe('exactly-once', () => {
  it('two concurrent approves → exactly ONE executed entry', async () => {
    const { recordId, recoveryId } = await seed();
    const [a, b] = await Promise.all([
      post(recoveryId, 'x12-278', 'approved'),
      post(recoveryId, 'x12-278', 'approved'),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(countStage(await load(recordId), 'executed')).toBe(1);
  });

  it('terminal short-circuit: a second approve returns idempotent 200, no second executed', async () => {
    const { recordId, recoveryId } = await seed();
    const first = (await (await post(recoveryId, 'x12-278', 'approved')).json()) as { ref: string };
    const res2 = await post(recoveryId, 'x12-278', 'approved');
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { outcome: string; ref: string };
    expect(body2.outcome).toBe('executed');
    expect(body2.ref).toBe(first.ref);
    expect(countStage(await load(recordId), 'executed')).toBe(1);
  });

  it('distinct action types are independent lifecycles on the same record', async () => {
    const { recordId, recoveryId } = await seed();
    await post(recoveryId, 'x12-276', 'approved');
    await post(recoveryId, 'ticket-update', 'approved');
    expect(countStage(await load(recordId), 'executed')).toBe(2);
  });
});

describe('fail-closed gates (mirror the decision route)', () => {
  it('flag off → 404', async () => {
    const { recoveryId } = await seed();
    process.env.NEXT_PUBLIC_FLAG_GOLDEN_THREAD_E2E = 'false';
    expect((await post(recoveryId, 'x12-278', 'approved')).status).toBe(404);
  });

  it('unauthenticated → 401', async () => {
    const { recoveryId } = await seed();
    h.session.authenticated = false;
    expect((await post(recoveryId, 'x12-278', 'approved')).status).toBe(401);
  });

  it('non-reviewer role → 403', async () => {
    const { recordId, recoveryId } = await seed();
    h.session.role = 'member';
    h.session.fhirUser = 'Patient/MARIA_SD_001';
    expect((await post(recoveryId, 'x12-278', 'approved')).status).toBe(403);
    expect(countStage(await load(recordId), 'executed')).toBe(0);
  });

  it('an invalid actionType → 400', async () => {
    const { recoveryId } = await seed();
    expect((await post(recoveryId, 'x12-999', 'approved')).status).toBe(400);
  });

  it('an invalid decision → 400', async () => {
    const { recoveryId } = await seed();
    expect((await post(recoveryId, 'x12-278', 'maybe')).status).toBe(400);
  });

  it('a malformed id (no -recovery suffix / bad shape) → 400', async () => {
    expect((await post('ev-MARIA_SD_001-72148-1', 'x12-278', 'approved')).status).toBe(400);
    expect((await post('bad id !!', 'x12-278', 'approved')).status).toBe(400);
  });

  it('an unknown recovery id → 404', async () => {
    expect((await post('ev-NOBODY-72148-999-recovery', 'x12-278', 'approved')).status).toBe(404);
  });

  it('verify-before-reseal: a tampered stored record → 409 and nothing written', async () => {
    const { recordId, recoveryId } = await seed({ tamper: true });
    expect((await post(recoveryId, 'x12-278', 'approved')).status).toBe(409);
    expect(countStage(await load(recordId), 'executed')).toBe(0);
  });
});

describe('tenancy', () => {
  it('a reviewer outside the member tenant → 403 and nothing written', async () => {
    setSessionDataMode('tenancy', 'production');
    const { recordId, recoveryId } = await seed({ memberId: 'EVREC_TEN_001' });
    h.session.fhirUser = 'Practitioner/rev-out';
    h.session.tenantId = 'tenant:OtherPayer';
    expect((await post(recoveryId, 'x12-278', 'approved')).status).toBe(403);
    expect(countStage(await load(recordId), 'executed')).toBe(0);
  });
});
