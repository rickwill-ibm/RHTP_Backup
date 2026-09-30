// @vitest-environment jsdom
/**
 * E13 test-link for GAP 5 — IntakeChannelBar. Asserts the four real intake channels render with live
 * counts grouped from sim.txns, that a channel's provenance line is reachable on expand, and that the
 * CMS-0057-F honesty caption is present.
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { createSim, advance } from '@/lib/goldenThread/flowSim';
import { CHANNELS } from '@/lib/goldenThread/intakeChannels';
import { IntakeChannelBar } from '@/components/goldenThread/flow/IntakeChannelBar';

afterEach(cleanup);

describe('IntakeChannelBar', () => {
  it('renders the four channels with live counts and the honesty caption', () => {
    const s = createSim(20260914);
    for (let i = 0; i < 30; i += 1) advance(s);
    const { container } = render(<IntakeChannelBar sim={s} />);
    const text = container.textContent ?? '';
    // All four channel labels are present.
    for (const ch of Object.values(CHANNELS)) expect(text).toContain(ch.label);
    // Live count context.
    expect(text).toMatch(/in flight/);
    // The CMS-0057-F honesty caption.
    expect(text).toMatch(/CMS-0057-F/);
    expect(text).toMatch(/not all-SMART/i);
  });

  it('expands a channel to reveal its provenance line', () => {
    const s = createSim(20260914);
    for (let i = 0; i < 30; i += 1) advance(s);
    render(<IntakeChannelBar sim={s} />);
    const smart = CHANNELS['smart-fhir'];
    fireEvent.click(screen.getByText(smart.label));
    expect(screen.getByText(new RegExp(smart.provenance.slice(0, 20)))).toBeTruthy();
  });
});
