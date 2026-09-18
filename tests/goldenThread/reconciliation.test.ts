import { describe, it, expect } from 'vitest';
import { reconcile } from '@/lib/goldenThread/reconciliation';
import type { Normalized835 } from '@/lib/dataSources/remittanceGateway';

/**
 * FIX-2 reconciliation math. The verdict is COMPUTED (fixtures carry no verdict):
 * CO/PI/OA never inflate the recoverable delta, only PR reduces payerOwed, the
 * verdict is gated on member-liability derivability (E9 floor), and materiality
 * turns a within-tolerance delta into `matched`.
 */
function remit(partial: Partial<Normalized835>): Normalized835 {
  return {
    remittanceId: 'RA-1',
    claimRef: 'CLM-1',
    payer: 'UnitedHealthcare Community Plan',
    code: '72148',
    billedAmount: 1200,
    paidAmount: 1000,
    adjustments: [],
    carcCodes: [],
    rarcCodes: [],
    carcGroups: [],
    paidDate: '2026-08-30',
    ...partial,
  };
}

describe('reconcile — verdict is computed, not read from the fixture', () => {
  it('the fixture carries no verdict field; reconcile derives it', () => {
    const r = remit({ adjustments: [{ group: 'CO', amount: 200 }], paidAmount: 1000 });
    expect((r as unknown as Record<string, unknown>).verdict).toBeUndefined();
    const out = reconcile({ pasDecision: 'approved', contractedAllowed: 1000, remittance: r });
    expect(out.verdict).toBe('matched');
  });
});

describe('FIX-2 — CO/PI/OA never inflate the recoverable delta', () => {
  it('a CO-only shortfall (paid < billed only due to a CO write-off) is MATCHED, not underpaid', () => {
    // billed 1200, contracted allowed 1000, CO write-off 200, paid == payerOwed (1000).
    const r = remit({
      billedAmount: 1200,
      paidAmount: 1000,
      adjustments: [{ group: 'CO', amount: 200 }],
      carcGroups: ['CO'],
    });
    const out = reconcile({ pasDecision: 'approved', contractedAllowed: 1000, remittance: r });
    expect(out.delta).toBe(0); // CO did NOT count toward the delta
    expect(out.verdict).toBe('matched');
  });

  it('a PR amount reduces payerOwed (so a paid == allowed − PR claim is matched)', () => {
    // contracted allowed 1000, PR 200 → payerOwed 800; paid 800 → delta 0.
    const r = remit({
      paidAmount: 800,
      adjustments: [{ group: 'PR', amount: 200 }],
      carcGroups: ['PR'],
    });
    const out = reconcile({ pasDecision: 'approved', contractedAllowed: 1000, remittance: r });
    expect(out.delta).toBe(0);
    expect(out.verdict).toBe('matched');
  });

  it('a true underpayment (paid < payerOwed by > tolerance) is UNDERPAID and lifts to D2', () => {
    // contracted allowed 1000, CO 200 (ignored), PR 100 → payerOwed 900; paid 800 → delta 100.
    const r = remit({
      paidAmount: 800,
      adjustments: [
        { group: 'CO', amount: 200 },
        { group: 'PR', amount: 100 },
      ],
      carcGroups: ['CO', 'PR'],
    });
    const out = reconcile({ pasDecision: 'approved', contractedAllowed: 1000, remittance: r });
    expect(out.delta).toBe(100);
    expect(out.verdict).toBe('underpaid');
    expect(out.liftsTierTo).toBe('D2');
  });
});

describe('materiality boundary (default tolerance = max($5, 0.5% × allowed))', () => {
  // contracted allowed 1000 → tolerance = max(5, 5) = 5.
  it('a delta exactly at tolerance is matched (strict >)', () => {
    const r = remit({ paidAmount: 995, adjustments: [{ group: 'PR', amount: 0 }], carcGroups: ['PR'] });
    const out = reconcile({ pasDecision: 'approved', contractedAllowed: 1000, remittance: r });
    expect(out.toleranceApplied).toBe(5);
    expect(out.delta).toBe(5);
    expect(out.verdict).toBe('matched');
  });

  it('a delta just above tolerance is underpaid', () => {
    const r = remit({ paidAmount: 994, adjustments: [{ group: 'PR', amount: 0 }], carcGroups: ['PR'] });
    const out = reconcile({ pasDecision: 'approved', contractedAllowed: 1000, remittance: r });
    expect(out.delta).toBe(6);
    expect(out.verdict).toBe('underpaid');
  });

  it('an overpayment within tolerance is matched; beyond tolerance is overpaid', () => {
    const within = reconcile({
      pasDecision: 'approved',
      contractedAllowed: 1000,
      remittance: remit({ paidAmount: 1005, adjustments: [{ group: 'PR', amount: 0 }], carcGroups: ['PR'] }),
    });
    expect(within.delta).toBe(-5);
    expect(within.verdict).toBe('matched');

    const beyond = reconcile({
      pasDecision: 'approved',
      contractedAllowed: 1000,
      remittance: remit({ paidAmount: 1006, adjustments: [{ group: 'PR', amount: 0 }], carcGroups: ['PR'] }),
    });
    expect(beyond.delta).toBe(-6);
    expect(beyond.verdict).toBe('overpaid');
  });

  it('a contract-supplied tolerance overrides the default', () => {
    const r = remit({ paidAmount: 900, adjustments: [{ group: 'PR', amount: 0 }], carcGroups: ['PR'] });
    // delta 100, but a $150 absolute tolerance makes it matched
    const out = reconcile({
      pasDecision: 'approved',
      contractedAllowed: 1000,
      remittance: r,
      toleranceAbs: 150,
    });
    expect(out.toleranceApplied).toBe(150);
    expect(out.verdict).toBe('matched');
  });
});

describe('gating — pasDecision and member liability', () => {
  it('FINDING 4 — denied/more-info: a delta that would be underpaid under approval is NOT-RECOVERABLE (reconciled D2, no recovery), never mislabeled matched', () => {
    const r = remit({
      paidAmount: 800,
      adjustments: [{ group: 'PR', amount: 100 }],
      carcGroups: ['PR'],
    });
    // Same claim under approval would be underpaid (delta 100)…
    expect(reconcile({ pasDecision: 'approved', contractedAllowed: 1000, remittance: r }).verdict).toBe(
      'underpaid'
    );
    // …but a denied PA disposition never yields a recoverable underpayment. It is
    // still RECONCILED (lifts to D2) — it is just NOT recoverable, not 'matched'.
    const denied = reconcile({ pasDecision: 'denied', contractedAllowed: 1000, remittance: r });
    expect(denied.verdict).toBe('not-recoverable');
    expect(denied.verdict).not.toBe('underpaid');
    expect(denied.verdict).not.toBe('matched');
    expect(denied.liftsTierTo).toBe('D2');
    // more-info behaves identically for the recoverability gate.
    expect(reconcile({ pasDecision: 'more-info', contractedAllowed: 1000, remittance: r }).verdict).toBe(
      'not-recoverable'
    );
  });

  it('FINDING 3 — a missing contracted rate (undefined) is INDETERMINATE, never a fabricated overpaid', () => {
    // Before the fix: contractedAllowed defaulted to 0 → payerOwed −100 → delta −900
    // → a FABRICATED 'overpaid'. Now an unavailable rate is indeterminate.
    const r = remit({
      paidAmount: 800,
      adjustments: [{ group: 'PR', amount: 100 }],
      carcGroups: ['PR'],
    });
    const out = reconcile({ pasDecision: 'approved', contractedAllowed: undefined, remittance: r });
    expect(out.verdict).toBe('indeterminate');
    expect(out.verdict).not.toBe('overpaid');
    expect(out.liftsTierTo).toBeNull();
  });

  it('exempt is treated like approved for the underpayment gate', () => {
    const r = remit({ paidAmount: 800, adjustments: [{ group: 'PR', amount: 100 }], carcGroups: ['PR'] });
    expect(reconcile({ pasDecision: 'exempt', contractedAllowed: 1000, remittance: r }).verdict).toBe(
      'underpaid'
    );
  });

  it('indeterminate member liability (no X12 group) → verdict indeterminate, no lift, no recovery basis', () => {
    const r = remit({ paidAmount: 800, adjustments: [], carcGroups: [] });
    const out = reconcile({ pasDecision: 'approved', contractedAllowed: 1000, remittance: r });
    expect(out.memberLiability).toBe('indeterminate');
    expect(out.verdict).toBe('indeterminate');
    expect(out.liftsTierTo).toBeNull();
  });
});
