// @vitest-environment jsdom
/**
 * stars-hedis-mips route loading fallback — the segment-level Suspense boundary
 * that satisfies useSearchParams() static rendering on that page (see E16 shift-left
 * + loading.tsx). Links the module for E13 and proves the fallback renders.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Loading from '@/app/stars-hedis-mips/loading';

describe('stars-hedis-mips loading fallback', () => {
  it('renders the loading-measures fallback', () => {
    render(<Loading />);
    expect(screen.getByText(/loading measures/i)).toBeTruthy();
    cleanup();
  });
});
