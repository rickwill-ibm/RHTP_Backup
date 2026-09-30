// @vitest-environment jsdom
/**
 * E13 test-link for LiveEventTicker — it renders the REAL sealed-activity stream (`s.events`) against
 * a warmed sim advanced a few more ticks, and asserts (a) events actually render (including the channel
 * intake narration the engine now streams) and (b) the PHI-negative guard: no member/PHI-shaped token
 * ever appears at the rendered surface.
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createSim, advance } from '@/lib/goldenThread/flowSim';
import { LiveEventTicker } from '@/components/goldenThread/flow/LiveEventTicker';

afterEach(cleanup);

// The unambiguous PHI SHAPES (mirrors boardPanels.test.tsx) — each requires the numeric/identifier
// payload that makes a token PHI, so domain language ("member not billed") never trips them.
const PHI = [
  { name: 'SSN (dashed)', re: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: 'member numeric identifier', re: /\bmember[-_ ]?(?:id[-_ :]*)?\d{4,}/i },
  { name: 'medical record number value', re: /\bMRN\b[:#]?\s*\d/i },
  { name: 'date of birth value', re: /\bDOB\b[:#]?\s*\d/i },
];

function warmSim() {
  const s = createSim(20260914);
  for (let i = 0; i < 40; i += 1) advance(s);
  return s;
}

describe('LiveEventTicker', () => {
  it('renders real s.events as an activity feed (incl. channel intake narration)', () => {
    const s = warmSim();
    expect(s.events.length).toBeGreaterThan(0);
    const { container } = render(<LiveEventTicker s={s} />);
    const text = container.textContent ?? '';
    // The most-recent event text renders somewhere in the feed.
    const newest = s.events[s.events.length - 1].text;
    expect(text).toContain(newest);
    // The engine streams channel intake events → the ticker shows them (makes Play visibly stream).
    expect(text).toMatch(/Intake ·/);
    // The tick clock is shown.
    expect(text).toMatch(new RegExp(`tick ${s.tick}`));
  });

  it('surfaces NO PHI-shaped token — including the diane-ma scenario (hero name is synthetic, not PHI)', () => {
    // wa-medicaid AND diane-ma (whose hero-thread event carries the synthetic name "Diane Novak
    // (illustrative)") must both be free of PHI-shaped identifier tokens at the rendered surface.
    for (const scenario of ['wa-medicaid', 'diane-ma'] as const) {
      const s = createSim(20260914, undefined, scenario);
      for (let i = 0; i < 40; i += 1) advance(s);
      const { container } = render(<LiveEventTicker s={s} />);
      const text = container.textContent ?? '';
      for (const p of PHI) expect(text, `${scenario}/${p.name}`).not.toMatch(p.re);
      cleanup();
    }
  });
});
