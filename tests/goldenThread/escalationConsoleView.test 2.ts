/**
 * escalationConsoleView.test.ts — the escalation console cannot miss a breach again.
 *
 * The defect: `EscalationConsole.tsx:99` read `const breached = escalationStep !== null`.
 * Breach was inferred from whether a hop had ALREADY fired, never from comparing `dueBy` to
 * now. The router computes `escalationStep` against a FROZEN demo instant
 * (`DEMO_THREAD_TS`, 2026-08-30), so the rendered item — submitted 2026-08-30, SLA 168h,
 * due 2026-09-06 — showed "within SLA" on 2026-09-27, 21 days past due.
 *
 * `escalationBreachState` is the derivation: a hop that fired OR a due-by in the past is a
 * breach, judged against an INJECTED instant.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  escalationBreachState,
  isDueByBreached,
  slaLabel,
  hopIntervalLabel,
} from '@/components/goldenThread/escalationView';
import type { PartyQueueItem } from '@/lib/goldenThread/escalationRouter';
import type { EscalationStep } from '@/lib/agentRuntime/escalation';

const NOW = '2026-09-27T00:00:00.000Z';

/** The item the console actually renders today. */
const RENDERED_ITEM: PartyQueueItem = {
  recordRef: 'record-masked',
  queue: 'agent-proposal',
  disposition: 'recovery-draft',
  priority: 'standard',
  slaHours: 168,
  submittedAt: '2026-08-30T00:00:00.000Z',
  dueBy: '2026-09-06T00:00:00.000Z',
  code: 'draft-appeal',
  note: 'Underpayment recovery draft-appeal DRAFT awaiting review',
};

const HOP: EscalationStep = { kind: 'escalate', level: 0, target: 'team-lead', slaHours: 72 };

describe('isDueByBreached — boundary and fail-closed reads', () => {
  it('a due-by in the past is breached', () => {
    expect(isDueByBreached('2026-09-06T00:00:00.000Z', NOW)).toBe(true);
  });

  it('a due-by EXACTLY at now is breached', () => {
    expect(isDueByBreached(NOW, NOW)).toBe(true);
  });

  it('a due-by one millisecond after now is NOT breached', () => {
    expect(isDueByBreached('2026-09-27T00:00:00.001Z', NOW)).toBe(false);
  });

  it('an unreadable due-by is treated as breached, never as within SLA', () => {
    expect(isDueByBreached('not-a-date', NOW)).toBe(true);
    expect(isDueByBreached('', NOW)).toBe(true);
    expect(isDueByBreached(null, NOW)).toBe(true);
  });
});

describe('escalationBreachState — the rendered item', () => {
  it('the item on screen is BREACHED as of today even though no hop has fired', () => {
    const state = escalationBreachState({ queueItem: RENDERED_ITEM, escalationStep: null }, NOW);
    expect(state.breached).toBe(true);
    expect(state.reason).toBe('past-due');
    expect(state.daysPastDue).toBe(21);
  });

  it('the old rule alone (escalationStep !== null) would have reported within SLA', () => {
    // This is the exact fail-open being fixed: the router froze its own clock, so the hop
    // is null and the screen concluded the item was fine.
    expect(RENDERED_ITEM.dueBy < NOW).toBe(true);
    const oldRule = null !== null;
    expect(oldRule).toBe(false);
  });

  it('a hop that has already fired is a breach regardless of the clock', () => {
    const notYetDue = { ...RENDERED_ITEM, dueBy: '2030-01-01T00:00:00.000Z' };
    const state = escalationBreachState({ queueItem: notYetDue, escalationStep: HOP }, NOW);
    expect(state.breached).toBe(true);
    expect(state.reason).toBe('hop-fired');
  });

  it('an item genuinely inside its SLA is within SLA', () => {
    const inWindow = { ...RENDERED_ITEM, dueBy: '2026-10-04T00:00:00.000Z' };
    const state = escalationBreachState({ queueItem: inWindow, escalationStep: null }, NOW);
    expect(state.breached).toBe(false);
    expect(state.reason).toBe('within-sla');
    expect(state.daysPastDue).toBe(0);
  });

  it('no routed item is not a breach, and says so distinctly', () => {
    const state = escalationBreachState({ queueItem: null, escalationStep: null }, NOW);
    expect(state.breached).toBe(false);
    expect(state.reason).toBe('no-item');
  });
});

describe('one SLA vocabulary', () => {
  it('slaLabel states the item CMS-0057-F clock — hours and priority together', () => {
    expect(slaLabel(RENDERED_ITEM)).toBe('168h (standard)');
  });

  it('hopIntervalLabel never calls the escalation-policy number an SLA', () => {
    const label = hopIntervalLabel({ priority: 'routine', slaHours: 72 });
    expect(label).toContain('72h');
    expect(label.toLowerCase()).not.toContain('sla');
  });
});

describe('the component consumes the derivation', () => {
  const rel = 'src/components/goldenThread/EscalationConsole.tsx';
  const src = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');

  it('no longer infers breach from escalationStep alone', () => {
    expect(src).not.toMatch(/const breached = escalationStep !== null/);
    expect(src).toMatch(/escalationBreachState\(/);
  });

  it('reads the clock through the injected seam, not a bare wall-clock call', () => {
    expect(src).toMatch(/from '@\/lib\/clock'/);
    expect(src).not.toMatch(/Date\.now\(\)|new Date\(\)/);
  });

  it('presents exactly one "SLA" number — the escalation tier is a hop interval', () => {
    expect(src).not.toMatch(/SLA\{' '\}\s*\n\s*\{tier\.slaHours\}/);
    expect(src).toMatch(/hopIntervalLabel\(/);
  });
});
