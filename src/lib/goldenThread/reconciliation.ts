/**
 * Remittance reconciliation (Wave-1, order→cash — FIX-2, pure).
 *
 * Compares an 835 remittance against the contracted allowed amount and computes a
 * verdict. The recoverable underpayment is measured on the PAYER-OWED portion
 * only:
 *
 *   payerOwed = contractedAllowed − Σ(PR adjustment amounts)
 *   delta     = payerOwed − paidAmount
 *
 * CO/PI/OA adjustments (write-offs / payer-initiated / other) NEVER inflate the
 * delta — only PR (patient responsibility) reduces payerOwed. This is FIX-2: a CO
 * contractual write-off is not money the payer owes, so it can never be counted as
 * a recoverable underpayment.
 *
 * The verdict is GATED on member-liability derivability (E9 floor, reused from the
 * CARC group logic): with no recognized X12 group present, liability is
 * indeterminate and there is NO recovery. The seed carries no precomputed verdict;
 * everything here is computed.
 *
 * Materiality: a delta within tolerance is `matched` (no draft). Default tolerance
 * is max($5.00, 0.5% × contractedAllowed), contract-overridable, and recorded for
 * audit. Pure and deterministic — no clock, no I/O.
 */
import {
  normalizeGroups,
  deriveMemberLiability,
  type MemberLiability,
} from '@/lib/graph/mapping/carcGroup';
import type { Normalized835 } from '@/lib/dataSources/remittanceGateway';

/** PA disposition upstream of the claim — an underpayment only matters if the service was authorized. */
export type ReconcilePasDecision = 'approved' | 'exempt' | 'denied' | 'more-info';

/**
 * Verdict values:
 *   matched          — within materiality tolerance, no draft
 *   underpaid        — real payer shortfall under an approving PA disposition → recoverable
 *   overpaid         — payer paid beyond payerOwed by > tolerance
 *   indeterminate    — no basis to reconcile (no X12 group, or no contracted rate on file); no lift, no recovery
 *   not-recoverable  — FINDING 4: a real payer shortfall that is NOT under an approving PA disposition
 *                      (denied / more-info). It IS reconciled (lifts to D2) but yields NO recovery.
 */
export type ReconcileVerdict =
  'matched' | 'underpaid' | 'overpaid' | 'indeterminate' | 'not-recoverable';

export interface ReconcileInput {
  pasDecision: ReconcilePasDecision;
  /**
   * FINDING 3: the contracted allowed amount, or `undefined` when no contracted
   * rate is on file. It is NEVER defaulted to 0 (that fabricated an 'overpaid');
   * an unavailable rate makes the recoverable delta underivable → 'indeterminate'.
   */
  contractedAllowed: number | undefined;
  remittance: Normalized835;
  /** Absolute materiality floor in dollars (default $5.00). */
  toleranceAbs?: number;
  /** Proportional materiality floor as a fraction of contractedAllowed (default 0.005 = 0.5%). */
  tolerancePct?: number;
}

export interface ReconcileResult {
  verdict: ReconcileVerdict;
  delta: number;
  contractedAllowed: number;
  paidAmount: number;
  toleranceApplied: number;
  memberLiability: MemberLiability;
  /** The evidence tier this reconciliation lifts the process to (D2), or null when indeterminate. */
  liftsTierTo: 'D2' | null;
}

const DEFAULT_TOLERANCE_ABS = 5.0;
const DEFAULT_TOLERANCE_PCT = 0.005;

/**
 * Reconcile a remittance against the contracted allowed amount. Verdict is
 * computed; CO/PI/OA never inflate the recoverable delta; indeterminate member
 * liability yields no recovery.
 */
export function reconcile(input: ReconcileInput): ReconcileResult {
  const { contractedAllowed, remittance, pasDecision } = input;
  const paidAmount = remittance.paidAmount;

  // Canonicalize the X12 groups present and derive member liability (E9 floor).
  const groups = normalizeGroups(remittance.adjustments.map((a) => a.group));
  const memberLiability = deriveMemberLiability(groups);

  // FINDING 3: no contracted rate on file → the recoverable delta is UNDERIVABLE.
  // Mirror the deriveMemberLiability !== 'indeterminate' floor: never default the
  // rate to 0 (that fabricated an 'overpaid'). No lift, no recovery.
  if (contractedAllowed === undefined) {
    return {
      verdict: 'indeterminate',
      delta: 0,
      contractedAllowed: 0,
      paidAmount,
      toleranceApplied: input.toleranceAbs ?? DEFAULT_TOLERANCE_ABS,
      memberLiability,
      liftsTierTo: null,
    };
  }

  const toleranceApplied = Math.max(
    input.toleranceAbs ?? DEFAULT_TOLERANCE_ABS,
    (input.tolerancePct ?? DEFAULT_TOLERANCE_PCT) * contractedAllowed
  );

  // FIX-2: only PR reduces payerOwed. CO/PI/OA are write-offs / other — never
  // recoverable underpayment.
  const prTotal = remittance.adjustments
    .filter((a) => a.group === 'PR')
    .reduce((sum, a) => sum + a.amount, 0);
  const payerOwed = contractedAllowed - prTotal;
  const delta = payerOwed - paidAmount;

  // Indeterminate liability → no verdict basis, no recovery, no tier lift.
  if (memberLiability === 'indeterminate') {
    return {
      verdict: 'indeterminate',
      delta,
      contractedAllowed,
      paidAmount,
      toleranceApplied,
      memberLiability,
      liftsTierTo: null,
    };
  }

  const approvingDisposition = pasDecision === 'approved' || pasDecision === 'exempt';
  let verdict: ReconcileVerdict;
  if (delta > toleranceApplied) {
    // A material payer shortfall. Recoverable ONLY under an approving PA
    // disposition; otherwise it IS reconciled (D2) but is NOT recoverable
    // (FINDING 4) — never silently 'matched'.
    verdict = approvingDisposition ? 'underpaid' : 'not-recoverable';
  } else if (-delta > toleranceApplied) {
    verdict = 'overpaid';
  } else {
    verdict = 'matched';
  }

  return {
    verdict,
    delta,
    contractedAllowed,
    paidAmount,
    toleranceApplied,
    memberLiability,
    liftsTierTo: 'D2',
  };
}
