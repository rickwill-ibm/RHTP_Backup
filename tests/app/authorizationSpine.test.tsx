// @vitest-environment jsdom
/**
 * Behavior test (E13 test-link) for the HERO AuthorizationSpine: 11 nodes in PATH order; a real
 * keyboard tablist (Arrow/Home/End move focus AND call onFocus, with wrap); exactly one node is
 * aria-selected/aria-current with tabIndex 0; and the 7 UM substeps render at the payer-ops node.
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('@/components/ui/StatusBadge', () => ({
  default: (p: { label: string }) => React.createElement('span', null, p.label),
}));

import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { createSim, PATH } from '@/lib/goldenThread/flowSim';
import { LANE_LABEL } from '@/lib/goldenThread/e2eFlow';
import {
  AuthorizationSpine,
  SPINE_PANEL_ID,
  spineTabId,
} from '@/components/goldenThread/flow/AuthorizationSpine';

afterEach(cleanup);

const sim = createSim(20260914);
const PAYER_OPS_IDX = PATH.findIndex((p) => p.stage.key === 'payer-ops');

describe('AuthorizationSpine', () => {
  it('renders 11 nodes in PATH (seq) order', () => {
    render(<AuthorizationSpine sim={sim} focused={0} onFocus={() => {}} />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(11);
    tabs.forEach((t, i) => expect(t.textContent).toContain(PATH[i].stage.label));
  });

  it('keyboard model: Right/Left/Home/End move to DISTINCT indices from a middle node', () => {
    const onFocus = vi.fn();
    // focused fixed at the MIDDLE node (5), so each key must resolve to a different index — a no-op
    // handler could not satisfy all four assertions.
    render(<AuthorizationSpine sim={sim} focused={5} onFocus={onFocus} />);
    const list = screen.getByRole('tablist', { name: 'Authorization stages' });
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(onFocus).toHaveBeenLastCalledWith(6);
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(onFocus).toHaveBeenLastCalledWith(4);
    fireEvent.keyDown(list, { key: 'Home' });
    expect(onFocus).toHaveBeenLastCalledWith(0);
    fireEvent.keyDown(list, { key: 'End' });
    expect(onFocus).toHaveBeenLastCalledWith(10);
  });

  it('keyboard model: arrows wrap at both ends', () => {
    const onFocus = vi.fn();
    const { rerender } = render(<AuthorizationSpine sim={sim} focused={0} onFocus={onFocus} />);
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' });
    expect(onFocus).toHaveBeenLastCalledWith(10); // first → wraps to last
    rerender(<AuthorizationSpine sim={sim} focused={10} onFocus={onFocus} />);
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(onFocus).toHaveBeenLastCalledWith(0); // last → wraps to first
  });

  it('roving tabindex: exactly one node is selected with tabIndex 0', () => {
    render(<AuthorizationSpine sim={sim} focused={3} onFocus={() => {}} />);
    const tabs = screen.getAllByRole('tab');
    const selected = tabs.filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0].getAttribute('tabindex')).toBe('0');
    expect(selected[0].getAttribute('aria-current')).toBe('step');
    expect(tabs.filter((t) => t.getAttribute('tabindex') === '0')).toHaveLength(1);
  });

  it('renders the 7 UM substeps when the focused node is payer-ops', () => {
    render(<AuthorizationSpine sim={sim} focused={PAYER_OPS_IDX} onFocus={() => {}} />);
    expect(screen.getAllByTestId('um-substep')).toHaveLength(7);
  });

  it('completes the ARIA tabs contract: each tab has an id and controls the focus panel', () => {
    render(<AuthorizationSpine sim={sim} focused={2} onFocus={() => {}} />);
    const tabs = screen.getAllByRole('tab');
    tabs.forEach((t, i) => {
      expect(t.id).toBe(spineTabId(i));
      expect(t.getAttribute('aria-controls')).toBe(SPINE_PANEL_ID);
    });
  });

  it('names each acting party in TEXT (not color alone) — WCAG 1.4.1', () => {
    render(<AuthorizationSpine sim={sim} focused={0} onFocus={() => {}} />);
    const tabs = screen.getAllByRole('tab');
    tabs.forEach((t, i) => {
      expect(t.textContent).toContain(LANE_LABEL[PATH[i].stage.lane]);
    });
  });
});
