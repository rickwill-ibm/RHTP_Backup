import { describe, it, expect } from 'vitest';
import {
  createEvidenceRecord,
  recordPasDecision,
  recordClaimSubmission,
  recordRemittance,
  recordReconciliation,
  recordRecovery,
  latestOfType,
  toAuditEvents,
  type EvidenceRecord,
} from '@/lib/evidence';
import { assertPhiSafe } from '@/lib/server/audit';

/**
 * Wave-1 evidence-spine extension: append-only preserved for the new variants,
 * caller-supplied authId threading, 'exempt' distinct from 'approved', correct
 * stage/type per recorder, and PHI-safe audit projection for each new type.
 */
function baseRecord(): EvidenceRecord {
  return createEvidenceRecord({
    id: 'ev-spine-1',
    memberId: 'MARIA_SD_001',
    order: { code: '72148', display: 'MRI lumbar', providerNpi: '1730154783' },
    createdAt: '2026-08-25T00:00:00.000Z',
  });
}

const ts = '2026-08-25T00:01:00.000Z';

describe('append-only immutability preserved for new variants', () => {
  it('each recorder returns a NEW record and never mutates the input', () => {
    const r0 = baseRecord();
    const r1 = recordClaimSubmission(r0, { id: 'c1', ts, claimId: 'CL-1', claimRef: 'C-1', total: 200 });
    expect(r0.entries.length).toBe(0);
    expect(r1.entries.length).toBe(1);
    expect(r1).not.toBe(r0);
    expect(r1.entries).not.toBe(r0.entries);
  });
});

describe('recordPasDecision — authId threading + exempt distinct from approved', () => {
  it('threads the caller-supplied authId onto the entry (not minted here)', () => {
    const r = recordPasDecision(baseRecord(), { id: 'd1', ts, authId: 'AUTH-777', decision: 'approved' });
    const e = latestOfType(r, 'pas-decision');
    expect(e?.authId).toBe('AUTH-777');
    expect(e?.stage).toBe('prior-auth');
    expect(e?.decision).toBe('approved');
  });

  it("'exempt' is a DISTINCT decision value, never collapsed into 'approved'", () => {
    const r = recordPasDecision(baseRecord(), { id: 'd2', ts, authId: 'AUTH-9', decision: 'exempt' });
    const e = latestOfType(r, 'pas-decision');
    expect(e?.decision).toBe('exempt');
    expect(e?.decision).not.toBe('approved');
    const ev = toAuditEvents(r, 'corr-1').find((x) => x.action === 'evidence.pas-decision');
    expect(ev?.detail).toContain('decision=exempt');
    expect(ev?.detail).not.toContain('decision=approved');
  });
});

describe('each new recorder appends the right stage/type', () => {
  it('recordClaimSubmission → stage claim / type claim-submission', () => {
    const r = recordClaimSubmission(baseRecord(), {
      id: 'c1',
      ts,
      orderId: 'O-1',
      authId: 'A-1',
      claimId: 'CL-1',
      claimRef: 'C-1',
      total: 200,
    });
    const e = latestOfType(r, 'claim-submission');
    expect(e?.stage).toBe('claim');
    expect(e?.claimRef).toBe('C-1');
    expect(e?.total).toBe(200);
    expect(e?.orderId).toBe('O-1');
    expect(e?.claimId).toBe('CL-1');
  });

  it('recordReconciliation → stage reconciliation, records verdict/delta/tolerance', () => {
    const r = recordReconciliation(baseRecord(), {
      id: 'rc1',
      ts,
      verdict: 'underpaid',
      contractedAllowed: 200,
      paidAmount: 120,
      delta: 80,
      toleranceApplied: 5,
      claimId: 'CL-1',
      remittanceId: 'RA-1',
    });
    const e = latestOfType(r, 'reconciliation');
    expect(e?.stage).toBe('reconciliation');
    expect(e?.verdict).toBe('underpaid');
    expect(e?.delta).toBe(80);
    expect(e?.toleranceApplied).toBe(5);
  });

  it('recordRecovery → stage recovery, status always draft', () => {
    const r = recordRecovery(baseRecord(), { id: 'rv1', ts, action: 'draft-appeal', rung: 'A2', remittanceId: 'RA-1' });
    const e = latestOfType(r, 'recovery');
    expect(e?.stage).toBe('recovery');
    expect(e?.status).toBe('draft');
    expect(e?.action).toBe('draft-appeal');
    expect(e?.rung).toBe('A2');
  });
});

describe('recordRemittance — preserves per-group adjustment amounts', () => {
  it('keeps each adjustment group and amount intact', () => {
    const r = recordRemittance(baseRecord(), {
      id: 'rm1',
      ts,
      claimId: 'CL-1',
      remittanceId: 'RA-1',
      paidAmount: 120,
      adjustments: [
        { group: 'CO', amount: 45 },
        { group: 'PR', amount: 30 },
        { group: 'OA', amount: 5 },
      ],
      carcCodes: ['45', '253'],
      rarcCodes: ['N130'],
      carcGroups: ['CO', 'PR', 'OA'],
    });
    const e = latestOfType(r, 'remittance');
    expect(e?.stage).toBe('remittance');
    expect(e?.paidAmount).toBe(120);
    expect(e?.adjustments).toEqual([
      { group: 'CO', amount: 45 },
      { group: 'PR', amount: 30 },
      { group: 'OA', amount: 5 },
    ]);
    // per-group amounts individually addressable (FIX-2 reconciliation depends on this)
    const pr = e?.adjustments.find((a) => a.group === 'PR');
    expect(pr?.amount).toBe(30);
    expect(e?.carcCodes).toEqual(['45', '253']);
  });
});

describe('toAuditEvents — PHI-safe detail for each new type', () => {
  it('emits refs/codes/amounts only and passes the PHI gate', () => {
    let r = baseRecord();
    r = recordClaimSubmission(r, { id: 'c1', ts, claimId: 'CL-1', claimRef: 'C-1', total: 200 });
    r = recordRemittance(r, {
      id: 'rm1',
      ts,
      remittanceId: 'RA-1',
      paidAmount: 120,
      adjustments: [{ group: 'CO', amount: 45 }],
      carcCodes: ['45'],
      rarcCodes: ['N130'],
      carcGroups: ['CO'],
    });
    r = recordReconciliation(r, {
      id: 'rc1',
      ts,
      verdict: 'underpaid',
      contractedAllowed: 200,
      paidAmount: 120,
      delta: 80,
      toleranceApplied: 5,
    });
    r = recordPasDecision(r, { id: 'd1', ts, authId: 'A-1', decision: 'exempt' });
    r = recordRecovery(r, { id: 'rv1', ts, action: 'draft-appeal', rung: 'A2' });

    const events = toAuditEvents(r, 'corr-1');
    expect(events.length).toBe(5);
    for (const ev of events) {
      expect(ev.action).toMatch(/^evidence\./);
      expect(ev.correlationId).toBe('corr-1');
      // no member free-text (the record carries only refs/codes/amounts)
      expect(ev.detail).not.toContain('MARIA_SD_001');
      expect(() => assertPhiSafe(ev)).not.toThrow();
    }
    const recon = events.find((e) => e.action === 'evidence.reconciliation');
    expect(recon?.detail).toContain('verdict=underpaid');
    expect(recon?.detail).toContain('delta=80');
  });
});
