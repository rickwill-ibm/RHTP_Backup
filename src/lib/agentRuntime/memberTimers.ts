/**
 * THE TIMER WHEEL AND THE PER-MEMBER LOCK.
 *
 * Extracted from `engine.ts` under the quality ratchet. These two mechanisms are one responsibility:
 * every timer fires UNDER its member's lock, so the ordering guarantee and the firing mechanism
 * cannot be reasoned about separately, and splitting them across files would let a future edit
 * schedule work that runs outside the lock.
 *
 * TWO INVARIANTS THIS FILE OWNS.
 *
 *  1. DETERMINISM. Time advances only through `advance()`, never from `Date.now()`. Due timers fire
 *     in (dueAtMs, insertion-seq) order, re-derived after EACH fire because a fired timer may
 *     schedule another that is already due — a single pre-sorted pass would run the new timer late,
 *     or not at all, depending on array identity.
 *  2. PER-MEMBER ORDERING. All work for one memberId serialises on a promise chain. `next` is chained
 *     with `prev.then(fn, fn)` so a REJECTED predecessor still runs the successor: a thrown refusal
 *     (`assertSignalDecider`, for one) must not wedge every later decision for that member. The
 *     stored chain swallows the rejection; the returned promise does not, so the caller still sees it.
 */
import type { ManualClock } from './clock';
import type { TimerEntry } from './engineSupport';

export class MemberTimers {
  private readonly timers = new Map<string, TimerEntry>();
  private readonly memberChains = new Map<string, Promise<void>>();
  private counter = 0;

  constructor(private readonly clock: ManualClock) {}

  schedule(memberId: string, delayMs: number, fire: () => Promise<void>): string {
    const id = `t${this.counter++}`;
    this.timers.set(id, {
      id,
      memberId,
      dueAtMs: this.clock.now() + delayMs,
      seq: this.counter,
      cancelled: false,
      fire,
    });
    return id;
  }

  /**
   * Cancel and RECLAIM. Marking `cancelled = true` and retaining the entry kept the `fire` closure
   * alive for the process lifetime — and that closure captures the whole `PendingRecord` (member id,
   * action, refs) and, for ladder timers, the port, which closes over the engine. Every decided
   * proposal left a PHI-bearing closure behind. The `cancelled` flag stays for an entry a caller
   * holds a reference to mid-advance.
   */
  cancel(id: string): void {
    const t = this.timers.get(id);
    if (t) t.cancelled = true;
    this.timers.delete(id);
  }

  /** Serialise `fn` behind any work already queued for this member. */
  runOnMember(memberId: string, fn: () => Promise<void>): Promise<void> {
    const prev = this.memberChains.get(memberId) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.memberChains.set(
      memberId,
      next.catch(() => undefined)
    );
    return next;
  }

  /** Advance virtual time by `ms` and fire every timer now due, each under its member lock. */
  async advance(ms: number): Promise<void> {
    const target = this.clock.advance(ms);
    const errors: unknown[] = [];
    for (;;) {
      const due = [...this.timers.values()]
        .filter((t) => !t.cancelled && t.dueAtMs <= target)
        .sort((a, b) => a.dueAtMs - b.dueAtMs || a.seq - b.seq);
      if (due.length === 0) break;
      const t = due[0];
      this.timers.delete(t.id);
      // ISOLATED PER TIMER. This used to be a bare `await`, so one rejecting `fire()` aborted the
      // loop and every OTHER member's due timer in the same window silently never fired — a
      // cross-member starvation in the module whose header claims per-member ordering as its
      // invariant. Errors are collected and raised AFTER the wheel drains, so the failure stays
      // loud without taking the other members' SLA clocks with it.
      try {
        await this.runOnMember(t.memberId, () => t.fire());
      } catch (err) {
        errors.push(err);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'timer callbacks failed');
  }
}
