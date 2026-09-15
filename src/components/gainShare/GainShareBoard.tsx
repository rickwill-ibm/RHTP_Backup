'use client';
/**
 * GainShareBoard — the Gain-Share tab of the Golden-Thread flow. Two money stories, kept deliberately
 * SEPARATE (the coalition's frame): a REAL payment-integrity ROI (computed live over the recon
 * sub-ledger, epoch-pinned), and a MODELLED VBC shared-savings scenario modeler (LAN ladder, held-constant
 * actuarial inputs, real Medicaid gating, 438.6(c) governance). The illustrative glide-path narrative sits
 * below, clearly banner-labelled, so the modelled wedge is never mistaken for the real recovery money.
 *
 * CLIENT-SAFE: fed by the shared operating sim.
 */
import { useEffect, useState } from 'react';
import { RecoveryRoiPanel } from '@/components/gainShare/RecoveryRoiPanel';
import { GainShareModeler } from '@/components/gainShare/GainShareModeler';
import { GlidePathBoard } from '@/components/gainShare/GlidePathBoard';
import { FollowTheMoneyChart } from '@/components/gainShare/FollowTheMoneyChart';
import { computeRecoveryRoi } from '@/lib/gainShare/gainShareEconomics';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';

export function GainShareBoard({ op }: { op: OperatingSim }): React.ReactElement {
  const [showNarrative, setShowNarrative] = useState(false);
  // ONE pinned recovery epoch, owned here and shared by BOTH surfaces — they can never drift (coalition
  // must-fix). Re-pin on explicit action, and auto-re-pin when the scenario (book of business) changes.
  const [roi, setRoi] = useState(() => computeRecoveryRoi(op.sim));
  useEffect(() => {
    setRoi(computeRecoveryRoi(op.sim)); /* re-pin on scenario switch */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op.scenario]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-carbon-gray-20 bg-carbon-gray-10 p-3">
        <h2 className="text-base font-semibold text-carbon-gray-90">
          Two money stories — kept separate
        </h2>
        <p className="mt-1 text-[12px] text-carbon-gray-70">
          <span className="font-semibold">Payment integrity</span> (below, left) is{' '}
          <span className="font-semibold text-[#0e6027]">real</span> — recovery computed from the
          sealed recon sub-ledger, correctly signed, and MLR-aware.{' '}
          <span className="font-semibold">Value-based care</span> (below, right) is a{' '}
          <span className="font-semibold text-[#6929c4]">modelled</span> shared-savings scenario on
          a risk-adjusted benchmark. Recovery dollars are program-integrity, already in the MLR
          numerator — they are <span className="font-semibold">never</span> summed into the VBC
          split.
        </p>
      </div>

      {/* REAL — pinned epoch owned here, shared with the modeler */}
      <RecoveryRoiPanel
        roi={roi}
        liveSeq={op.sim.ledgerSeq}
        onRepin={() => setRoi(computeRecoveryRoi(op.sim))}
      />

      {/* MODELLED — reads the SAME pinned roi for its quarantined recovery line */}
      <GainShareModeler recovery={roi} />

      {/* Illustrative narrative — collapsed by default, banner-labelled */}
      <div className="rounded-lg border border-carbon-gray-20 bg-white">
        <button
          type="button"
          onClick={() => setShowNarrative((s) => !s)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-carbon-gray-10"
        >
          <span className="text-[12px] font-semibold text-carbon-gray-90">
            VBC glide-path narrative{' '}
            <span className="rounded bg-[#f6f2ff] px-1 text-[9px] font-semibold uppercase text-[#6929c4]">
              illustrative
            </span>
          </span>
          <span className="mono text-[11px] text-carbon-gray-40">
            {showNarrative ? '▾ hide' : '▸ show'}
          </span>
        </button>
        {showNarrative && (
          <div className="space-y-4 border-t border-carbon-gray-10 p-3">
            <p className="rounded border-l-4 border-carbon-yellow bg-carbon-yellow-light p-2 text-[10px] text-carbon-gray-80">
              Shape-and-magnitude story only — every dollar below is illustrative and the wedge is
              modelled. The <span className="font-semibold">real</span> money is the
              payment-integrity ROI panel above.
            </p>
            <GlidePathBoard />
            <FollowTheMoneyChart />
          </div>
        )}
      </div>
    </div>
  );
}
