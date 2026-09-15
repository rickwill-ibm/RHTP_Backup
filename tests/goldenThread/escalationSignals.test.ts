/**
 * escalationSignals.ts — dual-party notification / escalation-gate derivation (Wave-6).
 *
 * Proves the gate is derived from the twin-ladder interlock (not hardcoded), the party
 * notifications match the recovery lifecycle + timely-filing window + integrity state, the
 * derivation is deterministic (now injected), and every message is PHI-safe.
 */
import { describe, it, expect } from 'vitest';
import {
  createEvidenceRecord,
  recordRecovery,
  recordRecoveryTerminal,
  type EvidenceRecord,
} from '@/lib/evidence';
import { deriveEscalationSignals } from '@/lib/goldenThread/escalationSignals';

const MEMBER = 'MARIA_SD_001';
const REC_ID = `ev-${MEMBER}-72148-1756512000000`;
const RECOVERY_ID = `${REC_ID}-recovery`;
const NOW = '2026-06-01T00:00:00.000Z';
const DAY = 86_400_000;

function baseRecord(): EvidenceRecord {
  return createEvidenceRecord({ id: REC_ID, memberId: MEMBER, order: { code: '72148' }, createdAt: NOW });
}

function withDraft(opts: { tier?: 'D0' | 'D1' | 'D2' | 'D3'; filingDeadline?: string } = {}): EvidenceRecord {
  return recordRecovery(baseRecord(), {
    id: RECOVERY_ID,
    ts: NOW,
    action: 'draft-appeal',
    rung: 'A1',
    remittanceId: 'rem-1',
    priority: 'routine',
    taskEvidenceTier: opts.tier ?? 'D3',
    ...(opts.filingDeadline ? { filingDeadline: opts.filingDeadline } : {}),
  });
}

describe('deriveEscalationSignals — gate + party notifications', () => {
  it('no recovery → assist gate, no signals', () => {
    const r = deriveEscalationSignals(baseRecord(), { now: NOW });
    expect(r.gate).toBe('assist');
    expect(r.signals).toEqual([]);
  });

  it('recovery draft (HITL, D3) → hitl gate + payer action + provider info', () => {
    const r = deriveEscalationSignals(withDraft(), { now: NOW });
    expect(r.gate).toBe('hitl');
    const payer = r.signals.find((s) => s.party === 'payer');
    const provider = r.signals.find((s) => s.party === 'provider');
    expect(payer).toMatchObject({ kind: 'reviewer-action-required', severity: 'action' });
    expect(provider).toMatchObject({ kind: 'recovery-in-progress', severity: 'info' });
  });

  it('gate is DERIVED from the twin-ladder: a D0 evidence tier caps the gate to assist', () => {
    const r = deriveEscalationSignals(withDraft({ tier: 'D0' }), { now: NOW });
    expect(r.gate).toBe('assist');
  });

  it('past the filing deadline → an escalate warning to both parties', () => {
    const past = new Date(Date.parse(NOW) - DAY).toISOString();
    const r = deriveEscalationSignals(withDraft({ filingDeadline: past }), { now: NOW });
    expect(r.signals.find((s) => s.kind === 'escalate')).toMatchObject({
      party: 'both',
      severity: 'warning',
    });
  });

  it('filing window closing (within the urgent window) → a warning', () => {
    const soon = new Date(Date.parse(NOW) + 5 * DAY).toISOString();
    const r = deriveEscalationSignals(withDraft({ filingDeadline: soon }), { now: NOW });
    const s = r.signals.find((x) => x.kind === 'filing-window-closing');
    expect(s).toMatchObject({ party: 'both', severity: 'warning' });
    expect(s?.message).toContain('5 day');
  });

  it('a comfortable filing deadline produces NO window signal', () => {
    const far = new Date(Date.parse(NOW) + 90 * DAY).toISOString();
    const r = deriveEscalationSignals(withDraft({ filingDeadline: far }), { now: NOW });
    expect(r.signals.some((s) => s.kind === 'escalate' || s.kind === 'filing-window-closing')).toBe(
      false
    );
  });

  it('terminal submitted → info notification (mock, not transmitted)', () => {
    let r = withDraft();
    r = recordRecoveryTerminal(r, {
      recoveryId: RECOVERY_ID,
      ts: NOW,
      status: 'submitted',
      decidedBy: 'reviewer-1',
      decidedAt: NOW,
    });
    const res = deriveEscalationSignals(r, { now: NOW });
    const term = res.signals.find((s) => s.kind === 'recovery-terminal');
    expect(term).toMatchObject({ party: 'both', severity: 'info' });
    expect(term?.message).toContain('submitted');
    expect(term?.message).toContain('not transmitted');
    // A terminal recovery is no longer awaiting a human decision.
    expect(res.signals.some((s) => s.kind === 'reviewer-action-required')).toBe(false);
  });

  it('terminal rejected → info notification (no submission)', () => {
    let r = withDraft();
    r = recordRecoveryTerminal(r, {
      recoveryId: RECOVERY_ID,
      ts: NOW,
      status: 'rejected',
      decidedBy: 'reviewer-1',
      decidedAt: NOW,
    });
    const term = deriveEscalationSignals(r, { now: NOW }).signals.find(
      (s) => s.kind === 'recovery-terminal'
    );
    expect(term?.message).toContain('rejected');
  });

  it('failed integrity → a critical escalation to both parties', () => {
    const r = deriveEscalationSignals(baseRecord(), {
      now: NOW,
      integrity: { intact: false, signed: false, reasons: ['chain head mismatch'] },
    });
    expect(r.signals.find((s) => s.kind === 'integrity-failed')).toMatchObject({
      party: 'both',
      severity: 'critical',
    });
  });

  it('is deterministic and PHI-safe (no member reference in the output)', () => {
    const past = new Date(Date.parse(NOW) - DAY).toISOString();
    const rec = withDraft({ filingDeadline: past });
    const a = deriveEscalationSignals(rec, { now: NOW });
    const b = deriveEscalationSignals(rec, { now: NOW });
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).not.toContain(MEMBER);
  });
});
