/**
 * Wave-11 — `recoveryGuards.verifyLedgerAtRead` (the shared verify-before-reseal guard used
 * by both recovery routes, C3). Proves: unsealed → ok (skip); a sealed record intact&&signed
 * → ok; a record tampered after sealing → not-ok with kind 'tamper' (the route maps it 409).
 */
import { describe, it, expect } from 'vitest';
import {
  createEvidenceRecord,
  recordRecovery,
  sealRecord,
  type EvidenceRecord,
} from '@/lib/evidence';
import { getSigningKeyLoader } from '@/lib/dataSources/signingKey';
import { verifyLedgerAtRead } from '@/app/api/recovery/[id]/recoveryGuards';

const TS = '2026-09-01T00:00:00.000Z';

function draft(): EvidenceRecord {
  let r = createEvidenceRecord({
    id: 'ev-M-72148-1',
    memberId: 'M',
    order: { code: '72148' },
    createdAt: TS,
  });
  r = recordRecovery(r, {
    id: 'ev-M-72148-1-recovery',
    ts: TS,
    action: 'draft-appeal',
    rung: 'A1',
    taskEvidenceTier: 'D3',
  });
  return r;
}

describe('verifyLedgerAtRead', () => {
  it('an UNSEALED record → ok (verification is skipped)', async () => {
    expect(await verifyLedgerAtRead(draft(), TS)).toEqual({ ok: true });
  });

  it('a SEALED, intact record → ok', async () => {
    const key = await getSigningKeyLoader().load(TS);
    const clean = draft();
    const sealed = { ...clean, seal: sealRecord(clean, key, TS) };
    expect(await verifyLedgerAtRead(sealed, TS)).toEqual({ ok: true });
  });

  it('a record TAMPERED after sealing → not ok, kind=tamper', async () => {
    const key = await getSigningKeyLoader().load(TS);
    const clean = draft();
    const sealed: EvidenceRecord = { ...clean, seal: sealRecord(clean, key, TS) };
    const tampered: EvidenceRecord = {
      ...sealed,
      entries: sealed.entries.map((e) => (e.type === 'recovery' ? { ...e, rung: 'A3' } : e)),
    };
    expect(await verifyLedgerAtRead(tampered, TS)).toEqual({ ok: false, kind: 'tamper' });
  });
});
