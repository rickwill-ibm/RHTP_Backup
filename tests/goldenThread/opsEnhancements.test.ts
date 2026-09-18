import { describe, it, expect } from 'vitest';
import { createSim, advance, startAppealWorkflow } from '@/lib/goldenThread/flowSim';
import { slaBook } from '@/lib/goldenThread/slaBook';
import { recoveryWaterfall } from '@/lib/goldenThread/reconReport';
import { stageGate } from '@/lib/goldenThread/stageGovernance';
import { STAGES, verdict } from '@/lib/goldenThread/e2eFlow';
import type { AutonomyTier } from '@/lib/agents/manifest/types';
import type { EvidenceTier } from '@/lib/evidence/tierConfig';

/**
 * Regression guards for the Operations/Reconciliation enhancement honesty invariants — the negative
 * space a green conformance gate cannot reach (adversarial POST-review finding #1).
 */

describe('slaBook — no ratio over an empty set (attainment honesty)', () => {
  it('cold start: attainment / turnaround / first-touch are null (render "—"), never NaN or a vacuous 100%', () => {
    const s = createSim(20260914);
    const p = slaBook(s).portfolio;
    // At warm start nothing has been closed or claimed → the rates must be null, not 0/NaN/100.
    expect(p.attainmentPct).toBeNull();
    expect(p.resolutionMedianHrs).toBeNull();
    expect(p.firstTouchMedianHrs).toBeNull();
    // counts are still real numbers, never NaN
    for (const n of [p.openCount, p.breachCount, p.approachingCount, p.closedCount]) {
      expect(Number.isFinite(n)).toBe(true);
    }
  });

  it('per-seat within-SLA is null for an idle seat and a 0–100 integer otherwise (never NaN)', () => {
    const s = createSim(20260914);
    for (const seat of slaBook(s).seats) {
      expect(seat.depth).toBeGreaterThan(0); // only seats with open work are listed
      if (seat.withinSlaPct !== null) {
        expect(seat.withinSlaPct).toBeGreaterThanOrEqual(0);
        expect(seat.withinSlaPct).toBeLessThanOrEqual(100);
      }
      // breaches + within cannot exceed depth
      expect(seat.breaches).toBeLessThanOrEqual(seat.depth);
    }
  });
});

describe('recoveryWaterfall — dollar invariants hold (no over-claim)', () => {
  it('in-dispute ≤ identified and expected ≤ in-dispute, with and without a filed appeal', () => {
    const s = createSim(20260914);
    for (let i = 0; i < 150; i += 1) advance(s);
    // no appeals filed yet → nothing pursued
    const w0 = recoveryWaterfall(s.reconLedger, new Set());
    expect(w0.inDisputeUsd).toBe(0);
    expect(w0.expectedRealizationIfPursuedUsd).toBe(0);
    expect(w0.inDisputeUsd).toBeLessThanOrEqual(w0.identifiedUsd);

    // file one appeal → in-dispute becomes a subset of identified, expected is 68% of pursued
    const rec = s.reconLedger.find((r) => r.reconClass === 'underpayment' && !r.routed);
    expect(rec).toBeTruthy();
    startAppealWorkflow(s, rec!.seq);
    const pursued = new Set(
      s.workflows.map((wf) => wf.reconSeq).filter((n): n is number => n !== undefined)
    );
    const w1 = recoveryWaterfall(s.reconLedger, pursued);
    expect(w1.inDisputeUsd).toBeGreaterThan(0);
    expect(w1.inDisputeUsd).toBeLessThanOrEqual(w1.identifiedUsd);
    expect(w1.expectedRealizationIfPursuedUsd).toBeLessThanOrEqual(w1.inDisputeUsd);
    expect(w1.expectedRealizationIfPursuedUsd).toBe(Math.round(w1.inDisputeUsd * 0.68));
  });
});

describe('stageGate — the what-if gate is structured and reproduces every stage’s real gate', () => {
  it('drift guard: feeding stageGate(key) into verdict() reproduces each stage’s sealed requiresHuman', () => {
    for (const stage of STAGES) {
      const v = verdict(
        stage.verdict.manifestTier,
        stage.verdict.evidenceTier,
        stageGate(stage.key)
      );
      expect(v.requiresHuman, `stage ${stage.key}`).toBe(stage.verdict.requiresHuman);
    }
  });

  it('a payer-facing submission stays human-gated at the MAX tier (autonomous · D3) — never auto-executable', () => {
    for (const key of ['pas-submit', 'recovery'] as const) {
      const v = verdict('autonomous' as AutonomyTier, 'D3' as EvidenceTier, stageGate(key));
      expect(v.requiresHuman, key).toBe(true);
    }
    // an ungated stage floats to agent-may-act at the max tier (proves the gate isn't blanket)
    const free = verdict('autonomous' as AutonomyTier, 'D3' as EvidenceTier, stageGate('crd'));
    expect(free.requiresHuman).toBe(false);
  });
});
