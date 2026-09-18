// @vitest-environment jsdom
/**
 * Render test (E13 test-link) for the v2 container IntuitiveFlowBoard: it mounts against a real
 * seeded sim, renders the 11 ordered spine nodes, and shows the "Following:" spotlight caption.
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('@/components/ui/StatusBadge', () => ({
  default: (p: { label: string }) => React.createElement('span', null, p.label),
}));

import { render, screen, cleanup } from '@testing-library/react';
import { createSim, PATH } from '@/lib/goldenThread/flowSim';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';
import { IntuitiveFlowBoard } from '@/components/goldenThread/flow/IntuitiveFlowBoard';

afterEach(cleanup);

function fakeOp(): OperatingSim {
  const noop = (): void => {};
  return {
    sim: createSim(20260914),
    version: 0,
    running: false,
    speed: 1,
    maturity: 0,
    inCapture: false,
    play: noop,
    step: noop,
    setSpeed: noop,
    spawn: noop,
    batch: noop,
    reset: noop,
    changeMaturity: noop,
    grab: noop,
    route: noop,
  } as unknown as OperatingSim;
}

describe('IntuitiveFlowBoard', () => {
  it('renders 11 ordered spine nodes and the Following: caption', () => {
    const { container } = render(<IntuitiveFlowBoard op={fakeOp()} />);
    // 11 spine nodes are the only role="tab" in the container.
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(PATH.length);
    expect(PATH.length).toBe(11);
    // ordered: each tab, in DOM order, carries its PATH stage label.
    tabs.forEach((t, i) => {
      expect(t.textContent).toContain(PATH[i].stage.label);
    });
    expect(container.textContent).toMatch(/Following:/);
  });
});
