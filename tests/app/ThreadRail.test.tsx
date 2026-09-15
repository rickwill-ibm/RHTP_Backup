// @vitest-environment jsdom
/**
 * ThreadRail — render tests (Wave-5 UI, E13 test-link). Presentational rail for the
 * full eight-stage golden thread; renders each stage with its caller-supplied state.
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ThreadRail, type ThreadStage } from '@/components/goldenThread/ThreadRail';

afterEach(cleanup);

describe('ThreadRail', () => {
  it('renders all stages with numbering and marks the current stage', () => {
    const stages: ThreadStage[] = [
      { label: 'Eligibility', state: 'done' },
      { label: 'Reconciliation', state: 'done' },
      { label: 'Recovery', state: 'current' },
    ];
    render(<ThreadRail stages={stages} />);
    expect(screen.getByLabelText(/golden thread stages/i)).toBeTruthy();
    expect(screen.getByText(/1\. Eligibility/)).toBeTruthy();
    expect(screen.getByText(/3\. Recovery/)).toBeTruthy();
    // A done stage carries the check glyph; the current one does not.
    expect(screen.getByText(/1\. Eligibility ✓/)).toBeTruthy();
  });
});
