import { describe, it, expect } from 'vitest';
import {
  createEvidenceRecord,
  recordRecovery,
  recordSubmission,
  recordRecoveryTerminal,
  hasEntryId,
  latestOfType,
  computeProcessTier,
  tierOfEntry,
  toAuditEvents,
  type EvidenceRecord,
} from '@/lib/evidence';
import { assertPhiSafe } from '@/lib/server/audit';

/**
 * Wave-4 governed-submission recorders: the persisted RecoveryTask on the draft
 * (must-fix 3), the id-idempotent submission recorder (must-fix 1), the terminal
 * lifecycle marker (must-fix 4), the tier discipline (a submission never lifts the
 * authority tier), and PHI-safe audit projection for the new variants.
 */
function baseRecord(): EvidenceRecord {
  return createEvidenceRecord({
    id: 'ev-sub-1',
    memberId: 'MARIA_SD_001',
    order: { code: '72148', display: 'MRI lumbar', providerNpi: '1730154782' },
    createdAt: '2026-09-12T00:00:00.000Z',
  });
}

const ts = '2026-09-12T00:01:00.000Z';

describe('recordRecovery persists the PHI-safe RecoveryTask on the draft (must-fix 3)', () => {
  it('stamps the task refs/amount/tier so the decision route reads them (never re-derives)', () => {
    const r = recordRecovery(baseRecord(), {
      id: 'rec-1',
      ts,
      action: 'draft-appeal',
      rung: 'A1',
      remittanceId: 'rem-7',
      taskClaimId: 'claim-7',
      taskAuthId: 'auth-7',
      taskDelta: 4250,
      taskEvidenceTier: 'D3',
    });
    const e = latestOfType(r, 'recovery');
    expect(e?.taskClaimId).toBe('claim-7');
    expect(e?.taskAuthId).toBe('auth-7');
    expect(e?.taskDelta).toBe(4250);
    expect(e?.taskEvidenceTier).toBe('D3');
    expect(e?.status).toBe('draft');
  });

  it('omits the task fields when not supplied (byte-identical to pre-Wave-4)', () => {
    const r = recordRecovery(baseRecord(), { id: 'rec-1', ts, action: 'draft-appeal', rung: 'A1' });
    const e = latestOfType(r, 'recovery');
    expect(e && 'taskClaimId' in e).toBe(false);
    expect(e && 'taskDelta' in e).toBe(false);
  });
});

describe('recordSubmission is id-idempotent (must-fix 1)', () => {
  const args = {
    recoveryId: 'rec-1',
    ts,
    submissionRef: 'appeal-mock::claim-7::rem-7',
    submittedAt: ts,
    decidedBy: 'reviewer:rn-9',
    rung: 'A1',
    claimId: 'claim-7',
  } as const;

  it('appends a submission entry with the deterministic id `${recoveryId}-submission`', () => {
    const r = recordSubmission(baseRecord(), args);
    expect(hasEntryId(r, 'rec-1-submission')).toBe(true);
    const e = latestOfType(r, 'submission');
    expect(e?.channel).toBe('mock');
    expect(e?.decidedBy).toBe('reviewer:rn-9');
  });

  it('NO-OPS (returns the record unchanged) on a repeat — exactly-once by construction', () => {
    const r1 = recordSubmission(baseRecord(), args);
    const r2 = recordSubmission(r1, args);
    expect(r2).toBe(r1); // same reference, no new entry
    expect(r2.entries.filter((e) => e.type === 'submission')).toHaveLength(1);
  });
});

describe('recordRecoveryTerminal marks the lifecycle terminal on the spine (must-fix 4)', () => {
  it('appends a recovery-decision marker with provenance (who + when), id-idempotent', () => {
    const r1 = recordRecoveryTerminal(baseRecord(), {
      recoveryId: 'rec-1',
      ts,
      status: 'rejected',
      decidedBy: 'reviewer:rn-9',
      decidedAt: ts,
    });
    const e = latestOfType(r1, 'recovery-decision');
    expect(e?.status).toBe('rejected');
    expect(e?.decidedBy).toBe('reviewer:rn-9');
    expect(e?.decidedAt).toBe(ts);
    // Repeat no-ops (a reject is also exactly-once).
    const r2 = recordRecoveryTerminal(r1, {
      recoveryId: 'rec-1',
      ts,
      status: 'rejected',
      decidedBy: 'reviewer:rn-9',
      decidedAt: ts,
    });
    expect(r2).toBe(r1);
  });
});

describe('tier discipline: a submission is an ACTION record, never evidence strength', () => {
  it('a submission entry is D3 but the weakest-link min means it cannot LIFT the tier', () => {
    // A record with a D0 remittance + a D3 submission is still D0 (min), not lifted.
    let r = recordRecovery(baseRecord(), { id: 'rec-1', ts, action: 'draft-appeal', rung: 'A1' });
    const tierWithDraftOnly = computeProcessTier(r);
    r = recordSubmission(r, {
      recoveryId: 'rec-1',
      ts,
      submissionRef: 's',
      submittedAt: ts,
      decidedBy: 'reviewer:rn-9',
      rung: 'A1',
    });
    // Adding the submission (also D3) does not raise the record tier above the draft's.
    expect(computeProcessTier(r)).toBe(tierWithDraftOnly);
    const sub = latestOfType(r, 'submission');
    expect(sub && tierOfEntry(sub)).toBe('D3');
  });
});

describe('PHI-safe audit projection for the new variants', () => {
  it('submission + recovery-decision project to PHI-safe events (refs/channel/status only)', () => {
    let r = recordSubmission(baseRecord(), {
      recoveryId: 'rec-1',
      ts,
      submissionRef: 'appeal-mock::claim-7::rem-7',
      submittedAt: ts,
      decidedBy: 'reviewer:rn-9',
      rung: 'A1',
    });
    r = recordRecoveryTerminal(r, {
      recoveryId: 'rec-1',
      ts,
      status: 'submitted',
      decidedBy: 'reviewer:rn-9',
      decidedAt: ts,
    });
    const events = toAuditEvents(r, 'corr-sub');
    for (const ev of events) expect(() => assertPhiSafe(ev)).not.toThrow();
    expect(events.find((e) => e.action === 'evidence.submission')?.detail).toContain(
      'channel=mock'
    );
    expect(events.find((e) => e.action === 'evidence.recovery-decision')?.detail).toContain(
      'recovery-decision=submitted'
    );
  });
});
