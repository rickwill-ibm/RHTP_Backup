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

  it('never records a non-human AUTONOMOUS act (rung > A1) above the earned ceiling — advisory A1 is exempt', () => {
    const s = createSim(20260914);
    // Single-sourced with displayAuthority: only AUTONOMOUS action above Advise is earned-capped. An agent
    // may always DETECT and ADVISE (A1) — governed by the human gate, not the earned ceiling — so an A1
    // advisory seal records A1 honestly at cold-start A0 instead of being clamped to A0/watch. The ceiling
    // any non-human act may be recorded at is therefore max(A1, earned), never below A1 for advisory work.
    const floor = Math.max(1, execEarnedCeiling(s));
    const above = s.ledger.filter((e) => !e.human && Number(e.rung.replace(/[^0-9]/g, '')) > floor);
    expect(above.length).toBe(0); // no autonomous act recorded above what was earned
    // and the exemption is REAL, not vacuous: advisory agent acts (fairness-screen, clock-jeopardy) record
    // A1 at cold start — the badge↔provenance contradiction the adversarial panel caught is closed.
    const advisoryA1 = s.ledger.filter((e) => !e.human && e.rung === 'A1');
    expect(advisoryA1.length).toBeGreaterThan(0);
  });

  it('never seals an A0/A1 non-human "EXECUTED" act', () => {
    const s = createSim(20260914);
    const bad = s.ledger.filter((e) => !e.human && /EXECUTED/.test(e.decision) && Number(e.rung.replace(/[^0-9]/g, '')) < 2);
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
