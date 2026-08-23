/**
 * Seeded PRNG + tiny generator helpers for property-style tests (Cycle 2A).
 *
 * mulberry32 — small, fast, deterministic. Every property test seeds its own
 * generator with a FIXED literal seed so runs are exactly reproducible; no
 * external property-testing library is used (conventions: no new packages).
 */

export type Rng = () => number;

/** mulberry32 PRNG — returns a function yielding uniform floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max] inclusive. */
export function int(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Float in [min, max). */
export function float(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Boolean with probability p of true (default 0.5). */
export function bool(rng: Rng, p = 0.5): boolean {
  return rng() < p;
}

/** Uniform pick from a non-empty array. */
export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[int(rng, 0, arr.length - 1)];
}

/** Value with probability p, otherwise undefined. */
export function maybe<T>(rng: Rng, value: T, p = 0.5): T | undefined {
  return rng() < p ? value : undefined;
}

/** Random string of length [minLen, maxLen] drawn from an alphabet. */
export function str(rng: Rng, alphabet: string, minLen: number, maxLen: number): string {
  const len = int(rng, minLen, maxLen);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[int(rng, 0, alphabet.length - 1)];
  return out;
}

/** Random subset (possibly empty) of an array, preserving order. */
export function subset<T>(rng: Rng, arr: readonly T[], p = 0.5): T[] {
  return arr.filter(() => rng() < p);
}

/** Run `n` seeded cases; the case index is passed for failure diagnostics. */
export function forCases(n: number, seed: number, body: (rng: Rng, i: number) => void): void {
  const rng = mulberry32(seed);
  for (let i = 0; i < n; i++) body(rng, i);
}
