/**
 * `formatInstantUtc` — the display half of the SSR-safe clock.
 *
 * The hook itself needs a React renderer to exercise, and this repo has no component-test harness;
 * its contract (null on the server and on the first client render, an instant after mount) is
 * asserted at the only place that can see it — the prerendered HTML, which carries the `—`
 * placeholder. What IS unit-testable is the formatter, and its two properties are the ones that
 * matter: a null renders a STABLE placeholder rather than a timestamp (the whole point), and a real
 * instant renders to minute precision with an explicit UTC marker rather than a locale-dependent
 * string that would itself differ between server and client.
 */
import { describe, it, expect } from 'vitest';
import { formatInstantUtc } from '@/lib/client/useMountedInstant';

describe('formatInstantUtc', () => {
  it('renders a stable placeholder for null — never a timestamp', () => {
    // If this ever returned a clock reading, the SSR/client mismatch it exists to prevent comes
    // straight back, and it comes back invisibly.
    expect(formatInstantUtc(null)).toBe('—');
    expect(formatInstantUtc(null)).not.toMatch(/\d/);
  });

  it('renders minute precision with an explicit UTC marker', () => {
    expect(formatInstantUtc('2026-09-28T12:40:15.154Z')).toBe('2026-09-28 12:40 UTC');
  });

  it('is deterministic — the same instant always formats identically', () => {
    // The defect class this module addresses is two renders of one value disagreeing. A formatter
    // that consulted the ambient locale or timezone would reintroduce it one layer down.
    const iso = '2026-01-02T03:04:05.006Z';
    expect(formatInstantUtc(iso)).toBe(formatInstantUtc(iso));
    expect(formatInstantUtc(iso)).toBe('2026-01-02 03:04 UTC');
  });

  it('drops seconds rather than rounding them', () => {
    expect(formatInstantUtc('2026-09-28T12:40:59.999Z')).toBe('2026-09-28 12:40 UTC');
  });
});
