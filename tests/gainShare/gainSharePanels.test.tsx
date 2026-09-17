// @vitest-environment jsdom
/**
 * Render tests (E13 test-link) for the four child panels the GainShareModeler was decomposed into:
 * LanRungPicker · LeversRail · SplitOutputPanel · RebasingScenarioPanel. These guard the coalition's
 * UX/a11y/honesty fixes at the rendered surface:
 *  • LeversRail inputs are PROGRAMMATICALLY LABELLED (getByLabelText) and sliders carry aria-valuetext;
 *  • the split bar shows the % on each segment, the benchmark→pool waterfall bridge renders, and the
 *    money tiles say "/ yr" (never "/ mo") — the 12× overstatement fix;
 *  • the two-sided downside band shows the provider owing (clamped) when actual > benchmark;
 *  • RebasingScenarioPanel renders the multi-year table and the A/B/C save controls.
 */
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('@/components/ui/StatusBadge', () => ({
  default: (p: { label: string }) => React.createElement('span', null, p.label),
}));

import { render, screen, cleanup } from '@testing-library/react';
import { createSim } from '@/lib/goldenThread/flowSim';
import {
  computeRecoveryRoi,
  computeVbcScenario,
  defaultModel,
  lanTier,
  type ContractModel,
  type RecoveryRoi,
} from '@/lib/gainShare/gainShareEconomics';
import { LanRungPicker } from '@/components/gainShare/LanRungPicker';
import { LeversRail } from '@/components/gainShare/LeversRail';
import { SplitOutputPanel } from '@/components/gainShare/SplitOutputPanel';
import { RebasingScenarioPanel } from '@/components/gainShare/RebasingScenarioPanel';
import { RecoveryRoiPanel } from '@/components/gainShare/RecoveryRoiPanel';

afterEach(cleanup);

const roi = (): RecoveryRoi => computeRecoveryRoi(createSim(20260914));
// Typed as the LeversRail onSet contract; the value is a plain no-op (a generic arrow VALUE would be
// ambiguous with JSX in a .tsx file, so the generics live in the type annotation only).
const noopSet: <K extends keyof ContractModel>(k: K, val: ContractModel[K]) => void = () => {};

describe('LanRungPicker', () => {
  it('renders the three HCP-LAN rungs and marks the active one pressed', () => {
    render(
      <LanRungPicker activeTierId="cat3a" tierNote={lanTier('cat3a').note} onPick={() => {}} />
    );
    expect(screen.getByText('LAN Cat 3A')).toBeTruthy();
    expect(screen.getByText('LAN Cat 3B')).toBeTruthy();
    expect(screen.getByText('LAN Cat 4')).toBeTruthy();
    const pressed = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
  });
});

describe('RecoveryRoiPanel — real recovery, identified vs realized co-equal (honesty fix)', () => {
  it('labels the recovery real and shows both identified and realized, without the "ROI" misnomer', () => {
    const r = roi();
    const { container } = render(
      <RecoveryRoiPanel roi={r} liveSeq={r.epoch.ledgerSeq} onRepin={() => {}} />
    );
    const text = (container.textContent ?? '').toLowerCase();
    expect(text).toContain('real');
    expect(text).toContain('identified');
    expect(text).toContain('realized');
    // the quarantine framing survives, and the old "ROI" misnomer is gone
    expect(text).toMatch(/quarantin|never|mlr/);
    expect(container.textContent ?? '').not.toMatch(/\bROI\b/);
  });
});

describe('LeversRail — a11y labels + aria-valuetext (coalition a11y fix)', () => {
  it('every control is programmatically labelled', () => {
    const model = defaultModel('cat3b');
    render(<LeversRail model={model} v={computeVbcScenario(model)} onSet={noopSet} />);
    // getByLabelText resolves the <label htmlFor> → input binding (was a bare <span> before the fix)
    expect(screen.getByLabelText(/Attributed member-months/)).toBeTruthy();
    expect(screen.getByLabelText(/Provider share/)).toBeTruthy();
    expect(screen.getByLabelText(/Performance vs benchmark/)).toBeTruthy();
    expect(screen.getByLabelText(/Upfront PMPM infra/)).toBeTruthy();
    expect(screen.getByLabelText(/Minimum savings rate/)).toBeTruthy();
    expect(screen.getByLabelText(/Rebasing-protection/)).toBeTruthy();
    expect(screen.getByLabelText(/Quality gate met/)).toBeTruthy();
  });

  it('sliders announce their value in domain units via aria-valuetext', () => {
    const model = defaultModel('cat3b');
    render(<LeversRail model={model} v={computeVbcScenario(model)} onSet={noopSet} />);
    const share = screen.getByLabelText(/Provider share/) as HTMLInputElement;
    expect(share.getAttribute('aria-valuetext')).toMatch(/percent provider share/);
    const perf = screen.getByLabelText(/Performance vs benchmark/) as HTMLInputElement;
    expect(perf.getAttribute('aria-valuetext')).toMatch(/PMPM/);
  });
});

describe('SplitOutputPanel — split %, waterfall bridge, annual tiles, downside band', () => {
  it('the split bar shows the % on each segment and the money tiles say "/ yr" (not "/ mo")', () => {
    const v = computeVbcScenario(defaultModel('cat3b'));
    const { container } = render(<SplitOutputPanel v={v} recovery={roi()} />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/Provider \d+%/); // % shown on the segment/caption
    expect(text).toMatch(/Payer \d+%/);
    expect(text).toMatch(/Shared pool \/ yr/);
    expect(text).toMatch(/Provider \/ yr/);
    expect(text).toMatch(/Payer \/ yr/);
    expect(text).not.toMatch(/\/ mo\b/); // the 12× overstatement is gone
    expect(text.toLowerCase()).toMatch(/member-months/); // held-constant denominator as a caption
  });

  it('renders the benchmark → pool waterfall bridge', () => {
    const v = computeVbcScenario(defaultModel('cat3b'));
    const { container } = render(<SplitOutputPanel v={v} recovery={roi()} />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/Benchmark → pool bridge/);
    expect(text).toMatch(/− Actual paid spend/);
    expect(text).toMatch(/MSR floor/);
    expect(text).toMatch(/Quality gate/);
  });

  it('shows the provider OWING (clamped) when a two-sided actual exceeds benchmark', () => {
    const v = computeVbcScenario({ ...defaultModel('cat4'), actualDeltaPmpm: 90 });
    const { container } = render(<SplitOutputPanel v={v} recovery={roi()} />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/Two-sided risk corridor/);
    expect(text).toMatch(/Provider OWES/);
    expect(text.toLowerCase()).toMatch(/stop-loss/);
  });

  it('Cat 3A shows the upside-only note (no downside)', () => {
    const v = computeVbcScenario(defaultModel('cat3a'));
    const { container } = render(<SplitOutputPanel v={v} recovery={roi()} />);
    expect((container.textContent ?? '').toLowerCase()).toMatch(/upside-only/);
  });

  it('surfaces the quarantined recovery cross-reference with the non-additivity marker', () => {
    const v = computeVbcScenario(defaultModel('cat3b'));
    const { container } = render(<SplitOutputPanel v={v} recovery={roi()} />);
    const text = container.textContent ?? '';
    expect(text).toMatch(/quarantined/i);
    expect(text).toMatch(/∑ not applicable/);
  });
});

describe('RebasingScenarioPanel', () => {
  it('renders the multi-year table and the A/B/C save controls', () => {
    const model = defaultModel('cat3b');
    const { container } = render(
      <RebasingScenarioPanel
        model={model}
        v={computeVbcScenario(model)}
        saved={{}}
        onSave={() => {}}
      />
    );
    const text = container.textContent ?? '';
    expect(text).toMatch(/Multi-year rebasing/);
    expect(screen.getByText('Save A')).toBeTruthy();
    expect(screen.getByText('Save B')).toBeTruthy();
    expect(screen.getByText('Save C')).toBeTruthy();
  });

  it('renders the per-year DOWNSIDE (Provider owes) when a two-sided scenario owes — not silently dropped', () => {
    const model = { ...defaultModel('cat4'), actualDeltaPmpm: 90 }; // over benchmark → owes, clamped
    const v = computeVbcScenario(model);
    const { container } = render(
      <RebasingScenarioPanel model={model} v={v} saved={{}} onSave={() => {}} />
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Provider owes'); // the column the review found missing
    expect(text).toMatch(/−\$\d/); // a negative per-year liability is actually shown
  });
});
