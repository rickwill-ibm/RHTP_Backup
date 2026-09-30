// @vitest-environment jsdom
/**
 * E13 test-link for the LIVE QueueHealthPanel rewrite — it groups open detections by accountable seat
 * and projects each seat's oldest-open age, worst SLA % and aging/past-due counts from s.tick. This
 * guards that the per-seat table renders against real sim state and keeps the honesty block.
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createSim } from '@/lib/goldenThread/flowSim';
import { seedTicketByRef } from '@/lib/goldenThread/e2eFlow';
import { detectionRoute } from '@/lib/goldenThread/surveillanceMap';
import { QueueHealthPanel } from '@/components/goldenThread/flow/QueueHealthPanel';
import type { Detection } from '@/components/goldenThread/flow/LiveDetectionFeed';

afterEach(cleanup);

function seededDetections(): { s: ReturnType<typeof createSim>; dets: Detection[] } {
  const s = createSim(20260914);
  const dets = s.tickets
    .map((t) => ({ t, seed: seedTicketByRef(t.ref) }))
    .filter((d): d is Detection => !!d.seed && d.t.status !== 'Closed');
  return { s, dets };
}

describe('QueueHealthPanel (live per-seat)', () => {
  it('renders a per-seat table with oldest-open age and worst SLA, plus the honesty block', () => {
    const { s, dets } = seededDetections();
    expect(dets.length).toBeGreaterThan(0);
    const { container } = render(<QueueHealthPanel s={s} detections={dets} />);
    const text = container.textContent ?? '';
    // The live per-seat columns are present.
    expect(text).toMatch(/Oldest open/);
    expect(text).toMatch(/Worst SLA/);
    // At least one accountable seat is rendered, and an oldest-open age in hours + an SLA %.
    const seat = detectionRoute(dets[0].t.role, 'adverse', dets[0].t.algorithm).seat;
    expect(text).toContain(seat);
    expect(text).toMatch(/\d+\.\dh/); // oldest-open hours
    expect(text).toMatch(/\d+%/); // worst SLA %
    // Honesty block retained.
    expect(text).toMatch(/NOT CLAIMING/i);
    expect(text).toMatch(/segregation of duties/i);
  });

  it('shows an empty state when there are no open detections', () => {
    const s = createSim(20260914);
    const { container } = render(<QueueHealthPanel s={s} detections={[]} />);
    expect(container.textContent).toMatch(/no open detections/i);
  });
});
