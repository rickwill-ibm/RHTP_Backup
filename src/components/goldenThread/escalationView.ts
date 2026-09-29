/**
 * escalationView.ts — the pure derivations the Escalation Console renders.
 *
 * Extracted so the breach rule is testable without React and cannot drift back into a
 * presentational one-liner. No React, no clock read: `asOfIso` is injected by the caller
 * (from `@/lib/clock`), so a test pins the instant.
 *
 * THE DEFECT THIS REPLACES: the console read `breached = escalationStep !== null`. A hop is
 * produced by `routeEscalation` against ITS `now`, which the console's page freezes at
 * `DEMO_THREAD_TS`. So an item due 2026-09-06 rendered "within SLA" on 2026-09-27 — the
 * screen whose job is to show an overdue item could not detect one. Breach is now EITHER
 * signal: a hop already fired, OR the due-by has passed as of the real clock.
 */
import type { PartyQueueItem } from '@/lib/goldenThread/escalationRouter';
import type { EscalationStep } from '@/lib/agentRuntime/escalation';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type BreachReason =
  'no-item' | 'within-sla' | 'past-due' | 'hop-fired' | 'due-by-unreadable';

export interface BreachState {
  breached: boolean;
  reason: BreachReason;
  /** Whole days past the due-by as of `asOfIso`; 0 when not past due. */
  daysPastDue: number;
}

/**
 * True when `dueBy` has passed as of `asOfIso`.
 *
 * Boundary: due-by `<= now` is breached — the SLA is met only while there is time LEFT,
 * matching `isSlaBreached`/`part2Consent`'s `<=` convention elsewhere in the repo.
 *
 * FAIL-CLOSED: an absent or unreadable due-by returns true. A regulated SLA timer we cannot
 * evaluate must surface as needing attention, never as "within SLA".
 */
export function isDueByBreached(dueBy: string | null | undefined, asOfIso: string): boolean {
  if (typeof dueBy !== 'string' || dueBy.trim() === '') return true;
  const due = Date.parse(dueBy);
  const asOf = Date.parse(asOfIso);
  if (Number.isNaN(due) || Number.isNaN(asOf)) return true;
  return due <= asOf;
}

/** Whole days between the due-by and `asOfIso`, floored at 0. */
function daysPastDue(dueBy: string, asOfIso: string): number {
  const due = Date.parse(dueBy);
  const asOf = Date.parse(asOfIso);
  if (Number.isNaN(due) || Number.isNaN(asOf)) return 0;
  const elapsed = asOf - due;
  if (elapsed <= 0) return 0;
  return Math.floor(elapsed / MS_PER_DAY);
}

/** Derive the console's breach state from the routed escalation and the injected instant. */
export function escalationBreachState(
  routed: { queueItem: PartyQueueItem | null; escalationStep: EscalationStep | null },
  asOfIso: string
): BreachState {
  const { queueItem, escalationStep } = routed;
  if (queueItem === null) {
    // No routed item: nothing to breach. Distinct from "within SLA" so the chip can say so.
    return { breached: false, reason: 'no-item', daysPastDue: 0 };
  }
  if (escalationStep !== null) {
    // A hop has already fired — the engine escalated it, so it is breached by definition.
    return {
      breached: true,
      reason: 'hop-fired',
      daysPastDue: daysPastDue(queueItem.dueBy, asOfIso),
    };
  }
  const unreadable =
    typeof queueItem.dueBy !== 'string' || Number.isNaN(Date.parse(queueItem.dueBy));
  if (unreadable) return { breached: true, reason: 'due-by-unreadable', daysPastDue: 0 };
  if (isDueByBreached(queueItem.dueBy, asOfIso)) {
    return {
      breached: true,
      reason: 'past-due',
      daysPastDue: daysPastDue(queueItem.dueBy, asOfIso),
    };
  }
  return { breached: false, reason: 'within-sla', daysPastDue: 0 };
}

/**
 * THE ONE SLA VOCABULARY on this screen: the routed item's CMS-0057-F clock — 72h expedited
 * / 168h (7d) standard, from `slaHours(priority)` in `workflow/paMachine`.
 *
 * The screen previously stated TWO numbers as "SLA": this one (168h, priority `standard`) and
 * the escalation-policy tier's (72h, priority `routine`), which read as a contradiction. The
 * item's regulated clock is the one kept and the only thing called an SLA; see
 * `hopIntervalLabel` for the other number.
 */
export function slaLabel(item: Pick<PartyQueueItem, 'slaHours' | 'priority'>): string {
  return `${item.slaHours}h (${item.priority})`;
}

/**
 * The escalation-policy tier's interval, named for what it IS — how long each hop waits
 * before the next one fires — not a second SLA. The tier's own priority vocabulary
 * (routine / urgent / deadline-unknown) is the agent escalation policy's, distinct from the
 * item's CMS-0057-F expedited / standard, so it is labelled as such rather than conflated.
 */
export function hopIntervalLabel(tier: { priority: string; slaHours: number }): string {
  return `${tier.slaHours}h per hop · escalation tier '${tier.priority}'`;
}
