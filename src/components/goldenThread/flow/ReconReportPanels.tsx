'use client';
/**
 * ReconReportPanels — the reporting layer above the per-claim delta table: roll-ups (provider / CARC /
 * fee-schedule grouping), a recovery waterfall (identified → in-dispute → realized, plus 60-day
 * returnable), and the systematic-pattern → affected-claims drill with a minimum-necessary export.
 * All projections are pure reads of the sealed sub-ledger. HONESTY: fee-schedule key is a derived
 * illustrative grouping (not a config id); expected realization is projected only over PURSUED $.
 *
 * CLIENT-SAFE: pure reconcile/report domain + browser Blob for download. No node, no barrel.
 */
import { useMemo, useState } from 'react';
import type { ReconRecord } from '@/lib/goldenThread/flowSim';
import type { Workflow } from '@/lib/goldenThread/workflow';
import { reconInsights, type SystematicPattern } from '@/lib/goldenThread/reconcile';
import {
  rollupByProvider,
  rollupByCarc,
  rollupByFeeSchedule,
  recoveryWaterfall,
  claimsForPattern,
  feeScheduleVersionOf,
  APPEAL_ACCEPT_RATE,
  type RollUp,
} from '@/lib/goldenThread/reconReport';
import { buildReconCsv, buildReconJson } from '@/lib/goldenThread/reconExport';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';
import { PatternActions } from '@/components/goldenThread/flow/PatternActions';

const usd = (n: number): string => `$${Math.round(Math.abs(n)).toLocaleString()}`;

function download(name: string, mime: string, body: string): void {
  try {
    const url = URL.createObjectURL(new Blob([body], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    /* download is a browser-only convenience; ignore in non-DOM contexts */
  }
}

function RollUpCard({ title, rows }: { title: string; rows: RollUp[] }): React.ReactElement {
  return (
    <div className="ed-card p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
        {title}
      </p>
      <div className="mt-1 space-y-0.5">
        {rows.length === 0 && (
          <p className="text-[10px] italic text-carbon-gray-40">no exceptions</p>
        )}
        {rows.slice(0, 5).map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-2 text-[10px]">
            <span className="truncate text-carbon-gray-80">{r.label}</span>
            <span className="mono whitespace-nowrap text-carbon-gray-60">
              {r.count} · {usd(r.amountUsd)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReconReportPanels({
  op,
  records,
  appeals,
}: {
  op?: OperatingSim;
  records: ReconRecord[];
  appeals: Workflow[];
}): React.ReactElement {
  const [drill, setDrill] = useState<SystematicPattern | null>(null);
  const insights = useMemo(() => reconInsights(records.map((r) => r)), [records]);
  const pursued = useMemo(
    () => new Set(appeals.map((w) => w.reconSeq).filter((n): n is number => n !== undefined)),
    [appeals]
  );
  const water = useMemo(() => recoveryWaterfall(records, pursued), [records, pursued]);
  const drilled = drill ? claimsForPattern(records, drill.provider, drill.carc) : [];

  return (
    <div className="ed-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold text-carbon-gray-90">
          Reconciliation reporting · full population, exceptions surfaced, systemic patterns
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => download('reconciliation.csv', 'text/csv', buildReconCsv(records))}
            className="rounded border border-carbon-gray-30 px-2 py-0.5 text-[9px] font-semibold text-carbon-gray-70 hover:bg-carbon-gray-10"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={() =>
              download('reconciliation.json', 'application/json', buildReconJson(records))
            }
            className="rounded border border-carbon-gray-30 px-2 py-0.5 text-[9px] font-semibold text-carbon-gray-70 hover:bg-carbon-gray-10"
          >
            Export JSON
          </button>
        </div>
      </div>

      {/* Recovery waterfall */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          {
            label: 'Identified underpayment (pre-appeal)',
            value: usd(water.identifiedUsd),
            color: '#5b3fa3',
          },
          { label: 'In dispute (appeal filed)', value: usd(water.inDisputeUsd), color: '#24427e' },
          {
            label: 'Expected realization if pursued',
            value: usd(water.expectedRealizationIfPursuedUsd),
            color: '#0f766e',
          },
          { label: 'Realized (835 posted)', value: usd(water.realizedUsd), color: '#24a148' },
          {
            label: 'Returnable (overpaid · 60-day)',
            value: usd(water.returnableUsd),
            color: '#b45309',
          },
        ].map((t) => (
          <div key={t.label} className="rounded border border-carbon-gray-20 bg-white p-2">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-carbon-gray-50">
              {t.label}
            </p>
            <p className="mono text-sm font-bold" style={{ color: t.color }}>
              {t.value}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[9px] italic text-carbon-gray-40">
        Expected realization = in-dispute × {Math.round(APPEAL_ACCEPT_RATE * 100)}% — the modelled
        per-case appeal accept rate applied to pursued dollars as an indicative estimate (a per-case
        rate is not a per-dollar weight, so it will not reconcile penny-for-penny with realized). A
        projection, not booked recovery.
      </p>

      {/* Roll-ups */}
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <RollUpCard title="By provider" rows={rollupByProvider(records)} />
        <RollUpCard title="By CARC" rows={rollupByCarc(records)} />
        <RollUpCard
          title="By fee-schedule grouping (derived, illustrative)"
          rows={rollupByFeeSchedule(records)}
        />
      </div>

      {/* Systematic patterns → drill */}
      <div className="mt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
          Systematic patterns — one config defect, many claims (click to drill)
        </p>
        {insights.systematicPatterns.length === 0 && (
          <p className="mt-1 text-[10px] italic text-carbon-gray-40">
            no systematic concentration yet — press Play to reconcile more claims
          </p>
        )}
        <div className="mt-1 flex flex-wrap gap-1">
          {insights.systematicPatterns.map((p) => {
            const active = drill?.provider === p.provider && drill?.carc === p.carc;
            return (
              <button
                key={`${p.provider}|${p.carc}`}
                type="button"
                onClick={() => setDrill(active ? null : p)}
                className={`rounded border px-2 py-0.5 text-[9px] font-semibold ${active ? 'border-carbon-blue bg-carbon-blue text-white' : 'border-carbon-gray-30 text-carbon-gray-70 hover:bg-carbon-gray-10'}`}
                title={`${p.kind} → ${p.routeRole} · fee-schedule ${feeScheduleVersionOf(p.provider, p.carc)}`}
              >
                {p.provider.replace(' (illustrative)', '')} · {p.carc} · {p.count} claims ·{' '}
                {usd(p.amountUsd)}
              </button>
            );
          })}
        </div>
        {drill && (
          <div className="mt-2 overflow-x-auto rounded border border-carbon-blue-lighter bg-carbon-blue-lightest p-2">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[10px] font-semibold text-carbon-gray-80">
                {drilled.length} claims under {drill.provider} · {drill.carc} — the exemplar appeal
                covers the pattern, not one claim
              </p>
              <button
                type="button"
                onClick={() => download('pattern-claims.csv', 'text/csv', buildReconCsv(drilled))}
                className="rounded border border-carbon-gray-30 px-2 py-0.5 text-[9px] font-semibold text-carbon-gray-70 hover:bg-carbon-gray-10"
              >
                Export these
              </button>
            </div>
            {op && <PatternActions op={op} p={drill} records={records} />}
            <table className="w-full text-left text-[9px]">
              <tbody>
                {drilled.map((r) => (
                  <tr key={r.seq} className="border-b border-carbon-gray-10">
                    <td className="mono py-0.5 pr-2 text-carbon-gray-70">{r.claimRef}</td>
                    <td className="mono px-2 text-carbon-gray-60">
                      contracted {usd(r.contractedUsd)}
                    </td>
                    <td className="mono px-2 text-carbon-gray-60">paid {usd(r.paidUsd)}</td>
                    <td className="mono px-2 font-semibold text-[#da1e28]">Δ {usd(r.deltaUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
