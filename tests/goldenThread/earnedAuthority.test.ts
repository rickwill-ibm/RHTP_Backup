/**
 * Earned-authority invariants (coalition adversarial-after regression pins).
 *
 * The trust ladder starts at A0 and is EARNED upward; the engine — not just the UI — must enforce it.
 * These assertions each FAIL if the feature is inverted or a future edit re-introduces the "A0 EXECUTED"
 * contradiction the adversarial panel caught.
 */
import { describe, it, expect } from 'vitest';
import {
  createSim,
  proposeOutbound,
  displayAuthority,
  execEarnedCeiling,
  ledgerIntact,
  type SimState,
} from '@/lib/goldenThread/flowSim';

describe('earned authority — cold start & display', () => {
  it('opens at A0 (nothing earned) with a warm, chain-valid book', () => {
    const s = createSim(20260914);
    expect(s.earnedCeiling).toBe(0);
    expect(s.ledgerSeq).toBeGreaterThan(0); // seeded operational book
    expect(ledgerIntact(s)).toBe(true);
  });

  it('is NOT pre-eligible at cold open — A1 is earned live (shadow reset after warm-up)', () => {
    const s = createSim(20260914);
    expect(s.shadow.total).toBe(0);
  });

  it('DISCLOSES every non-human act above the earned ceiling instead of relabelling it (G-039)', () => {
    // THIS ASSERTION WAS INVERTED, AND THE INVERSION IS THE FINDING. It previously read
    // `expect(above.length).toBe(0)` — "no autonomous act is RECORDED above what was earned" — and it
    // was green because `seal` CLAMPED: an act stated at A2 with nothing earned was re-sealed
    // `rung: 'A0'`, `version: 'assist·D2'`, `oversight: 'watch'`. The act still ran. The invariant was
    // satisfied by rewriting the evidence, which is the one way a safety pin must never go green.
    //
    // What is true of this engine today: the modelled fleet runs its pipeline at A2 while the trust
    // ladder says A0, across ten agent actors — 218 of 251 warm-start rows. The record now says so on
    // every one of them, and `assessCeiling` (ceilingRecord.ts) is detection, not prevention.
    // ADMISSION CONTROL — holding the act, the way `proposeOutbound` already does — is G-039, W8.
    const s = createSim(20260914);
    const floor = Math.max(1, execEarnedCeiling(s));
    const above = s.ledger.filter((e) => !e.human && Number(e.rung.replace(/[^0-9]/g, '')) > floor);
    expect(above.length).toBeGreaterThan(0); // the gap is real; pretending otherwise was the defect
    // EVERY one of them carries the disclosure. A single undisclosed over-ceiling act is the whole
    // failure mode back, because an auditor's query would then silently miss it.
    for (const e of above) {
      expect(e.overCeiling, `${e.actor} seq ${e.seq} acted at ${e.rung} with no disclosure`).toBe(
        true
      );
      expect(e.earnedCeiling).toBe(execEarnedCeiling(s));
    }
    // and the advisory exemption is REAL, not vacuous: agent acts at A1 (fairness-screen,
    // clock-jeopardy) are governed by the human gate, not the earned ceiling, so they are NOT flagged.
    const advisoryA1 = s.ledger.filter((e) => !e.human && e.rung === 'A1');
    expect(advisoryA1.length).toBeGreaterThan(0);
    for (const e of advisoryA1) expect(e.overCeiling).toBe(false);
  });

  it('never seals an A0/A1 non-human "EXECUTED" act', () => {
    const s = createSim(20260914);
    const bad = s.ledger.filter(
      (e) => !e.human && /EXECUTED/.test(e.decision) && Number(e.rung.replace(/[^0-9]/g, '')) < 2
    );
    expect(bad.length).toBe(0);
  });
});

describe('displayAuthority — single source', () => {
  const cold = (): SimState => createSim(20260914, 0); // no warm-up, earned A0

  it('does NOT cap detection/advisory (human-gated) verdicts — surveillance stays alive at A0', () => {
    const da = displayAuthority('A2', true, cold());
    expect(da.shown).toBe('A2');
    expect(da.capped).toBe(false);
    expect(da.oversight).toBe('HITL');
  });

  it('caps autonomous action above Advise to the earned ceiling, with watch-only oversight at A0', () => {
    const da = displayAuthority('A2', false, cold());
    expect(da.shown).toBe('A0');
    expect(da.capped).toBe(true);
    expect(da.oversight).toBe('watch'); // A0 is watch, not 'none' (which is A3/autonomous)
  });

  it('does not cap A1 (Advise) — only autonomy above Advise is earned-gated', () => {
    const da = displayAuthority('A1', false, cold());
    expect(da.capped).toBe(false);
  });
});

describe('proposeOutbound — engine-level earned gate', () => {
  it('routes a non-gated action to a human PROPOSAL when the fleet has not earned A2', () => {
    const s = createSim(20260914); // A0
    const t = s.tickets.find((x) => x.status !== 'Closed');
    expect(t).toBeTruthy();
    proposeOutbound(s, t!.key, 'Notice of review to provider', false);
    const last = s.ledger[s.ledger.length - 1];
    expect(last.human).toBe(true);
    expect(last.rung).toBe('A1');
    expect(last.decision).toMatch(/PROPOSED/);
    expect(last.decision).not.toMatch(/EXECUTED/);
  });

  it('executes autonomously (A2) once the fleet has earned A2', () => {
    const s = createSim(20260914);
    s.maturity = 0.8;
    s.earnedCeiling = 2;
    const t = s.tickets.find((x) => x.status !== 'Closed');
    proposeOutbound(s, t!.key, 'Coding-education note', false);
    const last = s.ledger[s.ledger.length - 1];
    expect(last.human).toBe(false);
    expect(last.rung).toBe('A2');
    expect(last.decision).toMatch(/EXECUTED/);
  });
});
