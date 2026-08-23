/**
 * A manual, deterministic clock for the runtime + its timer wheel. The engine
 * is driven off an injected `now()`; a Temporal-class engine would use its own
 * deterministic time API behind the same seam. Virtual time only advances when
 * the test (or a driver) calls `advance()` — timers never fire on wall time, so
 * every run is reproducible.
 */
export interface ManualClock {
  /** Current virtual time (epoch millis). */
  now(): number;
  /** Advance virtual time by `ms` (returns the new now). Fires nothing itself. */
  advance(ms: number): number;
  /** Jump virtual time to an absolute epoch-millis value (must not go backward). */
  set(ms: number): number;
}

/** Create a manual clock anchored at `startMs`. */
export function createManualClock(startMs: number): ManualClock {
  let t = startMs;
  return {
    now: () => t,
    advance: (ms: number) => {
      if (ms < 0) throw new RangeError(`ManualClock.advance: negative ms ${ms}`);
      t += ms;
      return t;
    },
    set: (ms: number) => {
      if (ms < t) throw new RangeError(`ManualClock.set: time cannot go backward (${ms} < ${t})`);
      t = ms;
      return t;
    },
  };
}
