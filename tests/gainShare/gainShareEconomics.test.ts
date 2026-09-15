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
    const unprotected = computeVbcScenario({ ...defaultModel('cat3a'), rebaseProtected: false, rebasePct: 0.02 });
    const y1 = unprotected.rebasing[0].sharedPoolPmpm;
    const y3 = unprotected.rebasing[2].sharedPoolPmpm;
    expect(y3).toBeLessThan(y1); // benchmark rebases down → pool shrinks

    const protectedS = computeVbcScenario({ ...defaultModel('cat3a'), rebaseProtected: true, rebasePct: 0.02 });
    expect(protectedS.rebasing[2].sharedPoolPmpm).toBe(protectedS.rebasing[0].sharedPoolPmpm); // held
  });

  it('is deterministic', () => {
    const a = computeVbcScenario(defaultModel('cat4'));
    const b = computeVbcScenario(defaultModel('cat4'));
    expect(a).toEqual(b);
  });
});
