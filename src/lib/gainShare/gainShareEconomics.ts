/**
 * gainShareEconomics.ts — the pure economics core behind the TWO cleanly-separated gain-share surfaces.
 *
 * The coalition's frame (do not blur it): recovery/reconciliation dollars are PAYMENT-INTEGRITY, not
 * value-based-care. They are REAL (computed from the hash-chained recon sub-ledger) but they must NEVER
 * enter a shared-savings split, and — crucially — they are correctly SIGNED and MLR-aware:
 *   • underpayment "recoverable" = the provider was SHORT-paid → realizing it means the payer pays the
 *     provider MORE. It is a provider-owed correction, not savings. Never split payer/provider.
 *   • overpayment "returnable"   = the payer OVER-paid → report-and-return REDUCES incurred claims, i.e.
 *     it moves the MLR NUMERATOR down (42 CFR 438.8(e)(2)(iii)). Showing it as a distributable pool would
 *     double-count against the MLR the plan reports to the State.
 *   • realized                   = of the recoverable, what an accepted-appeal 835 actually posted.
 *
 * The VBC shared-savings WEDGE (TCOC below a risk-adjusted benchmark) is genuinely MODELLED — the sim has
 * no attribution / risk-adjusted benchmark / IBNR run-out, so every PMPM here is illustrative and every
 * actuarial input is HELD CONSTANT and labelled. Member-months is a held-constant lever, not a sim value.
 * The ladder is the HCP-LAN APM framework (Cat 3A → 3B → 4), not "sub-cap as a rung". Splits can't move
 * without actuarial certification (42 CFR 438.4/438.7) and CMS 438.6(c) approval — the modeler says so.
 *
 * Everything here is PURE and DETERMINISTIC (no RNG, no wall-clock). Surfaces read a PINNED epoch
 * (ledgerSeq) so figures never jump mid-demo. CLIENT-SAFE: reconcile domain only; SimState is a type import.
 */
import { reconInsights } from '@/lib/goldenThread/reconcile';
import type { SimState } from '@/lib/goldenThread/flowSim';

/** A pinned snapshot boundary — every figure derived from a snapshot is stamped with this. */
export interface Epoch {
  ledgerSeq: number;
  tick: number;
}

/* ─────────────────────────── A · Payment-Integrity ROI (REAL) ─────────────────────────── */

export interface RecoveryRoi {
  epoch: Epoch;
  /** Provider was short-paid; realizing pays the provider MORE. A correction, not savings. */
  recoverableUsd: number;
  underpaymentCount: number;
  /** Of the recoverable, what an accepted-appeal 835 actually posted. */
  realizedUsd: number;
  realizedPct: number; // realized ÷ recoverable (0..1)
  /** Payer over-paid; report-and-return reduces incurred claims → MLR numerator down. */
  returnableUsd: number;
  overpaymentCount: number;
  disputeCount: number;
  reconRows: number;
  mlrNote: string;
}

/** Compute the REAL recovery ROI from the recon sub-ledger at a pinned epoch. Pure snapshot. */
export function computeRecoveryRoi(s: SimState): RecoveryRoi {
  const ins = reconInsights(s.reconLedger);
  const recoverableUsd = Math.round(ins.totalRecoverableUsd);
  const realizedUsd = Math.round(ins.totalRealizedUsd);
  const returnableUsd = Math.round(ins.totalReturnableUsd);
  return {
    epoch: { ledgerSeq: s.ledgerSeq, tick: s.tick },
    recoverableUsd,
    underpaymentCount: ins.byClass.underpayment,
    realizedUsd,
    realizedPct: recoverableUsd > 0 ? Math.min(1, realizedUsd / recoverableUsd) : 0,
    returnableUsd,
    overpaymentCount: ins.byClass.overpayment,
    disputeCount: ins.disputeCount,
    reconRows: ins.total,
    mlrNote:
      'MLR is bidirectional (42 CFR 438.8): recovered overpayments returned REDUCE incurred claims (numerator down); realized underpayment corrections pay the provider more and RAISE incurred claims (numerator up). Neither is a distributable pool, and neither enters the shared-savings split. Figures are PHI-safe synthetic seed data, deterministically derived.',
  };
}

/* ─────────────────────── B · VBC shared-savings modeler (MODELLED) ─────────────────────── */

/** The HCP-LAN APM ladder the audience speaks in — Cat 3A → 3B → 4 (capitation; sub-cap is a mechanism within Cat 4). */
export type LanTierId = 'cat3a' | 'cat3b' | 'cat4';
export interface LanTier {
  id: LanTierId;
  lan: string; // the LAN category label
  name: string;
  twoSided: boolean; // downside risk?
  /** Illustrative benchmark & actual PMPM for this rung (MODELLED — no sim actuarial data). */
  benchmarkPmpm: number;
  actualPmpm: number;
  /** Stop-loss PMPM cap on the provider's downside tail. HELD CONSTANT (illustrative). Zero on
   *  upside-only tiers (no downside). The symmetric deadband is the MSR rate itself (minimum-loss
   *  rate = minimum-savings rate), computed at run time — not a separate hard-coded band. */
  stopLossCapPmpm: number;
  note: string;
}
export const LAN_TIERS: readonly LanTier[] = [
  {
    id: 'cat3a',
    lan: 'LAN Cat 3A',
    name: 'Upside-only shared savings',
    twoSided: false,
    benchmarkPmpm: 515,
    actualPmpm: 503,
    stopLossCapPmpm: 0,
    note: 'Provider shares upside only; no downside. Savings computed on a jointly-replayable, risk-adjusted benchmark.',
  },
  {
    id: 'cat3b',
    lan: 'LAN Cat 3B',
    name: 'Two-sided shared savings',
    twoSided: true,
    benchmarkPmpm: 527,
    actualPmpm: 500,
    stopLossCapPmpm: 12,
    note: 'Two-sided: symmetric MSR/MLR deadband (neither shares nor owes within it); beyond it the provider shares upside and owes downside, with a $12 PMPM stop-loss on the downside tail.',
  },
  {
    id: 'cat4',
    lan: 'LAN Cat 4',
    name: 'Population-based / capitation',
    twoSided: true,
    benchmarkPmpm: 535,
    actualPmpm: 480,
    stopLossCapPmpm: 20,
    note: 'Global budget / (sub-)capitation. Per-claim recovery value is near-zero by design; risk sits with capital & reinsurance. Downside stop-loss caps provider liability at $20 PMPM.',
  },
];
export const lanTier = (id: LanTierId): LanTier =>
  LAN_TIERS.find((t) => t.id === id) ?? LAN_TIERS[0];

/** Actuarial inputs the model HOLDS CONSTANT — named so the surface shows them as scoped, not ignored. */
export const HELD_CONSTANT: ReadonlyArray<{ key: string; label: string; note: string }> = [
  {
    key: 'attribution',
    label: 'Attribution model',
    note: 'member → provider-panel assignment (held constant)',
  },
  {
    key: 'risk-adj',
    label: 'Risk-adjusted benchmark',
    note: 'CDPS/CRG-adjusted; an unadjusted PMPM compare is meaningless (held constant)',
  },
  {
    key: 'ibnr',
    label: 'IBNR / run-out completion',
    note: 'actuals mature over 3–12 mo of claims run-out (held constant)',
  },
  {
    key: 'risk-corridor',
    label: 'Risk corridor / stop-loss',
    note: 'downside band + tail cap (held constant; MSR & quality gate are live levers below)',
  },
];

export interface ContractModel {
  tierId: LanTierId;
  memberMonths: number; // HELD CONSTANT (illustrative) — the sim has no attribution denominator
  providerSharePct: number; // 0..1 — provider's share of the qualifying pool
  /** Performance-vs-benchmark lever: PMPM added to the rung's base actual. Positive worsens performance;
   *  on a two-sided tier a large-enough push makes actual > benchmark → the PROVIDER OWES (downside). */
  actualDeltaPmpm: number;
  pmpmInfra: number; // upfront PMPM infra payment funding the provider build (Cat 3A+) — a PAYER COST
  qualityGateMet: boolean; // Medicaid shared savings is forfeited if quality misses
  minSavingsRatePct: number; // 0..1 of benchmark — below MSR, nothing is shared
  rebasePct: number; // annual benchmark rebasing (compresses future savings unless protected)
  rebaseProtected: boolean; // rebasing-protection keeps the provider's own earned gains
}

export const DEFAULT_MEMBER_MONTHS = 120_000; // illustrative: ~10k attributed lives × 12 months (ANNUAL)

export function defaultModel(tierId: LanTierId): ContractModel {
  return {
    tierId,
    memberMonths: DEFAULT_MEMBER_MONTHS,
    providerSharePct: tierId === 'cat4' ? 0.6 : 0.5,
    actualDeltaPmpm: 0,
    pmpmInfra: tierId === 'cat3a' ? 2.0 : 1.0,
    qualityGateMet: true,
    minSavingsRatePct: 0.02,
    rebasePct: 0.015,
    // Default OFF, even on two-sided tiers: with protection ON the default multi-year view shows three
    // identical non-compressing rows, which HIDES the "rebasing compresses future savings" story. Off by
    // default makes the compression visible; the user turns protection on as an explicit choice.
    rebaseProtected: false,
  };
}

export interface RebaseYear {
  year: number;
  benchmarkPmpm: number;
  grossSavingsPmpm: number;
  sharedPoolPmpm: number;
  providerPmpm: number;
  payerPmpm: number;
  providerLiabilityPmpm: number; // two-sided downside for this year (0 upside-only / within corridor)
}

export interface VbcScenario {
  tier: LanTier;
  model: ContractModel;
  twoSided: boolean;
  benchmarkPmpm: number;
  actualPmpm: number; // effective actual (rung base + performance-delta lever)
  rawGrossPmpm: number; // SIGNED benchmark − actual (negative when actual > benchmark)
  grossSavingsPmpm: number; // max(0, raw) — the upside floor Cat 3A always uses
  overBenchmark: boolean; // two-sided AND actual > benchmark → provider owes downside
  msrThresholdPmpm: number; // benchmark × MSR
  qualifies: boolean; // gross ≥ MSR AND quality gate met
  gateReason: string; // why the pool is zero, when it is
  sharedPoolPmpm: number; // qualifying savings (0 if gated out)
  providerPmpm: number;
  payerPmpm: number;
  // Two-sided DOWNSIDE (only when tier.twoSided AND actual > benchmark). Provider owes its share of the
  // overspend, CLAMPED by the stop-loss cap. Zero on upside-only tiers — Cat 3A never goes negative.
  overspendPmpm: number; // max(0, actual − benchmark) on two-sided tiers, else 0
  providerLiabilityUncappedPmpm: number; // overspend × provider share (pre-stop-loss)
  providerLiabilityPmpm: number; // ≥ 0, min(uncapped, stop-loss cap) — what the provider OWES
  liabilityClamped: boolean; // true when the stop-loss cap bit
  owes: boolean; // two-sided AND overspend beyond the symmetric loss-side deadband → provider owes
  stopLossCapPmpm: number; // held-constant downside tail cap
  mlrThresholdPmpm: number; // symmetric loss-side deadband = MSR rate × benchmark (minimum-loss rate)
  providerLiabilityTotalUsd: number;
  infraPmpm: number; // upfront infra payment to provider (a cost to payer, funds provider build)
  // NET positions include the two-sided downside: provider net = share + infra − liability; payer net
  // = share − infra + liability (the provider's owed downside is a payer INFLOW). Coalition/red-team fix.
  providerNetPmpm: number;
  providerNetTotalUsd: number;
  payerNetPmpm: number; // payer share − infra + liability received
  poolTotalUsd: number; // sharedPool × member-months (ANNUAL — mm is annual)
  providerTotalUsd: number;
  payerTotalUsd: number;
  payerNetTotalUsd: number;
  infraTotalUsd: number; // infra × member-months (what the payer funds even at $0 pool)
  rebasing: RebaseYear[];
}

/**
 * Model one VBC scenario. Everything is MODELLED except member-months is an explicit held-constant lever.
 * Gating is real Medicaid logic: below the minimum savings rate NOTHING is shared; if the quality gate is
 * missed the provider share is forfeited. Two-sided tiers still compute the same upside here (downside is
 * a corridor concept surfaced in the tier note, not a negative pool in this illustrative view).
 */
export function computeVbcScenario(model: ContractModel): VbcScenario {
  const tier = lanTier(model.tierId);
  const r1 = (n: number): number => Math.round(n * 10) / 10;
  const benchmarkPmpm = tier.benchmarkPmpm;
  const actualPmpm = r1(Math.max(0, tier.actualPmpm + model.actualDeltaPmpm));
  const rawGrossPmpm = benchmarkPmpm - actualPmpm; // SIGNED (negative when actual > benchmark)
  const grossSavingsPmpm = Math.max(0, rawGrossPmpm); // Cat 3A upside floor — never negative
  const msrThresholdPmpm = benchmarkPmpm * model.minSavingsRatePct;
  const meetsMsr = grossSavingsPmpm >= msrThresholdPmpm;
  const qualifies = meetsMsr && model.qualityGateMet;
  const overBenchmark = tier.twoSided && actualPmpm > benchmarkPmpm;

  // Two-sided DOWNSIDE, SYMMETRIC to the upside: a minimum-LOSS rate (the SAME rate as the MSR) forms
  // the loss-side deadband, so within ±(MSR × benchmark) the provider neither shares nor owes. Beyond
  // that deadband on the loss side the provider owes its share of the overspend, clamped by the
  // stop-loss tail cap. Upside-only (Cat 3A, stopLossCap 0) never charges overspend — cannot go negative.
  const mlrThresholdPmpm = msrThresholdPmpm; // symmetric: minimum-loss rate = minimum-savings rate
  const overspendPmpm = tier.twoSided ? Math.max(0, actualPmpm - benchmarkPmpm) : 0;
  const owes = tier.twoSided && overspendPmpm >= mlrThresholdPmpm;
  const providerLiabilityUncappedPmpm = r1((owes ? overspendPmpm : 0) * model.providerSharePct);
  const providerLiabilityPmpm = r1(Math.min(providerLiabilityUncappedPmpm, tier.stopLossCapPmpm));
  const liabilityClamped = owes && providerLiabilityUncappedPmpm > tier.stopLossCapPmpm;

  const gateReason = owes
    ? `Actual exceeds benchmark by $${r1(actualPmpm - benchmarkPmpm)} PMPM, past the ±$${msrThresholdPmpm.toFixed(1)} corridor — the provider OWES its downside share (two-sided), capped at the $${tier.stopLossCapPmpm} stop-loss.`
    : overBenchmark
      ? `Over benchmark but within the ±$${msrThresholdPmpm.toFixed(1)} risk corridor — neither shared savings nor a downside charge.`
      : !meetsMsr
        ? `Below the minimum savings rate (needs ≥ $${msrThresholdPmpm.toFixed(1)} PMPM) — nothing is shared.`
        : !model.qualityGateMet
          ? 'Quality gate not met — provider share is forfeited (Medicaid shared-savings gate).'
          : '';
  const sharedPoolPmpm = qualifies ? grossSavingsPmpm : 0;
  const providerPmpm = r1(sharedPoolPmpm * model.providerSharePct);
  const payerPmpm = r1(sharedPoolPmpm - providerPmpm);

  const infraPmpm = model.pmpmInfra;
  const mm = Math.max(1, model.memberMonths);
  // Net positions carry the downside: the provider's owed liability reduces its net and is a payer INFLOW.
  const providerNetPmpm = r1(providerPmpm + infraPmpm - providerLiabilityPmpm);
  const payerNetPmpm = r1(payerPmpm - infraPmpm + providerLiabilityPmpm);

  // Multi-year rebasing: the benchmark rebases DOWN toward last period's actual each year, compressing
  // future savings — unless rebasing-protection lets the provider keep its earned gains (benchmark holds).
  const rebasing: RebaseYear[] = [];
  let bm = benchmarkPmpm;
  for (let y = 1; y <= 3; y += 1) {
    if (y > 1) bm = model.rebaseProtected ? bm : Math.max(actualPmpm, bm * (1 - model.rebasePct));
    const gross = Math.max(0, bm - actualPmpm);
    const meets = gross >= bm * model.minSavingsRatePct;
    const pool = meets && model.qualityGateMet ? gross : 0;
    const prov = r1(pool * model.providerSharePct);
    // Per-year two-sided downside — same symmetric deadband + stop-loss, so a loss year is not dropped.
    const yOver = tier.twoSided ? Math.max(0, actualPmpm - bm) : 0;
    const yOwes = tier.twoSided && yOver >= bm * model.minSavingsRatePct;
    const yLiab = yOwes ? r1(Math.min(yOver * model.providerSharePct, tier.stopLossCapPmpm)) : 0;
    rebasing.push({
      year: y,
      benchmarkPmpm: r1(bm),
      grossSavingsPmpm: r1(gross),
      sharedPoolPmpm: r1(pool),
      providerPmpm: prov,
      payerPmpm: r1(pool - prov),
      providerLiabilityPmpm: yLiab,
    });
  }

  return {
    tier,
    model,
    twoSided: tier.twoSided,
    benchmarkPmpm,
    actualPmpm,
    rawGrossPmpm: r1(rawGrossPmpm),
    grossSavingsPmpm: r1(grossSavingsPmpm),
    overBenchmark,
    msrThresholdPmpm: r1(msrThresholdPmpm),
    qualifies,
    gateReason,
    sharedPoolPmpm: r1(sharedPoolPmpm),
    providerPmpm,
    payerPmpm,
    overspendPmpm: r1(overspendPmpm),
    providerLiabilityUncappedPmpm,
    providerLiabilityPmpm,
    liabilityClamped,
    owes,
    stopLossCapPmpm: tier.stopLossCapPmpm,
    mlrThresholdPmpm: r1(mlrThresholdPmpm),
    providerLiabilityTotalUsd: Math.round(providerLiabilityPmpm * mm),
    infraPmpm,
    providerNetPmpm,
    providerNetTotalUsd: Math.round(providerNetPmpm * mm),
    payerNetPmpm,
    poolTotalUsd: Math.round(sharedPoolPmpm * mm),
    providerTotalUsd: Math.round(providerPmpm * mm),
    payerTotalUsd: Math.round(payerPmpm * mm),
    payerNetTotalUsd: Math.round(payerNetPmpm * mm),
    infraTotalUsd: Math.round(infraPmpm * mm),
    rebasing,
  };
}

export const fmtUsd = (n: number): string => `$${Math.round(n).toLocaleString()}`;
export const fmtUsdCompact = (n: number): string =>
  Math.abs(n) >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : Math.abs(n) >= 1_000
      ? `$${(n / 1_000).toFixed(0)}k`
      : `$${Math.round(n)}`;
