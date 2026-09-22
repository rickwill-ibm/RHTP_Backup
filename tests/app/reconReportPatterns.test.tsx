// @vitest-environment jsdom
/**
 * E13 test-link for GAP 3 — the systematic-pattern governed actions. With a stub `op` (spies on
 * routePattern / startAppeal) it asserts the drill's action buttons call the right verbs, that the
 * exemplar-appeal button routes to a record seq, and that a pattern whose RPAT ticket already exists
 * reads "✓ routed" instead of the button (idempotency reflected). Exercises PatternActions directly.
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { createSim, type SimState, type LiveTicket } from '@/lib/goldenThread/flowSim';
import { reconInsights, type SystematicPattern } from '@/lib/goldenThread/reconcile';
import { claimsForPattern } from '@/lib/goldenThread/reconReport';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';
import { ReconReportPanels } from '@/components/goldenThread/flow/ReconReportPanels';
import { patternRef } from '@/components/goldenThread/flow/PatternActions';

afterEach(cleanup);

function stubOp(sim: SimState) {
  const noop = (): void => {};
  return {
    sim,
    running: false,
    play: noop,
    step: noop,
    routePattern: vi.fn(),
    startAppeal: vi.fn(),
  } as unknown as OperatingSim;
}

/** Open the drill for a pattern by clicking its chip (matched by its CARC label). */
function openDrill(carc: string): void {
  const chip = screen
    .getAllByRole('button')
    .find((b) => (b.textContent ?? '').includes(carc) && (b.textContent ?? '').includes('claims'));
  expect(chip).toBeTruthy();
  fireEvent.click(chip!);
}

describe('ReconReportPanels — systematic-pattern governed actions', () => {
  it('a fee-schedule pattern routes to Claims-Config; its exemplar reflects the warm-seeded appeal', () => {
    const sim = createSim(20260914);
    const patterns = reconInsights(sim.reconLedger).systematicPatterns;
    const fee = patterns.find((p) => p.kind === 'fee-schedule-config');
    expect(fee).toBeTruthy();
    const op = stubOp(sim);
    render(<ReconReportPanels op={op} records={sim.reconLedger} appeals={[]} />);

    openDrill(fee!.carc);
    fireEvent.click(screen.getByText('Route to Claims-Config → reprocess'));
    expect(op.routePattern).toHaveBeenCalledWith(
      'fee-schedule-config',
      fee!.provider,
      fee!.carc,
      fee!.count,
      fee!.amountUsd
    );
    // The warm-start seeds one in-flight appeal on the largest cluster underpayment — the fee-schedule
    // pattern's exemplar — so the drill honestly shows the drafted state, not a duplicate "draft" button.
    expect(screen.getByText(/exemplar appeal drafted/)).toBeTruthy();
  });

  it('an fwa pattern offers "Open Program-Integrity case"', () => {
    const sim = createSim(20260914);
    const fwa = reconInsights(sim.reconLedger).systematicPatterns.find(
      (p) => p.kind === 'fwa-signal'
    );
    expect(fwa).toBeTruthy();
    const op = stubOp(sim);
    render(<ReconReportPanels op={op} records={sim.reconLedger} appeals={[]} />);
    openDrill(fwa!.carc);
    fireEvent.click(screen.getByText('Open Program-Integrity case'));
    expect(op.routePattern).toHaveBeenCalledWith(
      'fwa-signal',
      fwa!.provider,
      fwa!.carc,
      fwa!.count,
      fwa!.amountUsd
    );
  });

  it('offers "Draft exemplar appeal" for a pattern whose exemplar is not already appealed', () => {
    const sim = createSim(20260914);
    // Clear the warm-seeded appeal so the fee-schedule pattern's exemplar is un-appealed and the
    // draft action is offered (isolates the GAP-3 verb from the GAP-2 seed).
    sim.workflows = sim.workflows.filter((w) => w.kind !== 'underpayment-appeal');
    const p = reconInsights(sim.reconLedger).systematicPatterns.find((pat: SystematicPattern) => {
      const ex = claimsForPattern(sim.reconLedger, pat.provider, pat.carc).filter(
        (r) => r.reconClass === 'underpayment'
      )[0];
      return ex !== undefined;
    });
    expect(p).toBeTruthy();
    const op = stubOp(sim);
    render(<ReconReportPanels op={op} records={sim.reconLedger} appeals={[]} />);
    openDrill(p!.carc);
    fireEvent.click(screen.getByText('Draft exemplar appeal'));
    expect(op.startAppeal).toHaveBeenCalledTimes(1);
    expect(op.startAppeal).toHaveBeenCalledWith(expect.any(Number));
  });

  it('reflects the routed state (idempotent) when a matching RPAT ticket already exists', () => {
    const sim = createSim(20260914);
    const fee = reconInsights(sim.reconLedger).systematicPatterns.find(
      (p) => p.kind === 'fee-schedule-config'
    )!;
    // Pre-seed the ticket the engine would mint for this pattern.
    sim.tickets.unshift({
      key: 'LT-TEST',
      ref: patternRef(fee),
      algorithm: 'FEE-SCHEDULE-CONFIG',
      title: 'seeded',
      role: 'payer-config',
      operator: 'test',
      severity: 'warning',
      exposureUsd: fee.amountUsd,
      slaHours: 48,
      bornTick: sim.tick,
      status: 'New',
      sealSeq: sim.ledgerSeq,
    } as LiveTicket);
    const op = stubOp(sim);
    render(<ReconReportPanels op={op} records={sim.reconLedger} appeals={[]} />);
    openDrill(fee.carc);
    // The route button is replaced by the routed confirmation.
    expect(screen.getByText(/routed · sealed →/)).toBeTruthy();
    expect(screen.queryByText('Route to Claims-Config → reprocess')).toBeNull();
    expect(op.routePattern).not.toHaveBeenCalled();
  });
});
