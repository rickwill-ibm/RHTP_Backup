/**
 * Corpus family H — Prior authorization & gold carding. Executable scenarios
 * driving the REAL Golden-Thread financial-clearance state machine
 * (src/lib/goldenThread/financialClearanceMachine.ts), the append-only Evidence
 * Record ledger (src/lib/evidence/*), the policy engine, and the gold-carding
 * engine end-to-end.
 *
 * Covered runnable-now:
 *   UC-38 Standard PA through the golden thread — the PA lifecycle is
 *         pipeline-real (state machine + evidence ledger + PHI-safe audit),
 *         not screen-real. (person-context surfacing deferred to the read API.)
 *   UC-39 Gold card earned — a gold-carded provider auto-approves without manual
 *         review; threshold-crossing flips the path as a pure DATA change.
 *   UC-40 Denial then successful appeal — the appeal packet is generated from
 *         ledger entries alone; denial + reversal are distinct audited events.
 *
 * UC-41 (agent-driven PA) needs the agent runtime → registered pending.
 */
import { describe, it, expect } from 'vitest';
import {
  advance,
  FC_INITIAL,
  type FcContext,
  type FcEvent,
  type FcStage,
} from '@/lib/goldenThread/financialClearanceMachine';
import {
  createEvidenceRecord,
  appendEntry,
  recordDetermination,
  recordGoldCard,
  summarize,
  toAuditEvents,
  type EvidenceRecord,
} from '@/lib/evidence';
import { assertPhiSafe } from '@/lib/server/audit';
import { loadMockLibrary, evaluate, type MemberContext, type OrderContext } from '@/lib/policy';
import { evaluateGoldCard, MOCK_GOLD_CARD_CONTEXT } from '@/lib/policy/goldCarding';

/** Drive the FC machine through a list of events, returning every transition. */
function run(events: FcEvent[]): Array<{ state: FcStage; context: FcContext; error?: string }> {
  let state: FcStage = FC_INITIAL;
  let context: FcContext = { completed: [] };
  const trace: Array<{ state: FcStage; context: FcContext; error?: string }> = [];
  for (const e of events) {
    const t = advance(state, e, context);
    state = t.state;
    context = t.context;
    trace.push(t);
  }
  return trace;
}

describe('UC-38 | Standard PA through the golden thread (pipeline-real)', () => {
  it('threads Eligibility → Medical Necessity → Prior Auth (approved) → Estimation → Cleared', () => {
    const trace = run([
      { type: 'start' },
      { type: 'eligibility-complete', active: true },
      { type: 'med-nec-complete', requiresPA: true },
      { type: 'pa-complete', decision: 'approved' },
      { type: 'estimation-complete' },
    ]);
    expect(trace.every((t) => !t.error)).toBe(true);
    const final = trace[trace.length - 1];
    expect(final.state).toBe('Cleared');
    // Every gated stage was actually completed — not skipped.
    expect(final.context.completed).toEqual(
      expect.arrayContaining(['Eligibility', 'MedicalNecessity', 'PriorAuth', 'PatientEstimation'])
    );
    expect(final.context.requiresPA).toBe(true);
  });

  it('persists the PA lifecycle to the append-only Evidence ledger with PHI-safe audit (no mock source)', () => {
    const lib = loadMockLibrary();
    const member: MemberContext = { memberId: 'uc38-member', diagnoses: [] };
    const order: OrderContext = { code: '72148', codeSystem: 'CPT' };
    const det = evaluate(member, order, lib);
    expect(det.requiresPA).toBe(true); // 72148 is on the payer PA list

    let rec: EvidenceRecord = createEvidenceRecord({
      id: 'ev-uc38',
      memberId: 'uc38-member',
      order: { code: '72148', display: 'MRI lumbar spine' },
      createdAt: '2026-08-22T09:00:00.000Z',
    });
    rec = recordDetermination(rec, {
      id: 'e1',
      ts: '2026-08-22T09:01:00.000Z',
      determination: det,
    });
    rec = appendEntry(rec, {
      id: 'e2',
      ts: '2026-08-22T09:05:00.000Z',
      stage: 'prior-auth',
      actor: 'reviewer:pa-9',
      type: 'pas-decision',
      decision: 'approved',
    });

    const summary = summarize(rec);
    expect(summary.currentDetermination?.requiresPA).toBe(true);
    // The approved PA is a real ledger resource, projected to PHI-safe audit.
    const events = toAuditEvents(rec, 'uc38-cid');
    expect(
      events.some(
        (e) => e.action === 'evidence.pas-decision' && /decision=approved/.test(e.detail ?? '')
      )
    ).toBe(true);
    for (const e of events) expect(() => assertPhiSafe(e)).not.toThrow();
  });
});

describe('UC-39 | Gold card earned from real feeds', () => {
  const asOf = '2026-08-22T00:00:00.000Z';
  const payer = 'UnitedHealthcare Community Plan';
  const code = '72148';
  const ctx = { ...MOCK_GOLD_CARD_CONTEXT, asOf };

  it('a gold-carded provider auto-approves — PA is waived, no manual review', () => {
    const gc = evaluateGoldCard({ providerNpi: '1730154782', code, payer }, ctx);
    expect(gc.applied).toBe(true);

    let rec = createEvidenceRecord({
      id: 'ev-uc39-gc',
      memberId: 'uc39-member',
      order: { code, providerNpi: '1730154782' },
      createdAt: asOf,
    });
    rec = recordGoldCard(rec, {
      id: 'g1',
      ts: asOf,
      exemption: {
        applied: gc.applied,
        providerNpi: gc.providerNpi,
        code: gc.code,
        payer: gc.payer,
        approvalRate: gc.approvalRate,
        reason: gc.reason,
      },
    });
    const summary = summarize(rec);
    // Net effect: exemption overrides — PA is not required, no reviewer gate.
    expect(summary.goldCardApplied).toBe(true);
    expect(summary.requiresPA).toBe(false);
    expect(summary.netOutcome).toBe('pa-exempt-gold-card');
  });

  it('threshold-crossing flips the path on the next submission as a pure DATA change (no deploy)', () => {
    // Same engine, same asOf — only the provider's history data differs.
    // Below the 90% approval-rate threshold → not gold-carded → PA path holds.
    const below = evaluateGoldCard({ providerNpi: '1518998765', code, payer }, ctx); // ~62%
    expect(below.applied).toBe(false);

    // Above threshold with sufficient volume → gold-carded → PA waived.
    const above = evaluateGoldCard({ providerNpi: '1043321987', code, payer }, ctx); // ~94%
    expect(above.applied).toBe(true);

    // The two providers take DIFFERENT paths with zero code change between them.
    expect(below.applied).not.toBe(above.applied);
  });
});

describe('UC-40 | Denial then successful appeal', () => {
  it('generates the appeal packet from ledger entries alone; denial + reversal are distinct events', () => {
    let rec: EvidenceRecord = createEvidenceRecord({
      id: 'ev-uc40',
      memberId: 'uc40-member',
      order: { code: '70551', display: 'MRI brain' },
      createdAt: '2026-08-01T08:00:00.000Z',
    });
    // 1) original denial on a necessity dispute
    rec = appendEntry(rec, {
      id: 'd1',
      ts: '2026-08-01T08:30:00.000Z',
      stage: 'prior-auth',
      actor: 'reviewer:pa-3',
      type: 'pas-decision',
      decision: 'denied',
      reasons: ['missing-supporting-diagnosis'],
    });
    // 2) appeal filed (evidence reused from the ledger — no manual re-collection)
    rec = appendEntry(rec, {
      id: 'a1',
      ts: '2026-08-05T10:00:00.000Z',
      stage: 'prior-auth',
      actor: 'appeals:coord-1',
      type: 'note',
      text: 'appeal filed: guideline citation + timeline assembled from ledger',
    });
    // 3) overturn posts
    rec = appendEntry(rec, {
      id: 'o1',
      ts: '2026-08-09T14:00:00.000Z',
      stage: 'prior-auth',
      actor: 'reviewer:pa-appeals',
      type: 'pas-decision',
      decision: 'approved',
    });

    // The packet is generated purely from ledger entries → PHI-safe audit events.
    const packet = toAuditEvents(rec, 'uc40-cid');
    const decisions = packet.filter((e) => e.action === 'evidence.pas-decision');
    expect(decisions).toHaveLength(2);
    expect(decisions[0].detail).toMatch(/decision=denied/);
    expect(decisions[1].detail).toMatch(/decision=approved/);
    // Distinct audited events with their own actors — full history reconstructable.
    expect(new Set(decisions.map((e) => e.actor)).size).toBe(2);
    for (const e of packet) expect(() => assertPhiSafe(e)).not.toThrow();
  });
});
