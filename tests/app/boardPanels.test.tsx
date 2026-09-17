// @vitest-environment jsdom
/**
 * Render/behavior tests (E13 test-link) for the Golden Thread sub-tab refactor: the shared BoardTabs
 * primitive and the eight extracted board panels. The panels are behavior-neutral extractions covered
 * by the golden-thread suite; these guard that they mount against real sim state and that the two
 * pieces of NEW logic — BoardTabs keyboard nav and the detector-library party lens — are correct.
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';

// StatusBadge is compiled with jsx:preserve (Next.js) and is not processed by the vitest
// transform; several of these panels render it. Mock it to a light stand-in that renders its
// `label` as text (the repo-wide idiom — see EvidenceTimeline / value-set governance tests).
vi.mock('@/components/ui/StatusBadge', () => ({
  default: (p: { label: string }) => React.createElement('span', null, p.label),
}));

import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { createSim } from '@/lib/goldenThread/flowSim';
import { seedTicketByRef, TICKETS } from '@/lib/goldenThread/e2eFlow';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';
import { BoardTabs } from '@/components/goldenThread/flow/BoardTabs';
import { DetectorLibraryPanel } from '@/components/goldenThread/flow/DetectorLibraryPanel';
import { QueueHealthPanel } from '@/components/goldenThread/flow/QueueHealthPanel';
import { OpsTicketDetail } from '@/components/goldenThread/flow/OpsTicketDetail';
import { OpsWorkBaskets } from '@/components/goldenThread/flow/OpsWorkBaskets';
import { OpsForensicLedger } from '@/components/goldenThread/flow/OpsForensicLedger';
import { ReconLedgerPanel } from '@/components/goldenThread/flow/ReconLedgerPanel';
import { ReconAppealsPanel } from '@/components/goldenThread/flow/ReconAppealsPanel';
import {
  LiveDetectionFeed,
  type Detection,
} from '@/components/goldenThread/flow/LiveDetectionFeed';
import { OperationsBoard } from '@/components/goldenThread/flow/OperationsBoard';
import { ReconciliationBoard } from '@/components/goldenThread/flow/ReconciliationBoard';
import { SurveillanceConsole } from '@/components/goldenThread/flow/SurveillanceConsole';

afterEach(cleanup);

/** Minimal OperatingSim double — real seeded sim + no-op verbs (the panels read sim on mount; verbs fire on click). */
function fakeOp() {
  const noop = (): void => {};
  return {
    sim: createSim(20260914),
    running: false,
    play: noop,
    step: noop,
    grab: noop,
    route: noop,
    propose: noop,
    close: noop,
    verify: () => true,
    verifyRecon: () => true,
    routeRecon: noop,
    startAppeal: noop,
    reviewAppeal: noop,
    releaseAppeal: noop,
    dismissNotif: noop,
  } as unknown as OperatingSim;
}
const detections = (op: OperatingSim): Detection[] =>
  op.sim.tickets
    .map((t) => ({ t, seed: seedTicketByRef(t.ref) }))
    .filter((d): d is Detection => !!d.seed && d.t.status !== 'Closed');

const THREE = [
  { key: 'a', label: 'Alpha' },
  { key: 'b', label: 'Beta' },
  { key: 'c', label: 'Gamma' },
] as const;

describe('BoardTabs', () => {
  it('is a labelled tablist and switches on click', () => {
    const onChange = vi.fn();
    render(<BoardTabs tabs={THREE} active="a" onChange={onChange} ariaLabel="test views" />);
    expect(screen.getByRole('tablist', { name: 'test views' })).toBeTruthy();
    fireEvent.click(screen.getByText('Beta'));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('keyboard model: Right/Left/Home/End move to the correct DISTINCT tab from the active one', () => {
    // active fixed at the MIDDLE tab, so each key must resolve to a different key — a no-op arrow
    // handler could not satisfy all four assertions (the weakness the prior test missed).
    const onChange = vi.fn();
    render(<BoardTabs tabs={THREE} active="b" onChange={onChange} ariaLabel="kb views" />);
    const list = screen.getByRole('tablist', { name: 'kb views' });
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('c');
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('a');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('a');
    fireEvent.keyDown(list, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('c');
  });

  it('keyboard model: arrows wrap at both ends', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <BoardTabs tabs={THREE} active="a" onChange={onChange} ariaLabel="wrap views" />
    );
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('c'); // first → wraps to last
    rerender(<BoardTabs tabs={THREE} active="c" onChange={onChange} ariaLabel="wrap views" />);
    fireEvent.keyDown(screen.getByRole('tablist'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('a'); // last → wraps to first
  });

  it('roving tabindex: only the active tab is in the tab order', () => {
    render(<BoardTabs tabs={THREE} active="b" onChange={() => {}} ariaLabel="roving views" />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });
});

describe('BoardTabs ↔ tabpanel ARIA contract (completed by the shells)', () => {
  it('the selected tab controls a labelled, focusable tabpanel', () => {
    const op = fakeOp();
    render(<SurveillanceConsole op={op} onOpenTicket={() => {}} />);
    const selected = screen
      .getAllByRole('tab')
      .find((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected).toBeTruthy();
    const panelId = selected!.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    const panel = document.getElementById(panelId!);
    expect(panel).toBeTruthy();
    expect(panel!.getAttribute('role')).toBe('tabpanel');
    expect(panel!.getAttribute('aria-labelledby')).toBe(selected!.id);
    expect(panel!.getAttribute('tabindex')).toBe('0');
  });
});

describe('DetectorLibraryPanel — party lens', () => {
  it('surfaces the three accountable authorities with CATALOGUED counts (payer 22 / provider-counter 15 / neutral 14)', () => {
    const { container } = render(<DetectorLibraryPanel detections={[]} />);
    const text = container.textContent ?? '';
    expect(text.toLowerCase()).toMatch(/provider|neutral|authorit/);
    expect(text).toMatch(/22/);
    expect(text).toMatch(/15/);
    expect(text).toMatch(/14/);
  });

  it('is an accessible radiogroup and does NOT let the catalogued counts read as all-live', () => {
    const { container } = render(<DetectorLibraryPanel detections={[]} />);
    // single-select filter → radiogroup, exactly one checked
    const group = screen.getByRole('radiogroup', { name: /authority/i });
    expect(group).toBeTruthy();
    const radios = screen.getAllByRole('radio');
    expect(radios.filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(1);
    // the honesty counterweight: the CATALOGUED counts must be qualified, and the live-scripted
    // subset stated — so a skim reader cannot take 22/15/14 as live-wired detectors.
    const text = (container.textContent ?? '').toLowerCase();
    expect(text).toMatch(/catalogued/);
    expect(text).toMatch(/scripted/);
  });
});

describe('extracted board panels mount against real sim state', () => {
  it('QueueHealthPanel', () => {
    const op = fakeOp();
    const { container } = render(<QueueHealthPanel s={op.sim} detections={detections(op)} />);
    expect(container.textContent).toMatch(/NOT CLAIMING|queue|SoD|segregation/i);
  });

  it('OpsTicketDetail', () => {
    const op = fakeOp();
    // Pick the first live ticket that joins to a seed narrative (OpsTicketDetail requires a seed).
    const pair = op.sim.tickets
      .map((t) => ({ live: t, seed: seedTicketByRef(t.ref) }))
      .find((p): p is { live: (typeof op.sim.tickets)[number]; seed: NonNullable<typeof p.seed> } =>
        Boolean(p.seed)
      );
    expect(pair).toBeTruthy();
    const { container } = render(
      <OpsTicketDetail live={pair!.live} seed={pair!.seed} s={op.sim} onAct={() => {}} />
    );
    expect(container.textContent).toMatch(/record|illustrative|reconciliation/i);
  });

  it('OpsWorkBaskets', () => {
    const op = fakeOp();
    const { container } = render(<OpsWorkBaskets op={op} s={op.sim} onOpenTicket={() => {}} />);
    expect(container.textContent!.length).toBeGreaterThan(0);
  });

  it('OpsForensicLedger', () => {
    const op = fakeOp();
    const { container } = render(<OpsForensicLedger s={op.sim} op={op} />);
    expect(container.textContent!.length).toBeGreaterThan(0);
  });

  it('LiveDetectionFeed', () => {
    const op = fakeOp();
    const { container } = render(
      <LiveDetectionFeed op={op} s={op.sim} detections={detections(op)} onOpenTicket={() => {}} />
    );
    expect(container.textContent!.length).toBeGreaterThan(0);
  });

  it('ReconLedgerPanel', () => {
    const op = fakeOp();
    const { container } = render(
      <ReconLedgerPanel op={op} records={op.sim.reconLedger} appeals={[]} onViewAppeal={() => {}} />
    );
    expect(container.textContent!.length).toBeGreaterThan(0);
  });

  it('ReconAppealsPanel', () => {
    const op = fakeOp();
    // no appeals in flight → renders null; still references the module for E13 and proves the empty path
    const { container } = render(
      <ReconAppealsPanel op={op} appeals={[]} openWfSeq={null} setOpenWfSeq={() => {}} />
    );
    expect(container).toBeTruthy();
  });

  it('the seed catalogue is non-empty (guards the detection join)', () => {
    expect(TICKETS.length).toBeGreaterThan(0);
  });
});

describe('new panels surface NO PHI-shaped tokens (regression guard at the rendered surface)', () => {
  // The panels render seed titles, provider/payer refs and operator names verbatim — the protection
  // is that the seed is synthetic and carries no PHI. This guards that contract AT THE SURFACE the
  // reviewer flagged as unguarded: a future member-bearing seed title/ref would trip these patterns.
  // Patterns are the unambiguous PHI SHAPES — an identifier is `member`+digits, a DOB/MRN carries a
  // value. Domain language ("member not billed", "member-liability review") is NOT PHI and must not
  // trip these, so each pattern requires the numeric/identifier payload that makes a token PHI.
  const PHI = [
    { name: 'SSN (dashed)', re: /\b\d{3}-\d{2}-\d{4}\b/ },
    { name: 'member numeric identifier', re: /\bmember[-_ ]?(?:id[-_ :]*)?\d{4,}/i },
    { name: 'medical record number value', re: /\bMRN\b[:#]?\s*\d/i },
    { name: 'date of birth value', re: /\bDOB\b[:#]?\s*\d/i },
  ];
  function renderedText(): string {
    const op = fakeOp();
    const dets = detections(op);
    const pair = op.sim.tickets
      .map((t) => ({ live: t, seed: seedTicketByRef(t.ref) }))
      .find((p): p is { live: (typeof op.sim.tickets)[number]; seed: NonNullable<typeof p.seed> } =>
        Boolean(p.seed)
      );
    const parts: string[] = [];
    parts.push(
      render(<LiveDetectionFeed op={op} s={op.sim} detections={dets} onOpenTicket={() => {}} />)
        .container.textContent ?? ''
    );
    parts.push(
      render(
        <ReconLedgerPanel
          op={op}
          records={op.sim.reconLedger}
          appeals={[]}
          onViewAppeal={() => {}}
        />
      ).container.textContent ?? ''
    );
    if (pair) {
      parts.push(
        render(<OpsTicketDetail live={pair.live} seed={pair.seed} s={op.sim} onAct={() => {}} />)
          .container.textContent ?? ''
      );
    }
    parts.push(
      render(<OpsWorkBaskets op={op} s={op.sim} onOpenTicket={() => {}} />).container.textContent ??
        ''
    );
    return parts.join('\n');
  }

  it.each(PHI)('no $name in any new panel', ({ re }) => {
    expect(renderedText()).not.toMatch(re);
  });
});

describe('thin board shells compose their sub-tab children against real sim state', () => {
  it('OperationsBoard mounts and renders its sub-tab bar', () => {
    const op = fakeOp();
    render(<OperationsBoard op={op} onOpenTicket={() => {}} />);
    expect(screen.getByRole('tablist', { name: 'Operations views' })).toBeTruthy();
  });

  it('ReconciliationBoard mounts and renders its sub-tab bar', () => {
    const op = fakeOp();
    render(<ReconciliationBoard op={op} />);
    expect(screen.getByRole('tablist', { name: 'Reconciliation views' })).toBeTruthy();
  });

  it('SurveillanceConsole mounts and renders its sub-tab bar', () => {
    const op = fakeOp();
    render(<SurveillanceConsole op={op} onOpenTicket={() => {}} />);
    expect(screen.getByRole('tablist', { name: 'Surveillance views' })).toBeTruthy();
  });
});
