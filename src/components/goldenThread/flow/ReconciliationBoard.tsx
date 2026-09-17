'use client';
/**
 * ReconciliationBoard — the recon agent's own workbench over the ONE shared sim (client).
 *
 * It owns what Operations does NOT: the per-claim CAS/CARC(+RARC) delta table, the two-sided
 * classification (provider-side underpayment/bundling vs payer-side overpayment/config), and the
 * portfolio insights (recoverable, 60-day returnable, systematic patterns). Routing a finding mints
 * ONE governed Operations ticket (single queue — the same s.tickets Operations reads), sealed on the
 * SAME governed-action path (earned-gate + submission human-gate), back-linked to the recon record.
 *
 * The recon sub-ledger is its own append-only hash chain (re-derivable = tamper-evident, ANDed into
 * the earned-authority integrity gate) AND linked to the main NIST ledger by sealSeq — one thread,
 * two levels of detail. HONESTY: modelled distribution (not live 835 parsing), claim-level (a real
 * 835 carries CAS per service line), mock channel; aggregation is minimum-necessary, codes/refs only.
 *
 * This shell keeps the run controls, portfolio insights and notifications always visible above three
 * sub-tabs — Overview (reporting), Ledger (per-claim delta table) and Appeals (governed workflow) —
 * each of which is its own child panel. openWfSeq is lifted here so the Ledger's "View appeal" lands
 * the appeal visibly on the Appeals sub-tab.
 *
 * CLIENT-SAFE: shared sim + pure reconcile domain + presentational helpers only. No node/barrel.
 */
import { useMemo, useState } from 'react';
import { reconIntact } from '@/lib/goldenThread/flowSim';
import { ReconReportPanels } from '@/components/goldenThread/flow/ReconReportPanels';
import { reconInsights } from '@/lib/goldenThread/reconcile';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';
import { NotificationStrip } from '@/components/goldenThread/flow/NotificationStrip';
import { BoardTabs, tabPanelProps, type BoardTab } from '@/components/goldenThread/flow/BoardTabs';
import { ReconLedgerPanel } from '@/components/goldenThread/flow/ReconLedgerPanel';
import { ReconAppealsPanel } from '@/components/goldenThread/flow/ReconAppealsPanel';

const usd = (n: number): string => `$${Math.round(Math.abs(n)).toLocaleString()}`;

export function ReconciliationBoard({ op }: { op: OperatingSim }): React.ReactElement {
  const s = op.sim;
  const [subView, setSubView] = useState<'overview' | 'ledger' | 'appeals'>('overview');
  const [openWfSeq, setOpenWfSeq] = useState<number | null>(null);
  const appeals = s.workflows.filter((w) => w.kind === 'underpayment-appeal');
  const records = s.reconLedger;
  const insights = useMemo(() => reconInsights(records.map((r) => r)), [records]);
  const intact = reconIntact(s);
  const exceptionsCount = records.filter(
    (r) => r.reconClass !== 'clean' && r.reconClass !== 'contractual-writeoff'
  ).length;

  const tabs: ReadonlyArray<BoardTab<'overview' | 'ledger' | 'appeals'>> = [
    { key: 'overview', label: 'Overview' },
    { key: 'ledger', label: 'Ledger', badge: exceptionsCount },
    { key: 'appeals', label: 'Appeals', badge: appeals.length },
  ];

  return (
    <div className="space-y-4">
      {/* Transport + honesty */}
      <div className="ed-card flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={op.play}
            className="rounded bg-carbon-blue px-3 py-1 text-xs font-semibold text-white hover:bg-carbon-blue-hover"
          >
            {op.running ? '❚❚ Pause run' : '▶ Play — reconcile 835s'}
          </button>
          <button
            type="button"
            onClick={op.step}
            className="rounded border border-carbon-gray-30 px-2 py-1 text-xs text-carbon-gray-70 hover:bg-carbon-gray-10"
          >
            ⏭ Step
          </button>
          <span className="mono text-[11px] text-carbon-gray-60">
            {records.length} claims reconciled · tick {s.tick}
          </span>
        </div>
        <span className="rounded border border-carbon-yellow bg-carbon-yellow-light px-2 py-0.5 text-[10px] text-[#b45309]">
          Same run as the flow · classification &amp; routing real · modelled distribution (not live
          835 parsing) · claim-level · mock channel
        </span>
      </div>

      {/* Portfolio insights */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Claims reconciled', value: String(insights.total), color: '#161616' },
          {
            // Honest framing: this is identified underpayment BEFORE any appeal — not expected
            // collections. The recovery lifecycle (in-dispute → expected-if-pursued → realized) is
            // in the reporting panel below, where the modelled accept rate is applied to pursued $ only.
            label: 'Identified underpayment (pre-appeal)',
            value:
              insights.totalRealizedUsd > 0
                ? `${usd(insights.totalRecoverableUsd)} · ${usd(insights.totalRealizedUsd)} realized`
                : usd(insights.totalRecoverableUsd),
            color: '#5b3fa3',
          },
          {
            label: 'Returnable (overpaid · 60-day)',
            value: usd(insights.totalReturnableUsd),
            color: '#b45309',
          },
          { label: 'Exceptions routed', value: String(insights.disputeCount), color: '#24427e' },
          {
            label: 'Systematic patterns',
            value: String(insights.systematicPatterns.length),
            color: '#da1e28',
          },
          {
            label: 'Sub-ledger sealed',
            value: String(s.reconSeq),
            color: intact ? '#24a148' : '#da1e28',
          },
        ].map((t) => (
          <div key={t.label} className="ed-card p-2">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-carbon-gray-50">
              {t.label}
            </p>
            <p className="num text-lg" style={{ color: t.color }}>
              {t.value}
            </p>
          </div>
        ))}
      </div>

      <NotificationStrip op={op} />

      <BoardTabs
        level="sub"
        ariaLabel="Reconciliation views"
        tabs={tabs}
        active={subView}
        onChange={setSubView}
      />

      <div {...tabPanelProps('Reconciliation views', subView)}>
        {subView === 'overview' && <ReconReportPanels records={records} appeals={appeals} />}

        {subView === 'ledger' && (
          <ReconLedgerPanel
            op={op}
            records={records}
            appeals={appeals}
            onViewAppeal={(seq) => {
              setOpenWfSeq(seq);
              setSubView('appeals');
            }}
          />
        )}

        {subView === 'appeals' && (
          <ReconAppealsPanel
            op={op}
            appeals={appeals}
            openWfSeq={openWfSeq}
            setOpenWfSeq={setOpenWfSeq}
          />
        )}
      </div>
    </div>
  );
}
