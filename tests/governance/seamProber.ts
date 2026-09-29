/**
 * A shared seam prober for the governance fail-closed suite.
 *
 * Extracted because `seamFailClosed.test.ts` is at its 500-line cap and because this is the third
 * seam of the identical shape — a prober copied per seam is a prober that drifts per seam, and the
 * whole point of this suite is that every fail-closed-stub seam is checked the SAME way.
 */
import { expect } from 'vitest';
import { setSessionDataMode } from '@/lib/config/dataMode';

/**
 * A seam prober for the `getX()` shape: production with nothing registered THROWS the declared
 * error; mock and seeded both resolve the seeded instance, with no mock-only shortcut.
 *
 * Written generically because it is the third seam of this exact shape, and because a prober copied
 * per seam is a prober that drifts per seam.
 */
export function modeProber<T>(
  seam: Parameters<typeof setSessionDataMode>[0],
  get: () => T,
  seeded: T,
  NotConfigured: new (...a: never[]) => Error
): () => void {
  return () => {
    setSessionDataMode(seam, 'production');
    expect(() => get()).toThrow(NotConfigured);
    for (const mode of ['seeded', 'mock'] as const) {
      setSessionDataMode(seam, mode);
      expect(get()).toBe(seeded);
    }
  };
}
