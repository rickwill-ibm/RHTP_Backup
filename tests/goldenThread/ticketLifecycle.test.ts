import { describe, it, expect } from 'vitest';
import { lifecycleOf, slaRemaining, slaColor } from '@/lib/goldenThread/surveillanceMap';
import { slaAtRisk, type SimState, type LiveTicket } from '@/lib/goldenThread/flowSim';
import { TICKS_PER_HOUR } from '@/lib/goldenThread/workflow';

/**
 * The ticket lifecycle projection is the single source of truth for how a governed ticket reads on
 * every board. These lock the operator-meaningful mapping (New → Assigned → Under review → terminal)
 * and, critically, that an ESCALATED (denied-appeal) matter is NOT folded into a resolved/closed
 * bucket — the defect the "routed / not-routed" flag hid.
 */
describe('lifecycleOf — status/disposition → operator-facing lifecycle', () => {
  it('maps the three open states', () => {
    expect(lifecycleOf('New').key).toBe('new');
    expect(lifecycleOf('New').tone).toBe('new');
    expect(lifecycleOf('Assigned').key).toBe('assigned');
    expect(lifecycleOf('Assigned').tone).toBe('progress');
    expect(lifecycleOf('Proposed').key).toBe('proposed');
    expect(lifecycleOf('Proposed').tone).toBe('review');
  });

  it('separates the THREE terminal dispositions — escalated is its own visible state, not "resolved"', () => {
    expect(lifecycleOf('Closed', 'resolved').key).toBe('resolved');
    expect(lifecycleOf('Closed', 'cleared').key).toBe('cleared');
    const esc = lifecycleOf('Closed', 'escalated');
    expect(esc.key).toBe('escalated');
    expect(esc.tone).toBe('escalated');
    expect(esc.label.toLowerCase()).toContain('arbiter');
    // guard-rail: escalated must never read as resolved or cleared
    expect(esc.key).not.toBe('resolved');
    expect(esc.key).not.toBe('cleared');
  });

  it('degrades safely: a Closed ticket with no/other disposition reads as resolved, never crashes', () => {
    expect(lifecycleOf('Closed').key).toBe('resolved');
    expect(lifecycleOf('Closed', 'action-proposed').key).toBe('resolved');
  });

  it('is a pure function of its inputs (order-independent, referentially transparent)', () => {
    const a = lifecycleOf('Closed', 'escalated');
    const b = lifecycleOf('Closed', 'escalated');
    expect(a).toEqual(b);
    // calling with an unrelated status in between does not change the result
    lifecycleOf('New');
    expect(lifecycleOf('Closed', 'escalated')).toEqual(a);
  });
});

describe('slaRemaining — pure, read-only time-left projection', () => {
  it('is full at birth and depletes to PAST DUE at the deadline', () => {
    const born = 100;
    const full = slaRemaining(born, born, 48);
    expect(full.pct).toBe(1);
    const deadlineTick = born + 48 * TICKS_PER_HOUR;
    const due = slaRemaining(deadlineTick, born, 48);
    expect(due.pct).toBe(0);
    expect(due.label).toBe('PAST DUE');
    // past the deadline never goes negative
    expect(slaRemaining(deadlineTick + 999, born, 48).pct).toBe(0);
  });

  it('never divides by zero on a zero-hour SLA (degenerate input)', () => {
    const r = slaRemaining(5, 0, 0);
    expect(Number.isFinite(r.pct)).toBe(true);
    expect(r.pct).toBe(0);
  });

  it('colors green → amber → red as time runs out', () => {
    expect(slaColor(0.9)).toBe('#24a148');
    expect(slaColor(0.3)).toBe('#b45309');
    expect(slaColor(0.05)).toBe('#da1e28');
  });
});

/**
 * slaAtRisk (the headline "SLA at risk" tile) must use each ticket's OWN window (slaHours ×
 * TICKS_PER_HOUR), the SAME window the per-ticket badge uses — not a fixed span. This locks the
 * badge↔tile agreement across boards so a ticket cannot read PAST DUE on the badge yet go uncounted
 * on the tile. slaAtRisk only reads s.tick + s.tickets, so a minimal partial state suffices.
 */
describe('slaAtRisk — headline count is single-sourced with the per-ticket SLA window', () => {
  const mkTicket = (bornTick: number, slaHours: number): LiveTicket =>
    ({ key: 'LT', ref: 'RPAT-x', bornTick, slaHours, status: 'New' }) as unknown as LiveTicket;
  const stateAt = (tick: number, tickets: LiveTicket[]): SimState =>
    ({ tick, tickets }) as unknown as SimState;

  it('counts a ticket by its OWN slaHours window, not a fixed 120-tick span', () => {
    // 48h ticket → window 96 ticks. At tick 90 only 6 ticks (~6%) remain → at-risk (<20%).
    // A fixed-120 span would compute 25% remaining → NOT at-risk. This is the divergence being locked out.
    expect(slaAtRisk(stateAt(90, [mkTicket(0, 48)]))).toBe(1);
    // Fresh 48h ticket at tick 10 → ~90% remaining → not at-risk.
    expect(slaAtRisk(stateAt(10, [mkTicket(0, 48)]))).toBe(0);
    // 120h ticket → window 240 ticks. At tick 100 → ~58% remaining → not at-risk (a fixed-120 span
    // would have counted it). Only the long-window ticket is excluded, proving slaHours is honored.
    expect(slaAtRisk(stateAt(100, [mkTicket(0, 120), mkTicket(0, 48)]))).toBe(1);
  });

  it('agrees with the badge: at-risk exactly when slaRemaining(...).pct < 0.2', () => {
    for (const [bornTick, slaHours, tick] of [
      [0, 48, 90],
      [0, 48, 10],
      [0, 72, 200],
      [5, 96, 300],
    ] as const) {
      const badgePct = slaRemaining(tick, bornTick, slaHours).pct;
      const counted = slaAtRisk(stateAt(tick, [mkTicket(bornTick, slaHours)])) === 1;
      expect(counted).toBe(badgePct < 0.2);
    }
  });
});
