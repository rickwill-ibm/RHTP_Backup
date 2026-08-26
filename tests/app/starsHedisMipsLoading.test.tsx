/**
 * stars-hedis-mips route loading fallback — the segment-level Suspense boundary that
 * satisfies useSearchParams() static rendering (see loading.tsx + E16 shift-left).
 * Render-free (no jsdom / testing-library) so it cannot flake; links the module for E13.
 */
import { describe, it, expect } from 'vitest';
import Loading from '@/app/stars-hedis-mips/loading';

describe('stars-hedis-mips loading fallback', () => {
  it('returns a fallback element carrying the loading copy', () => {
    const el = Loading() as { props: { className?: string; children?: unknown } };
    expect(el).toBeTruthy();
    expect(String(el.props.children)).toMatch(/loading measures/i);
  });
});
