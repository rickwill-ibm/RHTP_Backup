/**
 * CMS-0057-F decision clock (Workstream H2).
 *
 * The federal timeframes: EXPEDITED 72 hours, STANDARD 7 calendar days (168 hours). This computes
 * the due date and a three-state posture (on-track / at-risk / breached) "as of" a given moment, so
 * a case can show a live countdown and a returning user/agent can query where the clock stands.
 *
 * The SLA hours mirror `@/lib/workflow/paMachine.slaHours` (72 / 24*7); the runtime store pairs this
 * with the existing `workQueue.isSlaBreached` + `routeToQueue`. Pure + deterministic (asOf supplied).
 */
export type Priority = 'expedited' | 'standard';
export type ClockState = 'on-track' | 'at-risk' | 'breached';

const HOUR_MS = 3_600_000;

/** SLA window in hours — mirrors paMachine.slaHours (expedited 72h, standard 7 calendar days). */
export function slaHoursFor(priority: Priority): number {
  return priority === 'expedited' ? 72 : 24 * 7;
}

/** Default "at-risk" threshold (hours of remaining runway) by priority. */
function defaultAtRiskHours(priority: Priority): number {
  return priority === 'expedited' ? 12 : 24;
}

export interface DecisionClock {
  priority: Priority;
  slaHours: number;
  submittedAt: string;
  dueBy: string;
  asOf: string;
  /** Hours remaining until due (negative once breached). */
  remainingHours: number;
  state: ClockState;
}

export interface DecisionClockOptions {
  /** Remaining-hours threshold below which the clock is "at-risk". */
  atRiskHours?: number;
}

/** Compute the decision clock for a submitted PA as of a moment. */
export function paDecisionClock(
  submittedAt: string,
  priority: Priority,
  asOf: string,
  opts: DecisionClockOptions = {}
): DecisionClock {
  const slaHours = slaHoursFor(priority);
  const dueMs = Date.parse(submittedAt) + slaHours * HOUR_MS;
  const remainingMs = dueMs - Date.parse(asOf);
  const remainingHours = remainingMs / HOUR_MS;
  const atRisk = opts.atRiskHours ?? defaultAtRiskHours(priority);

  let state: ClockState;
  if (remainingMs <= 0) state = 'breached';
  else if (remainingHours <= atRisk) state = 'at-risk';
  else state = 'on-track';

  return {
    priority,
    slaHours,
    submittedAt,
    dueBy: new Date(dueMs).toISOString(),
    asOf,
    remainingHours,
    state,
  };
}

/** Compact countdown label, e.g. "18h left" / "2h left · at risk" / "overdue 3h". */
export function decisionClockLabel(clock: DecisionClock): string {
  if (clock.state === 'breached') {
    return `overdue ${Math.abs(Math.round(clock.remainingHours))}h`;
  }
  const h = Math.max(0, Math.round(clock.remainingHours));
  return clock.state === 'at-risk' ? `${h}h left · at risk` : `${h}h left`;
}
