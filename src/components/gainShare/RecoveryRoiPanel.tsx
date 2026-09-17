'use client';
/**
 * RecoveryRoiPanel — the REAL half of gain-share: payment-integrity ROI computed from the live recon
 * sub-ledger, epoch-PINNED so figures never jump mid-demo. Three correctly-signed flows (the coalition's
 * fix): underpayment correction (pays the provider MORE — a quality/integrity result, not savings),
 * overpayment return (reduces incurred claims → the MLR numerator), and realized-of-recoverable. None of
 * these ever enters the VBC shared-savings split.
 *
 * CLIENT-SAFE: pure economics + shared sim only.
 */
import { fmtUsd, type RecoveryRoi } from '@/lib/gainShare/gainShareEconomics';

/**
 * The pinned `roi` and the re-pin control are owned by the PARENT (GainShareBoard), so this panel and the
 * modeler read the SAME epoch and can never drift apart on one screen (coalition must-fix).
 */
export function RecoveryRoiPanel({
  roi,
  liveSeq,
  onRepin,
}: {
  roi: RecoveryRoi;
  liveSeq: number;
  onRepin: () => void;
}): React.ReactElement {
  const stale = liveSeq !== roi.epoch.ledgerSeq;

  return (
    <section className="space-y-3 rounded-lg border border-carbon-gray-20 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Payment-integrity recovery · real</h2>
          <p className="text-[11px] text-carbon-gray-60">
            Computed live over the reconciliation sub-ledger (hash-chained; PHI-safe synthetic
            seed). Absolute dollars — not PMPM, not shared savings. Identified (recoverable) and
            realized are shown co-equal — identified is not money in hand.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="mono rounded bg-carbon-gray-10 px-2 py-0.5 text-[10px] text-carbon-gray-60"
            title="The pinned ledger boundary these figures were computed at"
          >
            as of seq {roi.epoch.ledgerSeq} · tick {roi.epoch.tick}
          </span>
          <button
            type="button"
            onClick={onRepin}
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
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {/* Underpayment correction — IDENTIFIED vs REALIZED shown co-equal (identified is not money in hand) */}
        <div className="rounded-lg border border-[#a7f0ba] bg-[#f2fbf5] p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-60">
              Underpayment correction
            </p>
            <span
              className="rounded bg-white px-1 text-[8px] font-semibold uppercase text-[#0e6027]"
              title="Direction of money"
            >
              → pays provider
            </span>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <div className="rounded bg-white p-1.5">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-carbon-gray-50">
                Identified (recoverable)
              </p>
              <p className="num text-xl text-[#0e6027]">{fmtUsd(roi.recoverableUsd)}</p>
              <p className="text-[9px] text-carbon-gray-50">
                {roi.underpaymentCount} claims short-paid · not money in hand
              </p>
            </div>
            <div className="rounded bg-white p-1.5">
              <p className="text-[9px] font-semibold uppercase tracking-wide text-carbon-gray-50">
                Realized (accepted-appeal 835)
              </p>
              <p className="num text-xl text-[#0e6027]">{fmtUsd(roi.realizedUsd)}</p>
              <p className="text-[9px] text-carbon-gray-50">
                {Math.round(roi.realizedPct * 100)}% of identified
              </p>
            </div>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded bg-carbon-gray-10">
            <div
              className="h-full rounded bg-[#24a148]"
              style={{ width: `${Math.round(roi.realizedPct * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] text-carbon-gray-60">
            Realizing it pays the provider more — a correctness/quality result,{' '}
            <span className="font-semibold">not shared savings</span>.
          </p>
        </div>

        {/* Overpayment return — reduces incurred claims → MLR numerator */}
        <div className="rounded-lg border border-[#a6c8ff] bg-[#f2f7ff] p-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-60">
              Overpayment returnable
            </p>
            <span
              className="rounded bg-white px-1 text-[8px] font-semibold uppercase text-[#0043ce]"
              title="Direction of money — on return"
            >
              ↓ MLR numerator
            </span>
          </div>
          <p className="num mt-1 text-2xl text-[#0043ce]">{fmtUsd(roi.returnableUsd)}</p>
          <p className="mt-0.5 text-[10px] text-carbon-gray-60">
            {roi.overpaymentCount} claims over-paid (
            <span className="font-semibold">identified</span>). Report-and-return reduces incurred
            claims <span className="font-semibold">when returned</span> (42 CFR 438.8) — the only
            recovery-of-spend, still not a distributable pool.
          </p>
        </div>

        {/* Governance / provenance */}
        <div className="rounded-lg border border-carbon-gray-20 bg-carbon-gray-10 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-60">
            Governed &amp; sealed
          </p>
          <ul className="mt-1 space-y-1 text-[10px] text-carbon-gray-70">
            <li>
              · {roi.disputeCount} governed handoffs across {roi.reconRows} recon rows
            </li>
            <li>
              · each recovery sealed on the hash-chained sub-ledger (tamper-evident, replayable)
            </li>
            <li>· submission stays human-gated; mock channel — nothing transmitted</li>
          </ul>
        </div>
      </div>

      <p className="rounded border-l-4 border-carbon-yellow bg-carbon-yellow-light p-2 text-[10px] text-carbon-gray-80">
        {roi.mlrNote}
      </p>
    </section>
  );
}
