'use client';
/**
 * SplitOutputPanel — the modeler's output surface, extracted from GainShareModeler. It carries:
 *  • the shared-savings split bar (each segment labelled with its % AND $, text-on-every-segment, no
 *    width distortion — a tiny segment's label drops to the caption row rather than forcing a min width);
 *  • the benchmark → pool WATERFALL bridge (benchmark → −actual → gross → −MSR haircut → ×quality gate);
 *  • the two-sided DOWNSIDE corridor band (provider-owes ↔ provider-earns, stop-loss cap shown);
 *  • the ANNUAL money tiles ("/ yr", PMPM × annual member-months) with member-months as a caption;
 *  • the quarantined REAL recovery cross-reference with an explicit non-additivity marker.
 *
 * Hues are DISTINCT from RecoveryRoiPanel's green/blue (which mean underpayment/overpayment — a different
 * axis): provider = purple (modelled), payer = amber. Both are text-labelled so they never cross-associate.
 *
 * CLIENT-SAFE: pure economics + presentational helpers only. No `@/lib/evidence` barrel, no node:crypto.
 */
import {
  fmtUsd,
  fmtUsdCompact,
  type RecoveryRoi,
  type VbcScenario,
} from '@/lib/gainShare/gainShareEconomics';

// Provider = purple (matches the "modelled" provenance); payer = amber. Deliberately NOT green/blue.
const PROVIDER = { bg: 'bg-[#e8daff]', text: 'text-[#6929c4]', hex: '#6929c4' };
const PAYER = { bg: 'bg-[#fddc69]', text: 'text-[#684e00]', hex: '#684e00' };

export function SplitOutputPanel({
  v,
  recovery,
}: {
  v: VbcScenario;
  recovery: RecoveryRoi;
}): React.ReactElement {
  const providerFrac = v.sharedPoolPmpm > 0 ? v.providerPmpm / v.sharedPoolPmpm : 0;
  const providerPct = Math.round(providerFrac * 100);
  const payerPct = 100 - providerPct;
  const memberMonths = v.model.memberMonths.toLocaleString();

  return (
    <div className="space-y-3">
      {/* Split bar */}
      <div className="rounded-lg border border-carbon-gray-20 p-3">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <p className="text-[11px] font-semibold text-carbon-gray-90">
            Shared-savings split · PMPM{' '}
            <span className="text-[9px] font-normal text-carbon-gray-40">(illustrative)</span>
          </p>
          <span className="mono text-[10px] text-carbon-gray-50">
            benchmark ${v.benchmarkPmpm} · actual ${v.actualPmpm} · gross ${v.rawGrossPmpm}
          </span>
        </div>

        {v.qualifies ? (
          <>
            <div className="mt-2 flex h-7 w-full overflow-hidden rounded border border-carbon-gray-20 bg-carbon-gray-10">
              <div
                className={`flex items-center justify-center ${PROVIDER.bg} ${PROVIDER.text} text-[10px] font-semibold`}
                style={{ width: `${providerFrac * 100}%` }}
              >
                {providerPct >= 14 ? `Provider ${providerPct}% · $${v.providerPmpm}` : ''}
              </div>
              <div
                className={`flex items-center justify-center ${PAYER.bg} ${PAYER.text} text-[10px] font-semibold`}
                style={{ width: `${(1 - providerFrac) * 100}%` }}
              >
                {payerPct >= 14 ? `Payer ${payerPct}% · $${v.payerPmpm}` : ''}
              </div>
            </div>
            {/* Caption row — text on every segment regardless of bar width (no color-only cue). */}
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px]">
              <span className={`font-semibold ${PROVIDER.text}`}>
                ◆ Provider {providerPct}% · ${v.providerPmpm} PMPM
              </span>
              <span className={`font-semibold ${PAYER.text}`}>
                ▲ Payer {payerPct}% · ${v.payerPmpm} PMPM
              </span>
            </div>
          </>
        ) : (
          <div className="mt-2 space-y-1">
            <p className="rounded border-l-4 border-[#da1e28] bg-carbon-red-light p-2 text-[11px] font-semibold text-carbon-red">
              Pool = $0 · {v.gateReason}
            </p>
            {v.infraPmpm > 0 && (
              <p className="rounded border-l-4 border-carbon-yellow bg-carbon-yellow-light p-2 text-[10px] text-carbon-gray-80">
                Even at a $0 pool the payer still funds the upfront infra:{' '}
                <span className="mono font-semibold">${v.infraPmpm} PMPM</span> ={' '}
                <span className="mono font-semibold">{fmtUsdCompact(v.infraTotalUsd)}/yr</span> for
                zero shared-savings return this period.
              </p>
            )}
          </div>
        )}

        <WaterfallBridge v={v} />
      </div>

      {/* Two-sided downside corridor (or the Cat 3A upside-only note) */}
      <DownsideBand v={v} />

      {/* Annual money tiles */}
      <div className="rounded-lg border border-carbon-gray-20 p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Tile
            label="Shared pool / yr"
            value={fmtUsdCompact(v.poolTotalUsd)}
            sub={`$${v.sharedPoolPmpm} PMPM`}
          />
          <Tile
            label="Provider / yr · net"
            value={fmtUsdCompact(v.providerNetTotalUsd)}
            sub={
              v.owes
                ? `$${v.providerPmpm} share + $${v.infraPmpm} infra − $${v.providerLiabilityPmpm} owed = $${v.providerNetPmpm} PMPM`
                : `$${v.providerPmpm} share + $${v.infraPmpm} infra = $${v.providerNetPmpm} PMPM`
            }
            tone="provider"
          />
          <Tile
            label="Payer / yr · net"
            value={fmtUsdCompact(v.payerNetTotalUsd)}
            sub={
              v.owes
                ? `$${v.payerPmpm} share − $${v.infraPmpm} infra + $${v.providerLiabilityPmpm} recovered = $${v.payerNetPmpm} PMPM`
                : `$${v.payerPmpm} share − $${v.infraPmpm} infra = $${v.payerNetPmpm} PMPM`
            }
            tone="payer"
          />
        </div>
        <p className="mt-2 text-[9px] text-carbon-gray-50">
          Annual totals — PMPM (per-member-per-<span className="font-semibold">month</span>) ×{' '}
          <span className="font-semibold">{memberMonths}</span> member-months (held constant; annual
          = ~{(v.model.memberMonths / 12).toLocaleString()} lives × 12 mo). Both tiles are on the
          SAME net basis: infra is a payer cost, and a two-sided downside the provider owes is a
          payer inflow (coalition/red-team fix — the two nets reconcile).
        </p>
      </div>

      {/* Quarantined REAL recovery — never in the split; explicit non-additivity marker */}
      <div className="rounded-lg border border-[#ffb3b8] bg-[#fff1f1] p-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold text-carbon-red">
            Payment-integrity recovery · real — quarantined
          </p>
          <span className="mono rounded bg-white px-1.5 py-0.5 text-[9px] text-carbon-gray-60">
            as of seq {recovery.epoch.ledgerSeq}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-carbon-gray-70">
          <span className="mono font-semibold text-carbon-red">{fmtUsd(recovery.realizedUsd)}</span>{' '}
          realized recovery +{' '}
          <span className="mono font-semibold text-carbon-red">
            {fmtUsd(recovery.returnableUsd)}
          </span>{' '}
          returnable. Already in the MLR numerator —{' '}
          <span className="font-semibold">never counted as shared savings</span>.
        </p>
        <p className="mono mt-1.5 rounded bg-white px-1.5 py-0.5 text-[9px] font-semibold text-carbon-gray-70">
          ∑ not applicable — different accounting basis (MLR-bearing $ vs modelled PMPM). Shown
          side-by-side to keep the two money stories separate, not summed.
        </p>
      </div>
    </div>
  );
}

/** The benchmark → pool waterfall bridge, driven by the same gating logic in computeVbcScenario. */
function WaterfallBridge({ v }: { v: VbcScenario }): React.ReactElement {
  const meetsMsr = v.grossSavingsPmpm >= v.msrThresholdPmpm;
  const rows: Array<{ label: string; val: string; tone?: 'muted' | 'red' | 'ok' }> = [
    { label: 'Benchmark PMPM', val: `$${v.benchmarkPmpm}` },
    { label: '− Actual paid spend', val: `−$${v.actualPmpm}` },
    {
      label: '= Gross savings',
      val: `$${v.rawGrossPmpm}`,
      tone: v.rawGrossPmpm < 0 ? 'red' : undefined,
    },
    {
      label: `MSR floor (needs ≥ $${v.msrThresholdPmpm})`,
      val: meetsMsr ? '✓ clears' : '✗ → $0',
      tone: meetsMsr ? 'ok' : 'red',
    },
    {
      label: 'Quality gate',
      val: v.model.qualityGateMet ? '✓ met' : '✗ ×0 forfeit',
      tone: v.model.qualityGateMet ? 'ok' : 'red',
    },
    { label: '= Shared pool', val: `$${v.sharedPoolPmpm}`, tone: v.qualifies ? 'ok' : 'red' },
    { label: '→ Provider / Payer', val: `$${v.providerPmpm} / $${v.payerPmpm}`, tone: 'muted' },
    ...(v.owes
      ? [
          {
            label: `↓ Downside — provider owes (share of overspend, ≤ $${v.stopLossCapPmpm} stop-loss)`,
            val: `−$${v.providerLiabilityPmpm}`,
            tone: 'red' as const,
          },
        ]
      : []),
  ];
  return (
    <div className="mt-3 rounded border border-dashed border-carbon-gray-30 p-2">
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-carbon-gray-50">
        Benchmark → pool bridge
      </p>
      <table className="mono w-full text-left text-[10px]">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-carbon-gray-10 first:border-t-0">
              <td className="py-0.5 text-carbon-gray-70">{r.label}</td>
              <td
                className={`py-0.5 text-right font-semibold ${r.tone === 'red' ? 'text-carbon-red' : r.tone === 'ok' ? 'text-[#0e6027]' : r.tone === 'muted' ? 'text-carbon-gray-60' : 'text-carbon-gray-90'}`}
              >
                {r.val}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Symmetric two-sided corridor: provider-owes (left) ↔ provider-earns (right), stop-loss cap at each end. */
function DownsideBand({ v }: { v: VbcScenario }): React.ReactElement {
  if (!v.twoSided) {
    return (
      <div className="rounded-lg border border-carbon-gray-20 bg-carbon-gray-10 p-2 text-[10px] text-carbon-gray-70">
        <span className="font-semibold text-carbon-gray-90">Upside-only (Cat 3A):</span> the pool is
        floored at $0 — the provider never owes a downside, however far actual runs over benchmark.
      </div>
    );
  }
  const cap = v.stopLossCapPmpm || 1;
  const owe = v.providerLiabilityPmpm;
  const earn = v.providerPmpm;
  // The OWE side is bounded by the stop-loss cap (real). The EARN side is NOT stop-loss-capped, so it
  // scales by its own magnitude (the marker shows position, and the end label states the actual $).
  const earnRef = Math.max(cap, earn, 1);
  const withinCorridor = v.overBenchmark && !v.owes;
  const markerLeftPct = v.owes
    ? 50 - Math.min(1, owe / cap) * 50
    : withinCorridor
      ? 50
      : 50 + Math.min(1, earn / earnRef) * 50;
  const statusText = v.owes
    ? `Provider OWES $${owe} PMPM${v.liabilityClamped ? ' (clamped at stop-loss)' : ''}`
    : withinCorridor
      ? 'Within the risk corridor — neither shares nor owes'
      : `Provider earns $${earn} PMPM`;
  const statusColor = v.owes
    ? 'text-carbon-red'
    : withinCorridor
      ? 'text-[#6929c4]'
      : 'text-[#0e6027]';
  return (
    <div className="rounded-lg border border-[#d4bbff] bg-[#faf7ff] p-3">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <p className="text-[11px] font-semibold text-[#6929c4]">
          Two-sided risk corridor · PMPM{' '}
          <span className="text-[9px] font-normal text-carbon-gray-50">
            (symmetric ±${v.mlrThresholdPmpm} deadband = MSR/MLR · downside stop-loss $
            {v.stopLossCapPmpm})
          </span>
        </p>
        <span className={`mono text-[10px] font-semibold ${statusColor}`}>{statusText}</span>
      </div>
      <div className="relative mt-2 h-6 w-full rounded border border-carbon-gray-20 bg-gradient-to-r from-[#ffd7d9] via-carbon-gray-10 to-[#c8e6cf]">
        <div className="absolute left-1/2 top-0 h-full w-px bg-carbon-gray-50" />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          style={{ left: `${markerLeftPct}%`, background: v.owes ? '#da1e28' : '#0e6027' }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[9px] font-semibold text-carbon-gray-60">
        <span className="text-carbon-red">← owes (stop-loss −${v.stopLossCapPmpm})</span>
        <span>benchmark ±corridor</span>
        <span className="text-[#0e6027]">earns ${earn} (uncapped) →</span>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'provider' | 'payer';
}): React.ReactElement {
  const color = tone === 'provider' ? PROVIDER.hex : tone === 'payer' ? PAYER.hex : '#161616';
  return (
    <div className="rounded border border-carbon-gray-20 p-2">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-carbon-gray-50">
        {label}
      </p>
      <p className="num text-base" style={{ color }}>
        {value}
      </p>
      <p className="text-[9px] text-carbon-gray-50">{sub}</p>
    </div>
  );
}
