/**
 * recoveryDecisionSupport.test.ts — E13 test-link + behavior for the helpers extracted
 * from the recovery decision route (Wave-5 size split). `terminalOutcome` reads the
 * exactly-once short-circuit; `runReconstructAndSignal` re-executes the deterministic
 * workflow and signals the qualified-human decision (covered end-to-end by the route
 * test — here we cover the pure read directly and assert the module's shape).
 */
import { describe, it, expect } from 'vitest';
import { createEvidenceRecord } from '@/lib/evidence';
import { recordRecoveryTerminal, recordSubmission } from '@/lib/evidence';
import {
  terminalOutcome,
  runReconstructAndSignal,
} from '@/app/api/recovery/[id]/decisionSupport';

const REC = 'ev-M-1-72148-1-recovery';

function base() {
  return createEvidenceRecord({
    id: 'ev-M-1-72148-1',
    memberId: 'M-1',
    order: { code: '72148' },
    createdAt: '2026-08-30T00:00:00.000Z',
  });
}

describe('terminalOutcome', () => {
  it('returns null when no recovery-decision marker exists', () => {
    expect(terminalOutcome(base(), REC)).toBeNull();
  });

  it('reports a rejected terminal (no submission ref)', () => {
    const rec = recordRecoveryTerminal(base(), {
      recoveryId: REC,
      ts: '2026-08-30T00:00:00.000Z',
      status: 'rejected',
      decidedBy: 'reviewer-1',
      decidedAt: '2026-08-30T00:00:00.000Z',
    });
    expect(terminalOutcome(rec, REC)).toEqual({ outcome: 'rejected' });
  });

  it('reports a submitted terminal with the submission ref', () => {
    let rec = recordSubmission(base(), {
      recoveryId: REC,
      ts: '2026-08-30T00:00:00.000Z',
      submissionRef: 'SUB-1',
      submittedAt: '2026-08-30T00:00:00.000Z',
      decidedBy: 'reviewer-1',
      rung: 'A1',
      channel: 'mock',
      claimId: 'CLM-1',
      remittanceId: 'RA-1',
      authId: 'AUTH-1',
      actor: 'revenue-cycle-agent',
    });
    rec = recordRecoveryTerminal(rec, {
      recoveryId: REC,
      ts: '2026-08-30T00:00:00.000Z',
      status: 'submitted',
      decidedBy: 'reviewer-1',
      decidedAt: '2026-08-30T00:00:00.000Z',
    });
    expect(terminalOutcome(rec, REC)).toEqual({ outcome: 'submitted', submissionRef: 'SUB-1' });
  });
});

describe('runReconstructAndSignal', () => {
  it('is exported as a function (end-to-end behavior covered by the route test)', () => {
    expect(typeof runReconstructAndSignal).toBe('function');
  });
});
