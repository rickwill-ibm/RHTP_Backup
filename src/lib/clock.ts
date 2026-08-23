// clock.ts: deterministic time / randomness seam (mechanical hardening, Cycle 1).
//
// Pattern (applied consistently across src/lib engines/services):
//   module-level defaults that preserve production behavior exactly
//   (Date.now / new Date / Math.random), plus exported test setters so
//   tests can pin time and randomness without mocking globals.
//
// Usage at call sites:
//   import * as clock from '@/lib/clock';
//   clock.now()      // instead of Date.now()
//   clock.nowDate()  // instead of new Date()   (no-arg form only)
//   clock.nowIso()   // instead of new Date().toISOString()
//   clock.rng()      // instead of Math.random()

export type Clock = () => number;
export type Rng = () => number;

let _now: Clock = () => Date.now();
let _rng: Rng = () => Math.random();

/** Epoch millis via the injected clock (default: Date.now()). */
export const now = (): number => _now();

/** Current Date via the injected clock (default: new Date()). */
export const nowDate = (): Date => new Date(_now());

/** Current ISO-8601 timestamp via the injected clock. */
export const nowIso = (): string => new Date(_now()).toISOString();

/** Uniform [0,1) via the injected rng (default: Math.random()). */
export const rng = (): number => _rng();

/** Test seam: override the clock. Pass null/undefined to restore the default. */
export function setClock(fn?: Clock | null): void {
  _now = fn ?? (() => Date.now());
}

/** Test seam: override the rng. Pass null/undefined to restore the default. */
export function setRng(fn?: Rng | null): void {
  _rng = fn ?? (() => Math.random());
}
