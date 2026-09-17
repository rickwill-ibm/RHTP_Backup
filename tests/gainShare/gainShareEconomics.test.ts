/**
 * gain-share economics — deterministic unit tests. Guards the coalition's must-fixes:
 *  • recovery ROI is REAL, correctly-signed, MLR-aware, and NEVER split payer/provider;
 *  • the VBC modeler gates on the minimum-savings-rate and the quality gate (real Medicaid logic);
 *  • rebasing compresses future savings unless protected;
 *  • everything is pure/deterministic (same input → same output).
 */
import { describe, it, expect } from 'vitest';
import { createSim } from '@/lib/goldenThread/flowSim';
import {
  computeRecoveryRoi,
  computeVbcScenario,
  defaultModel,
  lanTier,
  LAN_TIERS,
} from '@/lib/gainShare/gainShareEconomics';

describe('Payment-Integrity ROI (real, from the recon sub-ledger)', () => {
  it('is a correctly-signed, epoch-stamped snapshot', () => {
    const s = createSim(20260914);
    const roi = computeRecoveryRoi(s);
    expect(roi.recoverableUsd).toBeGreaterThanOrEqual(0);
    expect(roi.returnableUsd).toBeGreaterThanOrEqual(0);
    expect(roi.realizedUsd).toBeGreaterThanOrEqual(0);
    // realized can never exceed identified recoverable
    expect(roi.realizedUsd).toBeLessThanOrEqual(roi.recoverableUsd);
    expect(roi.realizedPct).toBeGreaterThanOrEqual(0);
    expect(roi.realizedPct).toBeLessThanOrEqual(1);
    // epoch stamp is the pinned ledger boundary
    expect(roi.epoch.ledgerSeq).toBe(s.ledgerSeq);
    expect(roi.epoch.tick).toBe(s.tick);
    // MLR awareness is stated, not hand-waved
    expect(roi.mlrNote).toMatch(/438\.8/);
  });

  it('is deterministic (same seed → identical ROI)', () => {
    const a = computeRecoveryRoi(createSim(20260914));
    const b = computeRecoveryRoi(createSim(20260914));
    expect(a).toEqual(b);
  });
});

describe('VBC modeler (modelled, LAN ladder)', () => {
  it('uses the HCP-LAN taxonomy, not "sub-cap as a rung"', () => {
    expect(LAN_TIERS.map((t) => t.id)).toEqual(['cat3a', 'cat3b', 'cat4']);
    expect(lanTier('cat3a').twoSided).toBe(false);
    expect(lanTier('cat3b').twoSided).toBe(true);
    expect(lanTier('cat4').lan).toMatch(/Cat 4/);
  });

  it('splits the qualifying pool provider/payer with no recovery dollars mixed in', () => {
    const v = computeVbcScenario(defaultModel('cat3b'));
    expect(v.qualifies).toBe(true);
    // provider + payer exactly reconstitute the shared pool (no third party, no recovery)
    expect(Math.round((v.providerPmpm + v.payerPmpm) * 10) / 10).toBe(v.sharedPoolPmpm);
    expect(v.poolTotalUsd).toBe(Math.round(v.sharedPoolPmpm * v.model.memberMonths));
  });

  it('shares NOTHING below the minimum savings rate', () => {
    const m = { ...defaultModel('cat3a'), minSavingsRatePct: 0.9 }; // absurdly high MSR
    const v = computeVbcScenario(m);
    expect(v.qualifies).toBe(false);
    expect(v.sharedPoolPmpm).toBe(0);
    expect(v.providerPmpm).toBe(0);
    expect(v.gateReason).toMatch(/minimum savings rate/i);
  });

  it('forfeits the provider share when the quality gate is missed', () => {
    const v = computeVbcScenario({ ...defaultModel('cat3b'), qualityGateMet: false });
    expect(v.qualifies).toBe(false);
    expect(v.providerPmpm).toBe(0);
    expect(v.gateReason).toMatch(/quality gate/i);
  });

  it('rebasing compresses future savings unless protected', () => {
    const unprotected = computeVbcScenario({
      ...defaultModel('cat3a'),
      rebaseProtected: false,
      rebasePct: 0.02,
    });
    const y1 = unprotected.rebasing[0].sharedPoolPmpm;
    const y3 = unprotected.rebasing[2].sharedPoolPmpm;
    expect(y3).toBeLessThan(y1); // benchmark rebases down → pool shrinks

    const protectedS = computeVbcScenario({
      ...defaultModel('cat3a'),
      rebaseProtected: true,
      rebasePct: 0.02,
    });
    expect(protectedS.rebasing[2].sharedPoolPmpm).toBe(protectedS.rebasing[0].sharedPoolPmpm); // held
  });

  it('is deterministic', () => {
    const a = computeVbcScenario(defaultModel('cat4'));
    const b = computeVbcScenario(defaultModel('cat4'));
    expect(a).toEqual(b);
  });
});

describe('annual dimensional consistency (the "/mo" 12× overstatement fix)', () => {
  it('poolTotal / member-months reconstitutes the PMPM (totals are PMPM × annual member-months)', () => {
    const v = computeVbcScenario(defaultModel('cat3b'));
    expect(v.model.memberMonths).toBe(120_000);
    // pool_total / member_months == PMPM (the totals are ANNUAL member-months × a per-month rate)
    expect(v.poolTotalUsd / v.model.memberMonths).toBeCloseTo(v.sharedPoolPmpm, 1);
    expect(v.providerTotalUsd / v.model.memberMonths).toBeCloseTo(v.providerPmpm, 1);
    expect(v.payerTotalUsd / v.model.memberMonths).toBeCloseTo(v.payerPmpm, 1);
  });
});

describe('two-sided downside (the biggest domain gap)', () => {
  it('Cat 4 clamps at the stop-loss cap at the UI-reachable slider max (+90)', () => {
    // +90 is the LeversRail perf-slider max — the clamp must be demonstrable through the UI, not only
    // at an out-of-band value (red-team reachability fix). Cat 4: benchmark 535, base actual 480, cap $20.
    const v = computeVbcScenario({ ...defaultModel('cat4'), actualDeltaPmpm: 90 });
    expect(v.owes).toBe(true);
    expect(v.actualPmpm).toBeGreaterThan(v.benchmarkPmpm);
    expect(v.qualifies).toBe(false);
    expect(v.sharedPoolPmpm).toBe(0);
    expect(v.providerLiabilityPmpm).toBe(v.stopLossCapPmpm); // uncapped 21 > cap 20 → clamped
    expect(v.liabilityClamped).toBe(true);
    expect(v.gateReason).toMatch(/owes|downside/i);
  });

  it('SYMMETRIC deadband: an overspend within the ±MSR corridor owes NOTHING', () => {
    // Cat 3B: benchmark 527, base actual 500, MSR/MLR = 527×2% = $10.54. +30 → actual 530, overspend 3
    // (< 10.54) → inside the corridor → neither shares nor owes (the symmetric-corridor honesty fix).
    const v = computeVbcScenario({ ...defaultModel('cat3b'), actualDeltaPmpm: 30 });
    expect(v.overBenchmark).toBe(true);
    expect(v.owes).toBe(false);
    expect(v.providerLiabilityPmpm).toBe(0);
    expect(v.gateReason).toMatch(/corridor/i);
  });

  it('beyond the corridor the provider owes, unclamped when share < stop-loss', () => {
    // +42 → actual 542, overspend 15 (> MLR 10.54) → owes 15×0.6 = $9.0 < $12 cap → unclamped.
    const v = computeVbcScenario({ ...defaultModel('cat3b'), actualDeltaPmpm: 42 });
    expect(v.owes).toBe(true);
    expect(v.providerLiabilityPmpm).toBeGreaterThan(0);
    expect(v.providerLiabilityPmpm).toBeLessThan(v.stopLossCapPmpm);
    expect(v.liabilityClamped).toBe(false);
  });

  it('net dollars carry the downside: provider net −liability, payer net +liability (they reconcile)', () => {
    const v = computeVbcScenario({ ...defaultModel('cat4'), actualDeltaPmpm: 90 });
    expect(v.owes).toBe(true);
    // provider net = share + infra − liability; payer net = share − infra + liability
    expect(v.providerNetPmpm).toBeCloseTo(
      v.providerPmpm + v.infraPmpm - v.providerLiabilityPmpm,
      1
    );
    expect(v.payerNetPmpm).toBeCloseTo(v.payerPmpm - v.infraPmpm + v.providerLiabilityPmpm, 1);
    expect(v.providerNetTotalUsd).toBe(Math.round(v.providerNetPmpm * v.model.memberMonths));
    // the owed liability is a payer inflow — the two net PMPM figures reconcile to (pool − 0) since
    // pool is 0 here: provider net + payer net = infra − infra = 0 at a fully-gated downside.
    expect(v.providerNetPmpm + v.payerNetPmpm).toBeCloseTo(0, 1);
  });

  it('Cat 3A (upside-only) never goes negative and never owes a downside', () => {
    const m = { ...defaultModel('cat3a'), actualDeltaPmpm: 120 }; // drive actual far above benchmark
    const v = computeVbcScenario(m);
    expect(v.twoSided).toBe(false);
    expect(v.overBenchmark).toBe(false); // upside-only → never flagged over-benchmark
    expect(v.grossSavingsPmpm).toBe(0); // floored at 0
    expect(v.sharedPoolPmpm).toBe(0);
    expect(v.providerPmpm).toBe(0);
    expect(v.providerLiabilityPmpm).toBe(0); // no downside, ever
    expect(v.stopLossCapPmpm).toBe(0);
  });
});

describe('infra netting (payer net = share − infra)', () => {
  it('payer net PMPM subtracts the infra the payer funds', () => {
    const v = computeVbcScenario(defaultModel('cat3a')); // infra defaults to $2.0 PMPM on Cat 3A
    expect(v.infraPmpm).toBeGreaterThan(0);
    expect(v.payerNetPmpm).toBeCloseTo(v.payerPmpm - v.infraPmpm, 1);
    expect(v.payerNetTotalUsd).toBe(Math.round(v.payerNetPmpm * v.model.memberMonths));
    expect(v.infraTotalUsd).toBe(Math.round(v.infraPmpm * v.model.memberMonths));
  });

  it('at a $0 pool the payer still funds infra (surfaced, non-zero)', () => {
    const v = computeVbcScenario({ ...defaultModel('cat3a'), minSavingsRatePct: 0.9 });
    expect(v.sharedPoolPmpm).toBe(0);
    expect(v.infraTotalUsd).toBeGreaterThan(0); // the cost that must be surfaced in the gated-out branch
    expect(v.payerNetPmpm).toBeCloseTo(-v.infraPmpm, 1); // net negative — payer pays for zero return
  });
});
