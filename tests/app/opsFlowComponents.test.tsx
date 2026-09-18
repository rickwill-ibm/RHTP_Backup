// @vitest-environment jsdom
/**
 * Render smoke tests (E13 test-link) for the Operations/Reconciliation/Process-flow UI increments.
 * Each proves the component mounts against REAL sim/stage state and renders its load-bearing honest
 * framing — not a deep behavioral suite (slaBook / reconReport / stageGovernance carry the logic
 * invariants in their own unit tests), but a guard that these surfaces render and stay honest.
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { createSim, advance } from '@/lib/goldenThread/flowSim';
import { STAGES, seedTicketByRef } from '@/lib/goldenThread/e2eFlow';
import { OpsSlaScorecard } from '@/components/goldenThread/flow/OpsSlaScorecard';
import { TicketExposureEvidence } from '@/components/goldenThread/flow/TicketExposureEvidence';
import { ReconReportPanels } from '@/components/goldenThread/flow/ReconReportPanels';
import { PathAWhatIf } from '@/components/goldenThread/flow/PathAWhatIf';
import { ChannelMixChip } from '@/components/goldenThread/flow/ChannelMixChip';

afterEach(cleanup);

describe('OpsSlaScorecard', () => {
  it('renders the SLA attainment view and shows "—" for turnaround at cold start (no vacuous 100%)', () => {
    const s = createSim(20260914);
    render(<OpsSlaScorecard s={s} />);
    expect(screen.getByText(/governed worklist/i)).toBeTruthy();
    // cold start → attainment/turnaround are dashes, never a fabricated 100%
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});

describe('TicketExposureEvidence', () => {
  it('renders honest evidence framing for a live ticket (never a static constant labelled grounded)', () => {
    const s = createSim(20260914);
    const live = s.tickets[0];
    const seed = seedTicketByRef(live.ref);
    const { container } = render(<TicketExposureEvidence live={live} seed={seed} s={s} />);
    // both branches speak of a per-claim "record"; nothing claims a catalogue figure as grounded
    expect(container.textContent).toMatch(/record/i);
    expect(container.textContent).not.toMatch(/grounded in the record/i);
  });
});

describe('ReconReportPanels', () => {
  it('renders the reporting layer with the honest recovery-waterfall labels', () => {
    const s = createSim(20260914);
    for (let i = 0; i < 120; i += 1) advance(s);
    render(<ReconReportPanels records={s.reconLedger} appeals={[]} />);
    expect(screen.getByText(/Reconciliation reporting/i)).toBeTruthy();
    expect(screen.getByText(/Identified underpayment \(pre-appeal\)/i)).toBeTruthy();
  });
});

describe('PathAWhatIf', () => {
  it('mounts on a stage as a collapsible hypothetical explorer', () => {
    render(<PathAWhatIf stage={STAGES[0]} />);
    expect(screen.getByText(/What-if/i)).toBeTruthy();
    expect(screen.getByText(/hypothetical/i)).toBeTruthy();
  });
});

describe('ChannelMixChip', () => {
  it('renders the channel mix on an intake stage and nothing on a non-intake stage', () => {
    const intake = STAGES.find((st) => st.key === 'emr-launch')!;
    render(<ChannelMixChip stage={intake} />);
    expect(screen.getByText(/Intake channel mix/i)).toBeTruthy();

    cleanup();
    const nonIntake = STAGES.find((st) => st.key === 'crd')!;
    const { container } = render(<ChannelMixChip stage={nonIntake} />);
    expect(container.textContent).toBe(''); // returns null when the stage has no channel mix
  });
});
