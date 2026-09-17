'use client';
/**
 * OperationsBoard — the operating layer over the ONE shared sim (client).
 *
 * A thin shell: it keeps the shared-run transport + honesty caption and the <NotificationStrip>
 * persistent, then splits the board into sub-tabs via the shared <BoardTabs> primitive —
 *   • Health       — counters + SLA scorecard + exec legend
 *   • Work baskets — persona queues + selected-ticket RCA/verdict/workflow (child)
 *   • Forensic     — the live hash-chained evidence ledger (child)
 * All the mechanism lives in the children; this file only composes. No flowSim/engine change.
 *
 * CLIENT-SAFE: shared sim + spine + presentational helpers only. No `@/lib/evidence` barrel.
 */
import { useState } from 'react';
import type { OpsTicket, ForensicEntry } from '@/lib/goldenThread/e2eFlow';
import { slaAtRisk, type SimState } from '@/lib/goldenThread/flowSim';
import { ExecLegendMini } from '@/components/goldenThread/flow/opsShared';
import { NotificationStrip } from '@/components/goldenThread/flow/NotificationStrip';
import { OpsSlaScorecard } from '@/components/goldenThread/flow/OpsSlaScorecard';
import { BoardTabs, tabPanelProps, type BoardTab } from '@/components/goldenThread/flow/BoardTabs';
import { OpsWorkBaskets } from '@/components/goldenThread/flow/OpsWorkBaskets';
import { OpsForensicLedger } from '@/components/goldenThread/flow/OpsForensicLedger';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';
import { slaBook } from '@/lib/goldenThread/slaBook';

type Side = 'payer' | 'provider' | 'neutral';
type SubView = 'health' | 'baskets' | 'forensic';

export interface OperationsBoardProps {
  op: OperatingSim;
  tickets?: OpsTicket[];
  forensic?: ForensicEntry[];
  onOpenParty?: (side: Side) => void;
  onOpenTicket?: (seedTicketId: string, side: Side, liveKey?: string) => void;
}

export function OperationsBoard({ op, onOpenTicket }: OperationsBoardProps): React.ReactElement {
  const s = op.sim;
  const [subView, setSubView] = useState<SubView>('health');
  const openCount = s.tickets.filter((t) => t.status !== 'Closed').length;
  const tabs: ReadonlyArray<BoardTab<SubView>> = [
    { key: 'health', label: 'Health' },
    { key: 'baskets', label: 'Work baskets', badge: openCount },
    { key: 'forensic', label: 'Forensic ledger' },
  ];

  return (
    <div className="space-y-4">
      {/* Transport + honesty — the SAME shared run drives the flow and these queues (persistent shell) */}
      <div className="ed-card flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={op.play}
            className="rounded bg-carbon-blue px-3 py-1 text-xs font-semibold text-white hover:bg-carbon-blue-hover"
          >
            {op.running ? '❚❚ Pause run' : '▶ Play surveillance run'}
          </button>
          <button
            type="button"
            onClick={op.step}
            className="rounded border border-carbon-gray-30 px-2 py-1 text-xs text-carbon-gray-70 hover:bg-carbon-gray-10"
          >
            ⏭ Step
          </button>
          <span className="mono text-[11px] text-carbon-gray-60">
            {openCount} open · tick {s.tick}
          </span>
        </div>
        <span className="rounded border border-carbon-yellow bg-carbon-yellow-light px-2 py-0.5 text-[10px] text-[#b45309]">
          Same run as the flow tab · findings, verdicts &amp; role-routing are real; cadence is
          illustrative
        </span>
      </div>

      <NotificationStrip op={op} />

      <BoardTabs tabs={tabs} active={subView} onChange={setSubView} ariaLabel="Operations views" />

      <div {...tabPanelProps('Operations views', subView)}>
        {subView === 'health' && (
          <div className="space-y-4">
            <OpsCounters s={s} />
            <OpsSlaScorecard s={s} />
            <ExecLegendMini />
          </div>
        )}

        {subView === 'baskets' && <OpsWorkBaskets op={op} s={s} onOpenTicket={onOpenTicket} />}

        {subView === 'forensic' && <OpsForensicLedger s={s} op={op} />}
      </div>
    </div>
  );
}

function OpsCounters({ s }: { s: SimState }): React.ReactElement {
  const open = s.tickets.filter((t) => t.status !== 'Closed');
  const critical = open.filter((t) => t.severity === 'critical').length;
  const closed = s.tickets.filter((t) => t.status === 'Closed').length;
  // Money lives on ONE board (Reconciliation, derived from real recon deltas). Operations shows
  // operational counts only — no parallel "queue exposure" summed from cloned catalogue constants.
  const oldestHrs = Math.max(0, ...slaBook(s).seats.map((x) => x.oldestOpenHrs), 0);
  const tiles: Array<{ label: string; value: string; color: string }> = [
    { label: 'Open tickets', value: String(open.length), color: '#24427e' },
    { label: 'Critical', value: String(critical), color: '#da1e28' },
    { label: 'SLA at risk', value: String(slaAtRisk(s)), color: '#b45309' },
    { label: 'Closed', value: String(closed), color: '#24a148' },
    { label: 'Oldest open', value: `${oldestHrs}h`, color: '#161616' },
    { label: 'Sealed records', value: String(s.ledgerSeq), color: '#5b3fa3' },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {tiles.map((t) => (
        <div key={t.label} className="ed-card p-2">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-carbon-gray-50">
            {t.label}
          </p>
          <p className="num text-xl" style={{ color: t.color }}>
            {t.value}
          </p>
        </div>
      ))}
    </div>
  );
}
