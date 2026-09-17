'use client';
/**
 * ReconLedgerPanel — the Ledger sub-tab of the ReconciliationBoard: the two-sided classification
 * legend, the systematic-pattern roll-ups (payer-side aggregate routing), and the per-claim CAS/CARC
 * (+RARC) delta table with its all/exceptions filter and per-record re-verify (seal reproduce).
 * Extracted verbatim from ReconciliationBoard — no logic/behavior change.
 * CLIENT-SAFE: shared sim + pure reconcile domain + presentational helpers only. No node/barrel.
 */
import { useMemo, useState } from 'react';
import { reconIntact, type ReconRecord, type LiveTicket } from '@/lib/goldenThread/flowSim';
import type { Workflow } from '@/lib/goldenThread/workflow';
import { LifecycleChip } from '@/components/goldenThread/flow/opsShared';
import {
  reconInsights,
  RECON_CLASS_SPEC,
  GROUP_MEANING,
  type AdjustmentGroup,
  type SystematicPattern,
} from '@/lib/goldenThread/reconcile';
import { ROLE_LABEL, type OpsRole } from '@/lib/goldenThread/e2eFlow';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';
import StatusBadge from '@/components/ui/StatusBadge';

type Variant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';
const SEV_VARIANT: Record<'info' | 'action' | 'warning' | 'critical', Variant> = {
  critical: 'danger',
  warning: 'warning',
  action: 'info',
  info: 'neutral',
};
const GROUP_COLOR: Record<AdjustmentGroup, string> = {
  CO: '#0e7490',
  PR: '#b45309',
  OA: '#57534e',
  PI: '#5b3fa3',
};
const SIDE_COLOR = { provider: '#5b3fa3', payer: '#24427e' } as const;

const usd = (n: number): string => `$${Math.round(Math.abs(n)).toLocaleString()}`;

export function ReconLedgerPanel({
  op,
  records,
  appeals,
  onViewAppeal,
}: {
  op: OperatingSim;
  records: ReconRecord[];
  appeals: Workflow[];
  onViewAppeal: (seq: number) => void;
}): React.ReactElement {
  const s = op.sim;
  const [filter, setFilter] = useState<'all' | 'exceptions'>('exceptions');
  const [reproduced, setReproduced] = useState<Record<number, boolean>>({});
  const insights = useMemo(() => reconInsights(records.map((r) => r)), [records]);
  const intact = reconIntact(s);

  const rows = useMemo(() => {
    const list = [...records].reverse();
    return filter === 'exceptions'
      ? list.filter((r) => r.reconClass !== 'clean' && r.reconClass !== 'contractual-writeoff')
      : list;
  }, [records, filter]);

  return (
    <div className="space-y-4">
      {/* Two-sided legend + class mix */}
      <div className="ed-card flex flex-wrap items-center gap-x-4 gap-y-1 p-2 text-[10px]">
        <span className="font-semibold uppercase tracking-wide text-carbon-gray-50">
          Recon seats
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ background: SIDE_COLOR.provider }}
          />
          Provider-side · underpayment → appeal, bundling → coding
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ background: SIDE_COLOR.payer }}
          />
          Payer-side · overpayment → 60-day return, config → reprocess
        </span>
        <span className="ml-auto italic text-carbon-gray-40">
          Neither seat acts inside the other institution — a cross-wire finding is SENT as a
          governed submission.
        </span>
      </div>

      {/* Systematic patterns — aggregate, payer-side */}
      {insights.systematicPatterns.length > 0 && (
        <div className="ed-card p-3">
          <p className="text-[11px] font-semibold text-carbon-gray-90">
            Systematic patterns — same CARC concentrated on one provider (aggregate,
            minimum-necessary: codes/refs only)
          </p>
          <div className="mt-2 space-y-2">
            {insights.systematicPatterns.map((p) => (
              <PatternRow
                key={`${p.provider}-${p.routeRole}-${p.carc}`}
                p={p}
                op={op}
                ticket={s.tickets.find(
                  (t) =>
                    t.ref ===
                    `RPAT-${p.routeRole}-${p.carc}-${p.provider.slice(0, 10)}`.replace(
                      /[^A-Za-z0-9-]/g,
                      ''
                    )
                )}
                nowTick={s.tick}
              />
            ))}
          </div>
          <p className="mt-1 text-[9px] italic text-carbon-gray-40">
            A uniform underpayment cluster reads as a mis-loaded fee schedule →{' '}
            <strong>payer Claims Config</strong> (reprocess). Any other repeated concentration →{' '}
            <strong>payer Program-Integrity</strong>. Advisory (A1) — the config change / case-open
            is a human determination.
          </p>
        </div>
      )}

      {/* CAS/CARC delta table */}
      <div className="ed-card p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-carbon-gray-20 px-3 py-2">
          <p className="text-[11px] font-semibold text-carbon-gray-90">
            Reconciliation ledger — 835 vs loaded contract, per claim
          </p>
          <span
            className="mono text-[10px] font-semibold"
            style={{ color: intact ? '#24a148' : '#da1e28' }}
          >
            {intact ? '● sub-ledger intact' : '● seal BROKEN'} · head{' '}
            {s.reconHead.toString(16).slice(-6)}
          </span>
          <div className="ml-auto flex gap-1">
            {(['exceptions', 'all'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize transition ${filter === f ? 'border-carbon-blue bg-carbon-blue text-white' : 'border-carbon-gray-30 bg-white text-carbon-gray-70 hover:bg-carbon-gray-10'}`}
              >
                {f === 'exceptions' ? 'Exceptions only' : 'All claims'}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[30rem] overflow-auto">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-carbon-gray-10">
              <tr className="text-[9px] uppercase tracking-wide text-carbon-gray-50">
                <th className="px-2 py-1.5 font-semibold">Claim</th>
                <th className="px-2 py-1.5 font-semibold">Provider · Payer</th>
                <th className="px-2 py-1.5 font-semibold">Group · CARC / RARC</th>
                <th className="px-2 py-1.5 text-right font-semibold">Contracted</th>
                <th className="px-2 py-1.5 text-right font-semibold">Paid</th>
                <th className="px-2 py-1.5 text-right font-semibold">Δ · var%</th>
                <th className="px-2 py-1.5 font-semibold">Classification</th>
                <th className="px-2 py-1.5 font-semibold">Handoff</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-4 text-center text-[11px] italic text-carbon-gray-40"
                  >
                    No exceptions in the current window — reconciliation confirmed payment. Switch
                    to “All claims”.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <ReconRow
                  key={r.seq}
                  r={r}
                  op={op}
                  rep={reproduced[r.seq]}
                  onVerify={() => setReproduced((m) => ({ ...m, [r.seq]: op.verifyRecon(r.seq) }))}
                  routed={r.routed || s.tickets.some((t) => t.reconRecordSeq === r.seq)}
                  ticket={
                    // Only look up the governed handoff ticket for NON-appeal rows: a denied appeal
                    // mints a separate arbiter ticket that shares reconRecordSeq (ambiguous match).
                    r.reconClass === 'underpayment'
                      ? undefined
                      : s.tickets.find((t) => t.reconRecordSeq === r.seq)
                  }
                  nowTick={s.tick}
                  wfState={appeals.find((w) => w.reconSeq === r.seq)?.state}
                  onOpenWf={() => onViewAppeal(r.seq)}
                  onStartAppeal={() => {
                    op.startAppeal(r.seq);
                    onViewAppeal(r.seq);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-3 py-2 text-[9px] italic text-carbon-gray-40">
          Each row is a sealed sub-ledger record (own hash chain, re-derivable = tamper-evident,
          ANDed into the earned-authority integrity gate) linked to the main ledger by{' '}
          <strong>sealSeq</strong>. CO = provider write-off (member not billed) · PR = member owes ·
          OA/PI = neither billed — {GROUP_MEANING.CO}. Behavioral-health member-liability rows are
          minimum-necessary (codes/refs only); any 42 CFR Part 2 (SUD) member detail is segmented
          and not surfaced here.
        </p>
      </div>
    </div>
  );
}

function PatternRow({
  p,
  op,
  ticket,
  nowTick,
}: {
  p: SystematicPattern;
  op: OperatingSim;
  ticket: LiveTicket | undefined;
  nowTick: number;
}): React.ReactElement {
  const role = p.routeRole as OpsRole;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-carbon-gray-20 bg-white p-2">
      <span
        className="mono rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
        style={{ background: p.kind === 'fee-schedule-config' ? '#b45309' : '#da1e28' }}
      >
        {p.kind === 'fee-schedule-config' ? 'FEE-SCHEDULE' : 'FWA SIGNAL'}
      </span>
      <span className="text-[11px] text-carbon-gray-90">
        <strong>{p.carc}</strong> · {p.count} claims · {p.provider}
      </span>
      <span className="mono text-[10px] text-carbon-gray-60">{usd(p.amountUsd)}</span>
      <span className="text-[10px] text-carbon-gray-60">→ {ROLE_LABEL[role]}</span>
      <div className="ml-auto">
        {ticket ? (
          // Routed → shows the REAL lifecycle + SLA, not a static "✓ routed" caption.
          <LifecycleChip t={ticket} nowTick={nowTick} />
        ) : (
          <button
            type="button"
            onClick={() => op.routePattern(p.kind, p.provider, p.carc, p.count, p.amountUsd)}
            className="rounded bg-carbon-blue px-2 py-1 text-[10px] font-semibold text-white hover:bg-carbon-blue-hover"
          >
            Route to {p.kind === 'fee-schedule-config' ? 'Claims Config' : 'Program-Integrity'} →
          </button>
        )}
      </div>
    </div>
  );
}

function ReconRow({
  r,
  op,
  rep,
  onVerify,
  routed,
  ticket,
  nowTick,
  wfState,
  onOpenWf,
  onStartAppeal,
}: {
  r: ReconRecord;
  op: OperatingSim;
  rep: boolean | undefined;
  onVerify: () => void;
  routed: boolean;
  ticket: LiveTicket | undefined;
  nowTick: number;
  wfState?: string;
  onOpenWf: () => void;
  onStartAppeal: () => void;
}): React.ReactElement {
  const spec = RECON_CLASS_SPEC[r.reconClass];
  const short = r.claimRef.split(' · ').slice(0, 2).join(' · ');
  const canRoute =
    !!r.handoffRole && r.reconClass !== 'clean' && r.reconClass !== 'contractual-writeoff';
  const isAppeal = r.reconClass === 'underpayment';
  return (
    <tr className="border-b border-carbon-gray-20 align-top">
      <td className="px-2 py-1.5">
        <span className="mono text-[10px] text-carbon-gray-80">{short}</span>
        <span className="mt-0.5 block text-[9px]" style={{ color: SIDE_COLOR[r.side] }}>
          {r.side === 'provider' ? 'provider-side' : 'payer-side'} · seq {r.seq}
        </span>
      </td>
      <td className="px-2 py-1.5 text-[10px] text-carbon-gray-70">
        {r.provider}
        <span className="block text-carbon-gray-40">{r.payer}</span>
      </td>
      <td className="px-2 py-1.5">
        <span
          className="mono rounded px-1 py-0.5 text-[9px] font-bold text-white"
          style={{ background: GROUP_COLOR[r.group] }}
        >
          {r.group}
        </span>
        <span className="mono ml-1 text-[10px] text-carbon-gray-80">{r.carc}</span>
        {r.rarc !== '—' && (
          <span className="mono ml-1 text-[9px] text-carbon-gray-40">{r.rarc}</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right">
        <span className="num text-[11px] text-carbon-gray-70">{usd(r.contractedUsd)}</span>
      </td>
      <td className="px-2 py-1.5 text-right">
        <span className="num text-[11px] text-carbon-gray-90">{usd(r.paidUsd)}</span>
      </td>
      <td className="px-2 py-1.5 text-right">
        <span
          className="num text-[11px] font-semibold"
          style={{ color: r.deltaUsd < 0 ? '#da1e28' : r.deltaUsd > 0 ? '#b45309' : '#57534e' }}
        >
          {r.deltaUsd < 0 ? '−' : r.deltaUsd > 0 ? '+' : ''}
          {usd(r.deltaUsd)}
        </span>
        <span className="block text-[9px] text-carbon-gray-40">{r.variancePct}%</span>
      </td>
      <td className="px-2 py-1.5">
        <StatusBadge label={spec.label} variant={SEV_VARIANT[r.severity]} size="md" />
        <span className="mt-0.5 block text-[9px] text-carbon-gray-50">
          {r.memberLiability === 'member-responsibility' ? 'member owes (PR)' : 'member not billed'}
        </span>
        {r.clockTicks > 0 && (
          <span
            className="mt-0.5 inline-block rounded-sm px-1 text-[8px] font-semibold"
            style={{ background: '#fbeae9', color: '#b42318' }}
          >
            {r.reconClass === 'overpayment' ? '⏱ 60-day report-and-return' : '⏱ appeal deadline'}
          </span>
        )}
      </td>
      <td className="px-2 py-1.5">
        {isAppeal ? (
          wfState ? (
            <button
              type="button"
              onClick={onOpenWf}
              className="rounded border border-carbon-blue px-2 py-1 text-[10px] font-semibold text-carbon-blue hover:bg-carbon-blue-lighter"
            >
              View appeal · {wfState} →
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartAppeal}
              className="rounded bg-carbon-blue px-2 py-1 text-[10px] font-semibold text-white hover:bg-carbon-blue-hover"
            >
              Draft appeal →
            </button>
          )
        ) : canRoute ? (
          ticket ? (
            // A governed ticket exists → show its real lifecycle + SLA, not a static "✓ routed".
            <div className="flex flex-col items-start gap-0.5">
              <LifecycleChip t={ticket} nowTick={nowTick} />
              <span className="text-[9px] text-carbon-gray-40">→ {r.handoffRole}</span>
            </div>
          ) : routed ? (
            <span className="mono text-[10px] font-bold text-[#24a148]">
              ✓ routed → {r.handoffRole}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => op.routeRecon(r.seq)}
              className="rounded bg-carbon-blue px-2 py-1 text-[10px] font-semibold text-white hover:bg-carbon-blue-hover"
            >
              {r.reconClass === 'overpayment' ? 'Report-and-return →' : `Route → ${r.handoffRole}`}
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={onVerify}
            className="rounded border border-carbon-gray-30 px-1.5 py-0.5 text-[9px] text-carbon-gray-60 hover:bg-carbon-gray-10"
          >
            {rep === undefined ? '↻ Re-verify seal' : rep ? '✓ seal holds' : '✗ mismatch'}
          </button>
        )}
        {canRoute && (
          <span className="mt-0.5 block text-[9px] italic text-carbon-gray-40">
            {spec.humanGated ? 'human-gated' : 'earned-gated'}
          </span>
        )}
      </td>
    </tr>
  );
}
