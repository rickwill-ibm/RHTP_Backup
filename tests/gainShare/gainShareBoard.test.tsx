// @vitest-environment jsdom
/**
 * Render/behavior tests (E13 test-link) for the Gain-Share shell refactor. GainShareBoard is now a
 * shell + three provenance sub-tabs (BoardTabs level="sub", ariaLabel "Gain-share views"). These guard:
 *  • the three sub-tabs render, are a labelled tablist, and switch on click;
 *  • the PERSISTENT header survives across tab switches (banner + provenance key + pinned-epoch strip);
 *  • the active tab controls a labelled, focusable tabpanel (the WAI-ARIA contract completed by the shell).
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';

// StatusBadge is compiled with jsx:preserve (Next.js) and not processed by the vitest transform.
// The gain-share tree does not pull it, but mock it defensively (repo-wide idiom) in case a child does.
vi.mock('@/components/ui/StatusBadge', () => ({
  default: (p: { label: string }) => React.createElement('span', null, p.label),
}));

import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { createSim } from '@/lib/goldenThread/flowSim';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';
import { GainShareBoard } from '@/components/gainShare/GainShareBoard';

afterEach(cleanup);

/** Minimal OperatingSim double — real seeded sim + no-op verbs (the board reads sim + scenario on mount). */
function fakeOp(): OperatingSim {
  const noop = (): void => {};
  return {
    sim: createSim(20260914),
    scenario: 'wa-medicaid',
    running: false,
    play: noop,
    step: noop,
  } as unknown as OperatingSim;
}

describe('GainShareBoard — shell + three provenance sub-tabs', () => {
  it('renders a labelled "Gain-share views" tablist with the three provenance tiers', () => {
    render(<GainShareBoard op={fakeOp()} />);
    const list = screen.getByRole('tablist', { name: 'Gain-share views' });
    expect(list).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    const labels = tabs.map((t) => t.textContent ?? '');
    expect(labels.some((l) => /Payment integrity · real/.test(l))).toBe(true);
    expect(labels.some((l) => /VBC modeler · modelled/.test(l))).toBe(true);
    expect(labels.some((l) => /Glide-path · illustrative/.test(l))).toBe(true);
  });

  it('the persistent banner, provenance key, and pinned-epoch strip are present', () => {
    const { container } = render(<GainShareBoard op={fakeOp()} />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/Two money stories — kept separate/);
    expect(text).toMatch(/438\.6\(c\)/); // pre-certification chip
    expect(text.toLowerCase()).toMatch(/held-constant/); // provenance key
    expect(text).toMatch(/as of seq \d+ · tick \d+/); // pinned-epoch strip
    expect(text).toMatch(/∑ not applicable/); // non-additivity marker
  });

  it('defaults to the REAL payment-integrity view and switches to the modeler on click', () => {
    const { container } = render(<GainShareBoard op={fakeOp()} />);
    // real view active first
    expect(container.textContent).toMatch(/Payment-integrity recovery · real/);
    fireEvent.click(screen.getByText(/VBC modeler · modelled/));
    // the modeler is now mounted…
    expect(container.textContent).toMatch(/Gain-share scenario modeler/);
    // …and the PERSISTENT header is still there across the switch
    expect(container.textContent).toMatch(/Two money stories — kept separate/);
    expect(container.textContent).toMatch(/as of seq \d+ · tick \d+/);
  });

  it('switches to the illustrative glide-path view', () => {
    const { container } = render(<GainShareBoard op={fakeOp()} />);
    fireEvent.click(screen.getByText(/Glide-path · illustrative/));
    expect(container.textContent).toMatch(/Interactive glide path|Follow the money/);
  });

  it('the selected tab controls a labelled, focusable tabpanel (WAI-ARIA contract)', () => {
    render(<GainShareBoard op={fakeOp()} />);
    const selected = screen
      .getAllByRole('tab')
      .find((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected).toBeTruthy();
    const panelId = selected!.getAttribute('aria-controls');
    const panel = document.getElementById(panelId!);
    expect(panel).toBeTruthy();
    expect(panel!.getAttribute('role')).toBe('tabpanel');
    expect(panel!.getAttribute('aria-labelledby')).toBe(selected!.id);
    expect(panel!.getAttribute('tabindex')).toBe('0');
  });
});
