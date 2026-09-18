import { describe, it, expect } from 'vitest';
import { ticketActions, type TicketActionCtx } from '@/lib/goldenThread/surveillanceMap';

/**
 * ticketActions is the SINGLE source of truth for what the shared <TicketActionBar> offers on the
 * Process-flow, Operations and Surveillance surfaces. These lock the invariants the adversarial
 * pre-review required BEFORE this was wired to four boards:
 *   • it never emits a DISPOSITION verb (propose/resolve/clear/appeal) — only grab/route/open — so it
 *     can never adjudicate an adverse action or a workflow-owned transition (no "second authority");
 *   • grab/route are the only INLINE verbs (both non-adverse); everything else defers to the workbench;
 *   • a workflow-backed ticket defers WHOLESALE (the WfState machine owns its transitions);
 *   • Surveillance is a monitoring lens — it may route/grab a New detection but defers all disposition;
 *   • no open (non-Closed) ticket is ever a dead-end — `open` is always present until Closed.
 */
const ctx = (o: Partial<TicketActionCtx> = {}): TicketActionCtx => ({
  surface: 'flow',
  routed: false,
  hasWorkflow: false,
  ...o,
});
const DISPOSITION = new Set(['propose', 'resolve', 'clear', 'startAppeal']);

describe('ticketActions — the governed action projection', () => {
  it('never emits a disposition verb on ANY surface / status / context (only grab | route | open)', () => {
    for (const surface of ['flow', 'operations', 'surveillance', 'workbench'] as const) {
      for (const status of ['New', 'Assigned', 'Proposed', 'Closed'] as const) {
        for (const routed of [true, false]) {
          for (const hasWorkflow of [true, false]) {
            const acts = ticketActions(status, ctx({ surface, routed, hasWorkflow }));
            for (const a of acts) {
              expect(DISPOSITION.has(a.verb)).toBe(false);
              expect(['grab', 'route', 'open']).toContain(a.verb);
              // only grab/route ever execute inline; open always defers to the workbench
              expect(a.inline).toBe(a.verb === 'grab' || a.verb === 'route');
            }
          }
        }
      }
    }
  });

  it('a Closed ticket is terminal — no actions', () => {
    expect(ticketActions('Closed', ctx())).toEqual([]);
    expect(ticketActions('Closed', ctx({ surface: 'surveillance' }))).toEqual([]);
    expect(ticketActions('Closed', ctx({ hasWorkflow: true }))).toEqual([]);
  });

  it('a workflow-backed ticket defers WHOLESALE to the workbench (WfState machine owns transitions)', () => {
    for (const status of ['New', 'Assigned', 'Proposed'] as const) {
      const acts = ticketActions(status, ctx({ hasWorkflow: true }));
      expect(acts.map((a) => a.verb)).toEqual(['open']);
      expect(acts[0].inline).toBe(false);
    }
  });

  it('New (unrouted) offers route + grab + open; grab is primary and inline', () => {
    const acts = ticketActions('New', ctx({ routed: false }));
    expect(acts.map((a) => a.verb)).toEqual(['route', 'grab', 'open']);
    expect(acts.find((a) => a.verb === 'grab')!.primary).toBe(true);
    expect(acts.find((a) => a.verb === 'route')!.inline).toBe(true);
  });

  it('New (already routed) drops route but still offers grab + open', () => {
    const acts = ticketActions('New', ctx({ routed: true }));
    expect(acts.map((a) => a.verb)).toEqual(['grab', 'open']);
  });

  it('Assigned and Proposed are never dead-ends — open is always present', () => {
    for (const surface of ['flow', 'operations'] as const) {
      expect(ticketActions('Assigned', ctx({ surface })).length).toBeGreaterThan(0);
      expect(ticketActions('Proposed', ctx({ surface })).length).toBeGreaterThan(0);
      // the only verb is `open` — disposition happens in the workbench, not on the queue
      expect(ticketActions('Assigned', ctx({ surface })).every((a) => a.verb === 'open')).toBe(
        true
      );
      expect(ticketActions('Proposed', ctx({ surface })).every((a) => a.verb === 'open')).toBe(
        true
      );
    }
  });

  it('Surveillance may route/grab a NEW detection but defers every disposition (decision #2)', () => {
    // New on surveillance still routes/grabs (a monitoring lens can triage a fresh detection)
    expect(ticketActions('New', ctx({ surface: 'surveillance' })).map((a) => a.verb)).toEqual([
      'route',
      'grab',
      'open',
    ]);
    // but once claimed/proposed, surveillance only opens — no cross-queue disposition
    expect(ticketActions('Assigned', ctx({ surface: 'surveillance' })).map((a) => a.verb)).toEqual([
      'open',
    ]);
    expect(ticketActions('Proposed', ctx({ surface: 'surveillance' })).map((a) => a.verb)).toEqual([
      'open',
    ]);
  });

  it('is pure — same inputs give an equal result, order-independent', () => {
    const a = ticketActions('New', ctx({ routed: false }));
    ticketActions('Proposed', ctx({ surface: 'surveillance' }));
    const b = ticketActions('New', ctx({ routed: false }));
    expect(a).toEqual(b);
  });
});
