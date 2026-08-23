/**
 * Corpus family I — Golden-thread financial reconciliation. Executable scenario
 * driving the REAL append-only Evidence Record ledger (src/lib/evidence/*).
 *
 * Covered runnable-now: UC-44 (appeal outcome re-reconciled) — the append-only
 * ledger records denial, appeal, and payment as successive events; NO entry is
 * ever mutated, and the reconstructed timeline shows all states in order with
 * their actors.
 *
 * Other I cases (42/43/45/46) need cross-stage claim/payment ledgers, an 835
 * reconciliation engine, claims-pipeline idempotency, or graph temporality —
 * registered pending in the coverage registry.
 */
import { describe, it, expect } from 'vitest';
import {
  createEvidenceRecord,
  appendEntry,
  toAuditEvents,
  type EvidenceRecord,
} from '@/lib/evidence';

describe('UC-44 | Appeal outcome re-reconciled (append-only ledger)', () => {
  function ledgerWithThreeStates(): EvidenceRecord {
    let rec = createEvidenceRecord({
      id: 'ev-uc44',
      memberId: 'uc44-member',
      order: { code: '99213', display: 'office visit' },
      createdAt: '2026-07-01T00:00:00.000Z',
    });
    rec = appendEntry(rec, {
      id: 's1',
      ts: '2026-07-02T00:00:00.000Z',
      stage: 'prior-auth',
      actor: 'payer:adjudicator',
      type: 'pas-decision',
      decision: 'denied',
      reasons: ['claim-denial'],
    });
    rec = appendEntry(rec, {
      id: 's2',
      ts: '2026-07-06T00:00:00.000Z',
      stage: 'prior-auth',
      actor: 'appeals:coord',
      type: 'note',
      text: 'appeal filed',
    });
    rec = appendEntry(rec, {
      id: 's3',
      ts: '2026-07-11T00:00:00.000Z',
      stage: 'patient-estimation',
      actor: 'payer:re-adjudicator',
      type: 'pas-decision',
      decision: 'approved',
    });
    return rec;
  }

  it('never mutates a ledger entry — every append returns a NEW record', () => {
    const base = createEvidenceRecord({
      id: 'ev-uc44b',
      memberId: 'm',
      order: { code: '99213' },
      createdAt: '2026-07-01T00:00:00.000Z',
    });
    const snapshotLen = base.entries.length;
    const snapshotRef = base.entries;

    const after = appendEntry(base, {
      id: 'x1',
      ts: '2026-07-02T00:00:00.000Z',
      stage: 'prior-auth',
      actor: 'a',
      type: 'note',
      text: 'first',
    });
    // The original record is untouched — same length, same array reference.
    expect(base.entries.length).toBe(snapshotLen);
    expect(base.entries).toBe(snapshotRef);
    // The new record carries the added entry.
    expect(after.entries.length).toBe(snapshotLen + 1);
    expect(after).not.toBe(base);
  });

  it('reconstructs denial → appeal → payment in order, each with its actor', () => {
    const rec = ledgerWithThreeStates();
    const events = toAuditEvents(rec, 'uc44-cid');
    // Chronological reconstruction, immutable.
    const timestamps = events.map((e) => e.ts);
    const sorted = [...timestamps].sort();
    expect(timestamps).toEqual(sorted);

    const decisions = events.filter((e) => e.action === 'evidence.pas-decision');
    expect(decisions.map((e) => e.detail)).toEqual([
      expect.stringMatching(/decision=denied/),
      expect.stringMatching(/decision=approved/),
    ]);
    // Distinct actors preserved across the successive states.
    expect(decisions[0].actor).toBe('payer:adjudicator');
    expect(decisions[1].actor).toBe('payer:re-adjudicator');
    expect(events.find((e) => /appeal filed/.test(e.detail ?? '') || e.action === 'evidence.note')).toBeTruthy();
  });
});
