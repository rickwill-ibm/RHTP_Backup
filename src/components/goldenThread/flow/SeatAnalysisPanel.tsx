'use client';
/**
 * SeatAnalysisPanel — the workbench's analysis surface, GROUNDED ON THE LIVE OPERATING RECORD.
 *
 * Why this exists: the prior entry point ran a real Wave-8 endpoint over a persisted Evidence Record
 * that reads empty in dev (the in-memory store isn't shared between the RSC render and the API route),
 * so "Run analysis" returned "no denial to analyze" — a dead entry point. This runs the SAME class of
 * analysis (adjustment/denial root-cause over CARC groups) over the live recon sub-ledger, which is
 * always populated and deterministic — so the analyst always gets a real, actionable finding, and can
 * act on it in one click (drafting the governed appeal opens its workflow in the notebook).
 *
 * CLIENT-SAFE: shared sim + pure reconcile domain only.
 */
import { useState } from 'react';
import { reconInsights, type ReconClass } from '@/lib/goldenThread/reconcile';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';

type Side = 'payer' | 'provider' | 'neutral';
const usd = (n: number): string => `$${Math.round(Math.abs(n)).toLocaleString()}`;

// which recon classes each seat owns (mirrors the two-sided reconciliation seat model)
const PROVIDER_CLASSES: ReconClass[] = ['underpayment', 'bundling-downcode', 'timely-filing'];
const PAYER_CLASSES: ReconClass[] = ['overpayment', 'member-liability-review'];

export function SeatAnalysisPanel({
  op,
  side,
  onOpenTicket,
}: {
  op: OperatingSim;
  side: Side;
  onOpenTicket?: (seedId: string, side: Side, liveKey?: string) => void;
}): React.ReactElement {
  const s = op.sim;
  const [ran, setRan] = useState(true); // grounded finding is cheap + always available — show it by default
  const recs = s.reconLedger;
  const ins = reconInsights(recs.map((r) => r));

  // side-scoped view of the live book
  const owned = side === 'payer' ? PAYER_CLASSES : PROVIDER_CLASSES;
  const scoped = recs.filter((r) => owned.includes(r.reconClass));
  const carc = new Map<string, { carc: string; count: number; amt: number }>();
  for (const r of scoped) {
    if (r.carc === '—') continue;
    const d = carc.get(r.carc) ?? { carc: r.carc, count: 0, amt: 0 };
    d.count += 1;
    d.amt += Math.abs(r.deltaUsd);
    carc.set(r.carc, d);
  }
  const drivers = [...carc.values()].sort((a, b) => b.amt - a.amt).slice(0, 4);
  const exposure =
    side === 'provider' ? ins.totalRecoverableUsd - ins.totalRealizedUsd : ins.totalReturnableUsd;
  const exposureLabel =
    side === 'provider' ? 'recoverable (open underpayment)' : 'returnable (overpayment · 60-day)';
  // the largest actionable underpayment (provider) — draft-appeal target
  const topUnderpay =
    side === 'provider'
      ? [...recs]
          .filter(
            (r) =>
              r.reconClass === 'underpayment' &&
              !r.recoveredUsd &&
              !s.workflows.some((w) => w.reconSeq === r.seq)
          )
          .sort((a, b) => Math.abs(b.deltaUsd) - Math.abs(a.deltaUsd))[0]
      : undefined;

  const draftAppeal = (): void => {
    if (!topUnderpay) return;
    op.startAppeal(topUnderpay.seq);
    const t = op.sim.tickets.find((x) => x.reconRecordSeq === topUnderpay.seq);
    if (t && onOpenTicket) onOpenTicket(t.ref, side, t.key); // open the new workflow in the notebook
  };

  return (
    <div className="ed-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-base font-semibold">Analysis — adjustment / denial root-cause</p>
          <p className="text-[11px] text-carbon-gray-60">
            Grounded on the LIVE operating record — the recon sub-ledger for this seat
            (deterministic; always populated).
          </p>
        </div>
        <span className="rounded-full bg-[#daf5e5] px-2 py-0.5 text-[10px] font-semibold text-[#0e6027]">
          ● grounded · live
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setRan(true)}
          className="rounded bg-carbon-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-carbon-blue-hover"
        >
          Run analysis
        </button>
        <span className="mono text-[10px] text-carbon-gray-50">
          CARC groups · {side}-scoped · {scoped.length} records
        </span>
      </div>

      {ran && (
        <div className="mt-3 rounded border border-carbon-gray-20 p-3">
          {scoped.length === 0 ? (
            <p className="text-[12px] text-carbon-gray-60">
              No {side}-side adjustments in the current window — press Play on the flow/Operations
              to reconcile more 835s.
            </p>
          ) : (
            <>
              <p className="text-sm font-semibold text-carbon-gray-90">
                Finding — {scoped.length} {side}-side exceptions ·{' '}
                <span style={{ color: side === 'provider' ? '#5b3fa3' : '#b45309' }}>
                  {usd(exposure)}
                </span>{' '}
                {exposureLabel}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {drivers.map((d) => (
                  <div key={d.carc} className="rounded border border-carbon-gray-20 bg-white p-2">
                    <p className="mono text-[10px] font-bold text-carbon-gray-80">{d.carc}</p>
                    <p className="num text-base text-carbon-gray-90">{usd(d.amt)}</p>
                    <p className="text-[9px] text-carbon-gray-50">{d.count} claims</p>
                  </div>
                ))}
              </div>
              {ins.systematicPatterns.length > 0 && (
                <p className="mt-2 text-[11px] text-carbon-gray-70">
                  <strong>{ins.systematicPatterns.length} systematic pattern(s)</strong> detected
                  (same CARC concentrated on one provider) — see the Reconciliation board to route
                  them.
                </p>
              )}
              <div className="mt-2 rounded bg-carbon-gray-10 p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
                  Recommendation
                </p>
                <p className="text-[12px] text-carbon-gray-90">
                  {side === 'provider'
                    ? 'Draft governed appeals on the CO-45 over-adjustments (contract-cite enclosed); transmission is human-gated. Route the systematic cluster to payer Claims Config as a mis-loaded fee schedule.'
                    : 'Report-and-return the identified overpayments within the 60-day window (human-gated); review any Medicaid PR (member-liability) rows for improper balance-billing.'}
                </p>
              </div>
              {side === 'provider' && topUnderpay && (
                <button
                  type="button"
                  onClick={draftAppeal}
                  className="mt-3 rounded bg-carbon-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-carbon-blue-hover"
                >
                  Draft appeal on the largest underpayment ({usd(topUnderpay.deltaUsd)}) →
                </button>
              )}
              <p className="mt-2 text-[9px] italic text-carbon-gray-40">
                Grounded on the live recon sub-ledger (real classification + arithmetic); mock
                channel, not transmitted.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
