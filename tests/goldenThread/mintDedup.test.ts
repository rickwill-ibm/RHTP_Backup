import { describe, it, expect } from 'vitest';
import { createSim, advance } from '@/lib/goldenThread/flowSim';

/**
 * mintTicket ref-idempotency — the fix for "TKT-4472 appears twice (a dumb duplicate)". The seeded
 * TICKETS catalogue uses a FIXED id per row, so the surveillance round-robin and the underpayment
 * algo-mint could both land on the same catalogue id in one warm-up, showing an operator the identical
 * ticket ref more than once. The guard mints a catalogue ref at most once while it has an OPEN ticket
 * (matching mintScenarioTicket / routeReconPattern). The round-robin cursor still advances so a deduped
 * slot never starves the next completion.
 *
 * These pins also protect the determinism story the pre-review corrected: the seal hash covers ONLY
 * ledger fields, never ticket data, so the dedup shrinks the seed ticket set WITHOUT moving the chain.
 */
const refCounts = (tickets: { ref: string }[]): Record<string, number> => {
  const c: Record<string, number> = {};
  for (const t of tickets) c[t.ref] = (c[t.ref] ?? 0) + 1;
  return c;
};

describe('mintTicket ref-dedup — no operator ever sees the same ticket ref twice', () => {
  it('the WA-Medicaid seed has each ticket ref exactly once (no duplicate rows)', () => {
    const s = createSim(20260914);
    const counts = refCounts(s.tickets);
    for (const [ref, n] of Object.entries(counts)) {
      expect(n, `ref ${ref} appears ${n}× in the seed queue`).toBe(1);
    }
    // and the chain pin is untouched by the dedup (seal hashes ledger fields, never tickets)
    expect(s.chainHead).toBe(1204273244);
    expect(s.ledgerSeq).toBe(251);
  });

  it('no ticket ref is ever duplicated across a long run either', () => {
    const s = createSim(20260914);
    for (let i = 0; i < 400; i += 1) advance(s);
    const counts = refCounts(s.tickets);
    for (const [ref, n] of Object.entries(counts)) {
      expect(n, `ref ${ref} appears ${n}× after 400 advances`).toBe(1);
    }
  });

  it('the queue never carries a duplicate auto-appeal row — at most one OPEN UNDERPAY-CONTRACT ticket', () => {
    // The auto-minted contract-underpayment ticket (TKT-4472) is deduped by ref, so the operator never
    // sees the same catalogue row twice. Additional disputed claims are NOT auto-minted as duplicates —
    // they remain individually recoverable from the Reconciliation board as their own distinct RCLM
    // appeal (asserted below), so this is honest scoping, not a silent fold.
    const s = createSim(20260914);
    for (let i = 0; i < 400; i += 1) advance(s);
    const openUnderpay = s.tickets.filter(
      (t) => t.algorithm === 'UNDERPAY-CONTRACT' && t.status !== 'Closed'
    );
    expect(openUnderpay.length).toBeLessThanOrEqual(1);
  });

  it('a manually-appealed recon record mints a DISTINCT appeal ticket (its own RCLM ref) — never a duplicate TKT-4472', async () => {
    const { startAppealWorkflow } = await import('@/lib/goldenThread/flowSim');
    const s = createSim(20260914);
    // an unrouted underpayment recon record is present at seed (the "second dispute" path)
    const rec = s.reconLedger.find((r) => r.reconClass === 'underpayment' && !r.routed);
    expect(rec, 'an unrouted underpayment recon record should exist to appeal').toBeTruthy();
    const before = new Set(s.tickets.map((t) => t.ref));
    startAppealWorkflow(s, rec!.seq);
    const added = s.tickets.filter((t) => !before.has(t.ref));
    // the manual appeal creates its OWN distinct ticket, and it is not a second TKT-4472 catalogue row
    expect(added.length).toBe(1);
    expect(added[0].ref).not.toBe('TKT-4472');
    // and every ref in the queue is still unique — no duplicate was introduced
    const counts = refCounts(s.tickets);
    for (const [ref, n] of Object.entries(counts)) expect(n, `ref ${ref} ×${n}`).toBe(1);
  });
});
