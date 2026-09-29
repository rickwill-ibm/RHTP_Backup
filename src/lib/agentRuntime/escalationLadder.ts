// SEAM: escalation-ladder
/**
 * THE ESCALATION LADDER AND ITS TERMINAL.
 *
 * Extracted from `engine.ts` under the quality ratchet (never grow a baselined file). The extraction
 * is not cosmetic: the ladder is the one part of the runtime with a REGULATORY reading risk, and
 * putting it behind a narrow port makes the set of things it can touch enumerable — it can schedule a
 * timer, enqueue a work item, emit an event, read the clock, and terminate an instance. It cannot
 * reach the pending map, cannot resolve a proposal, and cannot synthesise a `HumanDecision`.
 *
 * THE SECOND HALF OF THAT SENTENCE WAS FALSE WHEN FIRST WRITTEN. The port was narrow and the RECORD
 * was not: `PendingRecord.resolve` came in with it, so one line inside `abandon` — `rec.resolve({
 * decision: 'approved', … })` — would have compiled clean, resumed the suspended body after the
 * runtime declared the work abandoned, and run its `useTool` effect invisibly, which is precisely the
 * failure `WorkflowTerminatedError` exists to describe. A throwing `resolve` in the test fixture was
 * standing in for a capability boundary; a runtime tripwire in a fixture is not one. `LadderRecord`
 * removes the capability at the type level, which is what the paragraph above claims.
 *
 * WHAT IT IS NOT: a regulatory terminal. See register G-047. The escalation SLA is an INTERNAL review
 * clock measured from `proposeAndWait`. 42 CFR 438.210(d) runs from RECEIPT OF THE REQUEST FOR
 * SERVICE, which this runtime never observes; and 42 CFR 438.404(c)(5) makes an untimely decision a
 * denial with a notice due on the date the timeframe expires. Abandonment here issues no notice and
 * starts no appeal clock, so it must never be read as, or converted into, a determination.
 */
import type { EscalationStep } from './escalation';
import { nextEscalationStep } from './escalation';
import type { PendingRecord } from './engineSupport';

/**
 * The record, minus the one capability the ladder must never hold.
 *
 * `resolve` resumes the suspended workflow body. Everything else on the record the ladder does need:
 * it advances `hopsSoFar`, re-stamps `item`, and re-arms `timerId`.
 */
export type LadderRecord = Omit<PendingRecord, 'resolve'>;

/**
 * Everything the ladder is permitted to do. Deliberately minimal — a port that also exposed the
 * pending map would let a future edit resolve the proposal from inside the terminal, which is the
 * one move the terminal exists to refuse.
 */
export interface LadderPort {
  /** Is this record still the live pending one? False once decided, which cancels the hop. */
  isCurrent(rec: LadderRecord): boolean;
  now(): number;
  scheduleTimer(memberId: string, delayMs: number, fire: () => Promise<void>): string;
  enqueue(rec: LadderRecord): Promise<void>;
  emit(
    rec: LadderRecord,
    eventType: 'agent.task.escalated' | 'agent.task.abandoned',
    occurredAtMs: number,
    payload: Record<string, unknown>
  ): Promise<void>;
  /** Settle the INSTANCE into the `abandoned` terminal. Does not touch the proposal. */
  terminate(workflowId: string): void;
}

/**
 * Arm the SLA timer for one hop. Re-arms itself on each `escalate` step; hands off to `abandon` when
 * the hierarchy is exhausted. Resolution of the proposal happens ONLY through an external qualified
 * human signal — there is no auto-approve timer on this path, by construction: nothing in this module
 * can call `decide`.
 */
export function scheduleEscalation(port: LadderPort, rec: LadderRecord): void {
  rec.timerId = port.scheduleTimer(rec.memberId, rec.tier.slaHours * 3600_000, async () => {
    if (!port.isCurrent(rec)) return; // decided -> this hop is cancelled
    const step: EscalationStep = nextEscalationStep(rec.tier, rec.hopsSoFar);
    const now = port.now();
    if (step.kind === 'escalate') {
      rec.hopsSoFar += 1;
      rec.item = { ...rec.item, queue: 'escalated' };
      // THE RE-ARM IS IN `finally`, AND THAT IS THE WHOLE POINT. It used to be the last statement
      // after two awaits on injected seams. A single transient failure of the event sink or the
      // inbox — a real outbox writer against a store that hiccups — left `hopsSoFar` already
      // advanced, the item already in the `escalated` queue, and NO timer armed: the proposal sits
      // in `escalated` forever with no further hop and no terminal, indistinguishable from one
      // actively escalating. That is G-001 exactly, reintroduced through the error path.
      try {
        await port.enqueue(rec);
        await port.emit(rec, 'agent.task.escalated', now, {
          hop: 'escalate',
          level: step.level,
          target: step.target,
          priority: rec.action.priority,
        });
      } finally {
        scheduleEscalation(port, rec); // next hop after another SLA window
      }
      return;
    }
    await abandon(port, rec, step.auditedHops, now);
  });
}

/**
 * THE TERMINAL (register G-001). The ladder is exhausted and no human acted.
 *
 * WHAT THIS REPLACED. `rec.parked = true` — a field with two writes and ZERO reads in `src/` — under
 * the comment "parked with audit; re-activatable, NEVER silently expired". That branch emitted one
 * more `agent.task.escalated` with `hop: 'park'`, scheduled no timer, left the work item at
 * `queue: 'escalated'` and `status: 'pending'`, and never settled the workflow. So the item was not
 * invisible, which is how it was first described — it was INDISTINGUISHABLE from a proposal still
 * actively escalating, while the workflow sat in `waiting-decision` forever and `handle.done` never
 * resolved. "Re-activatable" named no mechanism.
 *
 * THREE THINGS IT DOES, AND ONE IT DELIBERATELY DOES NOT.
 *
 *  1. TERMINATES THE INSTANCE with its own status. Not a synthesised `HumanDecision`: `decision` is
 *     `'approved' | 'rejected'`, and `paAgent`, `referralAgent` and `governedAction` all test for
 *     `'rejected'` and treat everything else as approval — so widening that union would have
 *     compiled clean and routed an abandonment into the EXECUTION branch. `'rejected'` would be
 *     worse still: a timer-manufactured adverse benefit determination carrying 42 CFR 438.404
 *     notice and appeal duties that nothing here discharges.
 *  2. MOVES THE ITEM TO ITS OWN QUEUE, so a reviewer scanning `escalated` sees live work and a
 *     reviewer scanning `parked` sees abandoned work. Mislabelling was the actual defect.
 *  3. EMITS `agent.task.abandoned` — its own event type, not a fifth `escalated`.
 *
 * AND IT LEAVES THE PENDING RECORD IN PLACE — FOR VISIBILITY, NOT FOR RESUMPTION. The first cut of
 * this comment claimed the surviving record made the row "re-activatable". That was false, and
 * dangerously so: the workflow body is still suspended on its `decided.promise`, so resolving the
 * record would have RESUMED it — running the body's `useTool` effect after the runtime had declared
 * the work abandoned, with `settle()` then early-returning on the already-settled instance, so the
 * effect would never appear in the event stream. `decide()` therefore refuses a decision on a
 * terminated workflow with `WorkflowTerminatedError`. The record survives so that refusal is LOUD and
 * the parked row stays queryable; re-activation is a human act — re-file the work — and this runtime
 * provides no mechanism for it. Saying otherwise was the declared-not-bound defect again (G-054).
 */
export async function abandon(
  port: LadderPort,
  rec: LadderRecord,
  auditedHops: readonly string[],
  now: number
): Promise<void> {
  rec.item = { ...rec.item, queue: 'parked' };
  // INVARIANT: status stays 'pending' — the workflow ended, the proposal did not.
  await port.enqueue(rec);
  await port.emit(rec, 'agent.task.abandoned', now, {
    auditedHops: [...auditedHops],
    priority: rec.action.priority,
    actionType: rec.action.actionType,
  });
  port.terminate(rec.workflowId);
}
