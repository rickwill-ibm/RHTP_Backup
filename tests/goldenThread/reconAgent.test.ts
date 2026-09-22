/**
 * Reconciliation-AGENT increment invariants (coalition adversarial-before/after regression pins).
 *
 * Distinct from `reconciliation.test.ts` (which pins the server-side 835 settlement MATH on
 * Normalized835). This pins the CLIENT-SAFE recon-agent layer in flowSim/reconcile.ts: the per-claim
 * classification + audit trail, the four governed handoffs across a TWO-SIDED seat model, and the
 * sub-ledger tamper-evidence. Each fails if a fix regresses.
 */
import { describe, it, expect } from 'vitest';
import {
  createSim,
  advance,
  routeReconHandoff,
  routeReconPattern,
  reconIntact,
  verifyReconEntry,
  ledgerIntact,
  earnedEligibility,
} from '@/lib/goldenThread/flowSim';
import {
  reconInsights,
  RECON_CLASS_SPEC,
  classifyRecon,
  type ReconClass,
} from '@/lib/goldenThread/reconcile';
import { ROLE_SIDE, actionRequiresHuman } from '@/lib/goldenThread/e2eFlow';

describe('recon-agent — determinism isolation', () => {
  it('the recon sub-ledger does NOT perturb the default wa-medicaid pin', () => {
    const s = createSim(20260914);
    // The recon audit trail is RNG-free (id-hash derived) and adds no main-ledger seal / no ticket in
    // advance(). The seal hash covers ONLY ledger fields (never ticket data), so the mintTicket
    // ref-dedup — which collapsed the duplicated seed refs to one row each (9 → 4) — leaves the chain
    // pin byte-identical and only shrinks the seed ticket count.
    expect(s.chainHead).toBe(3794285767);
    expect(s.ledgerSeq).toBe(251);
    expect(s.tick).toBe(684);
    expect(s.tickets.length).toBe(5);
  });
  it('advancing stays deterministic and the recon chain stays intact', () => {
    const run = (): number => {
      const s = createSim(20260914);
      for (let i = 0; i < 300; i += 1) advance(s);
      return s.chainHead;
    };
    expect(run()).toBe(run());
    const s = createSim(20260914);
    for (let i = 0; i < 300; i += 1) advance(s);
    expect(reconIntact(s)).toBe(true);
  });
  it('the recon chain itself is pinned (a non-deterministic classification would fail even if the main ledger held)', () => {
    const s = createSim(20260914);
    expect(s.reconSeq).toBe(89);
    expect(s.reconHead).toBe(1792988571);
  });
});

describe('recon-agent — audit trail + insights', () => {
  it('warms a real portfolio, mostly correctly paid (clean/contractual dominate — honest shape)', () => {
    const s = createSim(20260914);
    expect(s.reconLedger.length).toBeGreaterThan(50);
    const ins = reconInsights(s.reconLedger.map((r) => r));
    const correct = ins.byClass.clean + ins.byClass['contractual-writeoff'];
    expect(correct).toBeGreaterThan(ins.total * 0.4); // reconciliation CONFIRMS payment, mostly
    expect(reconIntact(s)).toBe(true);
  });
  it('surfaces both money directions (underpayment recoverable AND overpayment returnable)', () => {
    const s = createSim(20260914);
    const ins = reconInsights(s.reconLedger.map((r) => r));
    expect(ins.totalRecoverableUsd).toBeGreaterThan(0); // provider short-paid → appeal
    expect(ins.totalReturnableUsd).toBeGreaterThan(0); //  payer over-paid → 60-day report-and-return
    expect(ins.byClass.overpayment).toBeGreaterThan(0);
  });
  it('detects a systematic fee-schedule pattern (the seeded cluster) routable to payer Claims Config', () => {
    const s = createSim(20260914);
    const ins = reconInsights(s.reconLedger.map((r) => r));
    const fee = ins.systematicPatterns.find((p) => p.kind === 'fee-schedule-config');
    expect(fee).toBeTruthy();
    expect(fee!.count).toBeGreaterThanOrEqual(3);
    expect(fee!.routeRole).toBe('payer-config');
  });
});

describe('recon-agent — classification coherence (no contradictory tuples)', () => {
  it('never emits a CO write-off billed to the member, or a PR that is not a member-liability review', () => {
    for (const cls of Object.keys(RECON_CLASS_SPEC) as ReconClass[]) {
      const spec = RECON_CLASS_SPEC[cls];
      if (spec.group === 'PR') expect(spec.memberLiability).toBe('member-responsibility');
      if (spec.group === 'CO') expect(spec.memberLiability).toBe('not-member-responsibility');
      if (spec.memberLiability === 'member-responsibility')
        expect(cls).toBe('member-liability-review');
    }
    for (let i = 0; i < 200; i += 1) {
      const r = classifyRecon({ id: `t-${i}`, tick: 0, disputed: false, scenario: 'wa-medicaid' });
      const spec = RECON_CLASS_SPEC[r.reconClass];
      expect(r.group).toBe(spec.group);
      expect(r.memberLiability).toBe(spec.memberLiability);
    }
  });
  it('the disputed roll pins underpayment (consistent with the existing recovery routing)', () => {
    const r = classifyRecon({ id: 'x', tick: 0, disputed: true, scenario: 'wa-medicaid' });
    expect(r.reconClass).toBe('underpayment');
    expect(r.deltaUsd).toBeLessThan(0); // short-paid
  });
});

describe('recon-agent — governed handoffs (two-sided seats, human-gated submissions)', () => {
  it('routes each class to a seat on the correct institution side (no cross-boundary action)', () => {
    for (const cls of Object.keys(RECON_CLASS_SPEC) as ReconClass[]) {
      const spec = RECON_CLASS_SPEC[cls];
      if (!spec.handoffRole) continue;
      const side = ROLE_SIDE[spec.handoffRole as keyof typeof ROLE_SIDE];
      expect(side).toBe(spec.side);
    }
  });
  it('every payer-facing SUBMISSION handoff actionType is a governed string that requires a human (no fail-open)', () => {
    // The adversarial-before fail-open: '837-corrected' ≠ 'x12-837-corrected' would slip the gate.
    const submissionClasses: ReconClass[] = ['underpayment', 'overpayment'];
    for (const cls of submissionClasses) {
      const spec = RECON_CLASS_SPEC[cls];
      expect(spec.humanGated).toBe(true);
      expect(actionRequiresHuman(spec.actionType)).toBe(true);
    }
  });
  it('underpayment routes to the full appeal WORKFLOW on a provider-revint ticket (single entry, back-linked)', () => {
    const s = createSim(20260914);
    const rec = s.reconLedger.find((r) => r.reconClass === 'underpayment' && !r.routed)!;
    routeReconHandoff(s, rec.seq); // delegates to startAppealWorkflow for the underpayment class
    const t = s.tickets.find((x) => x.reconRecordSeq === rec.seq);
    expect(t).toBeTruthy();
    expect(t!.role).toBe('provider-revint');
    expect(rec.routed).toBe(true);
    const wf = s.workflows.find((w) => w.reconSeq === rec.seq);
    expect(wf).toBeTruthy(); // a governed workflow, not a bare seal (the human-gated submission is at release)
    expect(wf!.ticketKey).toBe(t!.key);
  });
  it('overpayment → payer seat, report-and-return human-gated (adverse/recoup direction)', () => {
    const s = createSim(20260914);
    const rec = s.reconLedger.find((r) => r.reconClass === 'overpayment');
    expect(rec).toBeTruthy(); // must exist in the warm book — no silent skip
    routeReconHandoff(s, rec!.seq);
    const t = s.tickets.find((x) => x.reconRecordSeq === rec!.seq)!;
    expect(ROLE_SIDE[t.role as keyof typeof ROLE_SIDE]).toBe('payer');
    const last = s.ledger[s.ledger.length - 1];
    expect(last.human).toBe(true);
    expect(last.decision).not.toMatch(/EXECUTED/);
  });
  it('a payer-facing SUBMISSION (overpayment report-and-return) stays human PROPOSED even after EARNED A2', () => {
    const s = createSim(20260914);
    s.earnedCeiling = 2;
    s.maturity = 0.8; // fleet has earned autonomous A2 — non-submissions could auto-execute
    const rec = s.reconLedger.find((r) => r.reconClass === 'overpayment')!; // a submission handoff NOT delegated to a workflow
    routeReconHandoff(s, rec.seq);
    const last = s.ledger[s.ledger.length - 1];
    expect(last.human).toBe(true); // report-and-return is adverse/submission — human-gated regardless of earned rung…
    expect(last.decision).toMatch(/PROPOSED/); // …so it does NOT auto-execute at A2 (no fail-open)
    expect(last.decision).not.toMatch(/EXECUTED/);
  });
  it('member-liability-review → payer Program-Integrity (not the config desk), human-gated (balance-bill guard)', () => {
    const s = createSim(20260914);
    const rec = s.reconLedger.find((r) => r.reconClass === 'member-liability-review');
    expect(rec).toBeTruthy();
    routeReconHandoff(s, rec!.seq);
    const t = s.tickets.find((x) => x.reconRecordSeq === rec!.seq)!;
    expect(t.role).toBe('payer-pi'); // NOT payer-config (fee-schedule desk)
    expect(s.ledger[s.ledger.length - 1].human).toBe(true);
  });
  it('bundling-downcode → provider-coding (internal, earned-gated) with a real provenance seal', () => {
    const s = createSim(20260914);
    const rec = s.reconLedger.find((r) => r.reconClass === 'bundling-downcode');
    expect(rec).toBeTruthy();
    const before = s.ledger.length;
    routeReconHandoff(s, rec!.seq);
    const t = s.tickets.find((x) => x.reconRecordSeq === rec!.seq)!;
    expect(t.role).toBe('provider-coding');
    expect(s.ledger.length).toBeGreaterThan(before); // sealed a real record (not a stale back-link)
    expect(t.sealSeq).toBe(s.ledger[s.ledger.length - 1].seq); // sealSeq points at the seal just written
  });
  it('a systematic fee-schedule pattern routes to payer-config as an A1 advisory (config change is human)', () => {
    const s = createSim(20260914);
    const ins = reconInsights(s.reconLedger.map((r) => r));
    const fee = ins.systematicPatterns.find((p) => p.kind === 'fee-schedule-config')!;
    routeReconPattern(s, fee.kind, fee.provider, fee.carc, fee.count, fee.amountUsd);
    const seal = [...s.ledger].reverse().find((e) => e.fired === 'fee-schedule-config');
    expect(seal).toBeTruthy();
    expect(seal!.rung).toBe('A1');
    expect(seal!.human).toBe(false);
    expect(seal!.decision).toMatch(/human/i);
  });
  it('a ROUTED underpayment carries exactly ONE linked ticket — re-routing that record is a no-op (no double-mint)', () => {
    const s = createSim(20260914);
    for (let i = 0; i < 200; i += 1) advance(s);
    const pendRouted = s.reconLedger.filter((r) => r.reconClass === 'underpayment' && r.routed);
    expect(pendRouted.length).toBeGreaterThan(0);
    for (const r of pendRouted) {
      // the auto-minted UNDERPAY-CONTRACT ticket carries the back-link, so the board's routed-check
      // (tickets.some(t => t.reconRecordSeq === r.seq)) is satisfied → no live "Draft appeal" → no 2nd mint
      const linked = s.tickets.filter((t) => t.reconRecordSeq === r.seq);
      expect(linked.length).toBe(1);
      // and routing it again from the board is a no-op (already routed)
      const n = s.tickets.length;
      routeReconHandoff(s, r.seq);
      expect(s.tickets.length).toBe(n);
    }
  });
  it('routing is idempotent per record (no double-mint / double-seal)', () => {
    const s = createSim(20260914);
    const rec = s.reconLedger.find((r) => r.reconClass === 'underpayment' && !r.routed)!;
    routeReconHandoff(s, rec.seq);
    const n1 = s.tickets.length;
    const l1 = s.ledger.length;
    routeReconHandoff(s, rec.seq);
    expect(s.tickets.length).toBe(n1);
    expect(s.ledger.length).toBe(l1);
  });
});

describe('recon-agent — sub-ledger tamper-evidence is GOVERNED (fail-closed)', () => {
  it('a tampered audit row fails reconIntact/verifyReconEntry AND trips the earned-authority integrity gate', () => {
    const s = createSim(20260914);
    expect(reconIntact(s)).toBe(true);
    const clean = earnedEligibility(s).gates.find((g) => /integrity/i.test(g.label))!;
    expect(clean.met).toBe(true);
    const r = s.reconLedger[10];
    const orig = r.paidUsd;
    r.paidUsd = orig + 1;
    expect(reconIntact(s)).toBe(false);
    expect(verifyReconEntry(s, r.seq)).toBe(false);
    const tampered = earnedEligibility(s).gates.find((g) => /integrity/i.test(g.label))!;
    expect(tampered.met).toBe(false); // fail-closed extends to the recon trail
    r.paidUsd = orig;
    expect(reconIntact(s)).toBe(true);
    expect(ledgerIntact(s)).toBe(true);
  });
});
