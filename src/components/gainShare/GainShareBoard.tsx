'use client';
/**
 * GainShareBoard — the Gain-Share tab of the Golden-Thread flow, refactored to the shell + sub-tab
 * pattern (BoardTabs level="sub", the same idiom as ReconciliationBoard). The three provenance tiers are
 * the sub-tabs. The quarantine is airtight at the MATH level — `computeVbcScenario` takes no recovery
 * input, so a payment-integrity dollar can never enter the split. At the SCREEN level the modeler tab
 * still shows a recovery cross-reference, kept non-summable by an explicit "∑ not applicable" marker and
 * a distinct color axis (not by hiding it). The three provenance tiers:
 *   • "Payment integrity · real"     → RecoveryRoiPanel (REAL recovery, epoch-pinned)
 *   • "VBC modeler · modelled"        → GainShareModeler (MODELLED shared-savings wedge)
 *   • "Glide-path · illustrative"     → GlidePathBoard + FollowTheMoneyChart (ILLUSTRATIVE narrative)
 *
 * PERSISTENT above the tabs: the "two money stories — kept separate" banner, the pre-certification chip
 * (438.4 / 438.7 / 438.6(c)), a provenance KEY (real · modelled · illustrative · held-constant swatches),
 * and the pinned-epoch strip (`as of seq N` + re-pin) — so BOTH surfaces visibly share ONE epoch.
 *
 * CLIENT-SAFE: fed by the shared operating sim. No `@/lib/evidence` barrel, no node:crypto.
 */
import { useEffect, useState } from 'react';
import { RecoveryRoiPanel } from '@/components/gainShare/RecoveryRoiPanel';
import { GainShareModeler } from '@/components/gainShare/GainShareModeler';
import { GlidePathBoard } from '@/components/gainShare/GlidePathBoard';
import { FollowTheMoneyChart } from '@/components/gainShare/FollowTheMoneyChart';
import { computeRecoveryRoi } from '@/lib/gainShare/gainShareEconomics';
import { BoardTabs, tabPanelProps, type BoardTab } from '@/components/goldenThread/flow/BoardTabs';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';

type View = 'real' | 'modelled' | 'illustrative';
const ARIA = 'Gain-share views';

const KEY: ReadonlyArray<{ swatch: string; label: string }> = [
  { swatch: 'bg-[#24a148]', label: 'real (live · MLR-bearing $)' },
  { swatch: 'bg-[#8a3ffc]', label: 'modelled (illustrative PMPM)' },
  { swatch: 'bg-carbon-yellow', label: 'illustrative (shape & magnitude)' },
  { swatch: 'border border-carbon-gray-30 bg-carbon-gray-10', label: 'held-constant assumption' },
];

export function GainShareBoard({ op }: { op: OperatingSim }): React.ReactElement {
  const [view, setView] = useState<View>('real');
  // ONE pinned recovery epoch, owned here and shared by BOTH surfaces — they can never drift (coalition
  // must-fix). Re-pin on explicit action, and auto-re-pin when the scenario (book of business) changes.
  const [roi, setRoi] = useState(() => computeRecoveryRoi(op.sim));
  useEffect(() => {
    setRoi(computeRecoveryRoi(op.sim)); /* re-pin on scenario switch */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op.scenario]);
  const liveSeq = op.sim.ledgerSeq;
  const stale = liveSeq !== roi.epoch.ledgerSeq;
  const repin = (): void => setRoi(computeRecoveryRoi(op.sim));

  const tabs: ReadonlyArray<BoardTab<View>> = [
    { key: 'real', label: 'Payment integrity · real' },
    { key: 'modelled', label: 'VBC modeler · modelled' },
    { key: 'illustrative', label: 'Glide-path · illustrative' },
  ];

  return (
    <div className="space-y-4">
      {/* PERSISTENT — banner + pre-cert chip */}
      <div className="rounded-lg border border-carbon-gray-20 bg-carbon-gray-10 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-base font-semibold text-carbon-gray-90">
            Two money stories — kept separate
          </h2>
          <span
            className="rounded border border-[#d4bbff] bg-[#f6f2ff] px-2 py-0.5 text-[10px] font-semibold text-[#6929c4]"
            title="Splits are pre-certification scenario modelling"
          >
            ⚖ Pre-certification — 438.4 / 438.7 + CMS 438.6(c)
          </span>
        </div>
        <p className="mt-1 text-[12px] text-carbon-gray-70">
          <span className="font-semibold">Payment integrity</span> is{' '}
          <span className="font-semibold text-[#0e6027]">real</span> — recovery computed from the
          sealed recon sub-ledger, correctly signed, and MLR-aware.{' '}
          <span className="font-semibold">Value-based care</span> is a{' '}
          <span className="font-semibold text-[#6929c4]">modelled</span> shared-savings scenario on
          a risk-adjusted benchmark. Recovery dollars are program-integrity, already in the MLR
          numerator — they are <span className="font-semibold">never</span> summed into the VBC
          split.{' '}
          <span className="mono font-semibold">∑ not applicable — different accounting basis.</span>
        </p>
        {/* PERSISTENT — provenance KEY (WCAG: swatch + text, never color alone) */}
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {KEY.map((k) => (
            <span
              key={k.label}
              className="inline-flex items-center gap-1.5 text-[10px] text-carbon-gray-70"
            >
              <span className={`inline-block h-2.5 w-2.5 rounded-sm ${k.swatch}`} />
              {k.label}
            </span>
          ))}
        </div>
      </div>

      {/* PERSISTENT — pinned-epoch strip: both surfaces share ONE epoch */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-carbon-gray-20 bg-white px-3 py-2">
        <span className="text-[11px] text-carbon-gray-70">
          One pinned epoch shared by every view —{' '}
          <span
            className="mono font-semibold"
            title="The pinned ledger boundary these figures were computed at"
          >
            as of seq {roi.epoch.ledgerSeq} · tick {roi.epoch.tick}
          </span>
        </span>
        <button
          type="button"
          onClick={repin}
          disabled={!stale}
          className={`rounded px-2 py-1 text-[11px] font-semibold ${stale ? 'bg-carbon-blue text-white hover:bg-carbon-blue-hover' : 'cursor-default border border-carbon-gray-20 text-carbon-gray-40'}`}
          title={
            stale
              ? `The live sim has advanced to seq ${liveSeq} — re-pin to refresh`
              : 'Pinned to the current epoch'
          }
        >
          {stale ? `Re-pin → seq ${liveSeq}` : 'Pinned'}
        </button>
      </div>

      <BoardTabs level="sub" ariaLabel={ARIA} tabs={tabs} active={view} onChange={setView} />

      <div {...tabPanelProps(ARIA, view)}>
        {view === 'real' && <RecoveryRoiPanel roi={roi} liveSeq={liveSeq} onRepin={repin} />}
        {view === 'modelled' && <GainShareModeler recovery={roi} />}
        {view === 'illustrative' && (
          <div className="space-y-4">
            <p className="rounded border-l-4 border-carbon-yellow bg-carbon-yellow-light p-2 text-[10px] text-carbon-gray-80">
              Shape-and-magnitude story only — every dollar below is illustrative and the wedge is
              modelled. The <span className="font-semibold">real</span> money is the
              payment-integrity recovery view.
            </p>
            <GlidePathBoard />
            <FollowTheMoneyChart />
          </div>
        )}
      </div>
    </div>
  );
}
