// @vitest-environment jsdom
/**
 * FlowBoards — router/composition test (E13 test-link for the top-level view switch).
 *
 * FlowBoards owns the real useOperatingSim() hook and routes between six boards via the shared
 * BoardTabs primitive. This test unit-isolates the ROUTER: every child board is mocked to a light
 * sentinel (they each carry their own dedicated render tests), so this file proves exactly what
 * FlowBoards is responsible for — the top tab bar renders, and switching tabs swaps the child board
 * in — without dragging the heavy board graphs (or their jsx:preserve leaf components) into the
 * transform. Mocking siblings is the correct isolation for a router component.
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';

// Sentinel for each routed board — asserts the switch, not the board internals. Factories are
// hoisted above imports, so each inlines its own React.createElement (no shared top-level helper).
vi.mock('@/components/goldenThread/flow/ProcessFlowBoard', () => ({
  ProcessFlowBoard: () => React.createElement('div', null, 'MOCK ProcessFlowBoard'),
}));
vi.mock('@/components/goldenThread/flow/LiveProcessFlowBoard', () => ({
  LiveProcessFlowBoard: () => React.createElement('div', null, 'MOCK LiveProcessFlowBoard'),
}));
vi.mock('@/components/goldenThread/flow/OperationsBoard', () => ({
  OperationsBoard: () => React.createElement('div', null, 'MOCK OperationsBoard'),
}));
vi.mock('@/components/goldenThread/flow/ReconciliationBoard', () => ({
  ReconciliationBoard: () => React.createElement('div', null, 'MOCK ReconciliationBoard'),
}));
vi.mock('@/components/goldenThread/flow/SurveillanceConsole', () => ({
  SurveillanceConsole: () => React.createElement('div', null, 'MOCK SurveillanceConsole'),
}));
vi.mock('@/components/goldenThread/flow/PartyWorkbench', () => ({
  PartyWorkbench: () => React.createElement('div', null, 'MOCK PartyWorkbench'),
}));
vi.mock('@/components/gainShare/GainShareBoard', () => ({
  GainShareBoard: () => React.createElement('div', null, 'MOCK GainShareBoard'),
}));

import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { FlowBoards } from '@/components/goldenThread/flow/FlowBoards';

afterEach(cleanup);

describe('FlowBoards — top-level view router', () => {
  it('renders the Golden Thread view tab bar and the default (flow) board', () => {
    render(<FlowBoards stages={[]} tickets={[]} forensic={[]} recordId="rec-test" analyses={[]} />);
    expect(screen.getByRole('tablist', { name: 'Golden Thread views' })).toBeTruthy();
    // Default view is the process flow — under the default scenario that is the live board.
    expect(screen.getByText(/MOCK LiveProcessFlowBoard/)).toBeTruthy();
  });

  it('switches to Operations and Gain-Share when their tabs are clicked', () => {
    render(<FlowBoards stages={[]} tickets={[]} forensic={[]} recordId="rec-test" analyses={[]} />);
    fireEvent.click(screen.getByText('Operations'));
    expect(screen.getByText(/MOCK OperationsBoard/)).toBeTruthy();
    fireEvent.click(screen.getByText('Gain-Share'));
    expect(screen.getByText(/MOCK GainShareBoard/)).toBeTruthy();
  });
});
