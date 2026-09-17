// @vitest-environment jsdom
/**
 * Render test (E13 test-link) for FlowCanvas (and, through it, the split FlowCanvasTokens layer):
 * it mounts against a real seeded sim and renders the transport controls + the counter strip.
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('@/components/ui/StatusBadge', () => ({
  default: (p: { label: string }) => React.createElement('span', null, p.label),
}));

import { render, cleanup } from '@testing-library/react';
import { createSim } from '@/lib/goldenThread/flowSim';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';
import { FlowCanvas } from '@/components/goldenThread/flow/FlowCanvas';

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

describe('FlowCanvas', () => {
  it('mounts and renders the transport + counter strip', () => {
    const { container } = render(<FlowCanvas op={fakeOp()} focused={5} />);
    const text = container.textContent ?? '';
    // transport
    expect(text).toMatch(/Play/);
    expect(text).toContain('278 prior-auth');
    expect(text).toContain('837 batch');
    // counters
    expect(text).toContain('In flight');
    expect(text).toContain('Approved');
    expect(text).toContain('Touchless');
  });
});
