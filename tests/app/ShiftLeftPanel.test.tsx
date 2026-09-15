// @vitest-environment jsdom
/**
 * ShiftLeftPanel — render tests (#501, E13 test-link).
 *
 * Proves the panel renders the CITED figures with their source tags and states the
 * decision-support framing (not a guarantee). PHI-safe (renders no member data).
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ShiftLeftPanel } from '@/components/goldenThread/ShiftLeftPanel';

afterEach(cleanup);

describe('ShiftLeftPanel', () => {
  it('renders the cited baselines with values and source tags', () => {
    render(<ShiftLeftPanel />);
    expect(screen.getByText('~19%')).toBeTruthy();
    expect(screen.getByText('~$265.6B')).toBeTruthy();
    expect(screen.getByText('~$10.97')).toBeTruthy();
    expect(screen.getByText('~$5.79')).toBeTruthy();
    // Source tags appear (may repeat) — at least one KFF/CAQH/JAMA tag each.
    expect(screen.getAllByText('KFF 2024').length).toBeGreaterThan(0);
    expect(screen.getAllByText('CAQH 2023').length).toBeGreaterThan(0);
    expect(screen.getByText('JAMA 2019')).toBeTruthy();
  });

  it('renders the CMS-0057-F compliance horizon dates', () => {
    render(<ShiftLeftPanel />);
    expect(screen.getByText('2026-01-01')).toBeTruthy();
    expect(screen.getByText('2027-01-01')).toBeTruthy();
  });

  it('states the decision-support framing (not a guarantee)', () => {
    render(<ShiftLeftPanel />);
    expect(screen.getByText(/not a guarantee/i)).toBeTruthy();
  });
});
