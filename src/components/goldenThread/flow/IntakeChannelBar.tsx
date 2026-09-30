'use client';
/**
 * IntakeChannelBar — the multi-channel intake surface for the v2 flow board. The engine now tags every
 * transaction with a deterministic `channel`, so this counts `sim.txns` by channel LIVE and renders the
 * four real entering paths (SMART on FHIR / X12 278 batch / provider portal / fax-mail) as a labelled
 * share bar with counts. Each channel carries its provenance line (from CHANNELS) on expand, and every
 * segment is distinguished by color AND text (never color alone — WCAG). The CMS-0057-F honesty caption
 * makes clear this is an illustrative mix, not an all-SMART world.
 *
 * CLIENT-SAFE: engine types + pure channel metadata only. No `@/lib/evidence` barrel, no node.
 */
import { useState } from 'react';
import type { SimState, TxnType } from '@/lib/goldenThread/flowSim';
import { CHANNELS, CMS_0057F_NOTE, type IntakeChannel } from '@/lib/goldenThread/intakeChannels';

// Only INTAKE-bearing work has an arrival channel: prior-auth (278), eligibility (270) and claims
// (837). An 835 remittance is a payer→provider OUTBOUND and a 276 status is a query — neither
// "arrives" through a provider intake door, so they are excluded from the intake mix.
const INTAKE_TYPES: ReadonlySet<TxnType> = new Set<TxnType>([
  'pa',
  'elig',
  'claimP',
  'claimI',
  'claimD',
]);

const CHANNEL_COLOR: Readonly<Record<IntakeChannel, string>> = {
  'smart-fhir': '#24427e',
  'x12-278-batch': '#0f766e',
  'provider-portal': '#6929c4',
  'fax-mail': '#b45309',
};
const ORDER: readonly IntakeChannel[] = [
  'smart-fhir',
  'x12-278-batch',
  'provider-portal',
  'fax-mail',
];

export function IntakeChannelBar({ sim }: { sim: SimState }): React.ReactElement {
  const [open, setOpen] = useState<IntakeChannel | null>(null);
  const intakeTxns = sim.txns.filter((t) => INTAKE_TYPES.has(t.type));
  const counts = ORDER.map((ch) => ({
    ch,
    count: intakeTxns.filter((t) => t.channel === ch).length,
  }));
  const total = counts.reduce((n, c) => n + c.count, 0) || 1;

  return (
    <div className="ed-card p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
          Intake channels · live per-transaction origin ({intakeTxns.length} intake in flight)
        </p>
        <span className="mono text-[9px] text-carbon-gray-40">
          278 / 270 / 837 only · excl. outbound 835 &amp; status
        </span>
      </div>

      {/* Stacked share bar — width by share, but each segment also carries its own text (WCAG). */}
      <div
        className="flex h-6 w-full overflow-hidden rounded border border-carbon-gray-20"
        role="img"
        aria-label="Intake channel share"
      >
        {counts.map(({ ch, count }) => {
          const pct = Math.round((count / total) * 100);
          if (count === 0) return null;
          return (
            <div
              key={ch}
              className="flex items-center justify-center text-[8px] font-semibold text-white"
              style={{ width: `${(count / total) * 100}%`, background: CHANNEL_COLOR[ch] }}
              title={`${CHANNELS[ch].label} — ${pct}%`}
            >
              {pct >= 8 ? `${pct}%` : ''}
            </div>
          );
        })}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {counts.map(({ ch, count }) => (
          <button
            key={ch}
            type="button"
            onClick={() => setOpen((o) => (o === ch ? null : ch))}
            aria-expanded={open === ch}
            className="flex flex-col items-start rounded border border-carbon-gray-20 p-1.5 text-left hover:bg-carbon-gray-10"
          >
            <span className="flex items-center gap-1">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-sm"
                style={{ background: CHANNEL_COLOR[ch] }}
              />
              <span className="text-[9px] font-semibold text-carbon-gray-80">
                {CHANNELS[ch].label}
              </span>
            </span>
            <span className="mono text-[11px] text-carbon-gray-70">
              {count} · {Math.round((count / total) * 100)}%
            </span>
          </button>
        ))}
      </div>

      {open && (
        <p className="mt-1.5 rounded border border-carbon-gray-20 bg-carbon-gray-10 p-1.5 text-[9px] text-carbon-gray-70">
          <span className="font-semibold">{CHANNELS[open].label}:</span> {CHANNELS[open].provenance}
        </p>
      )}

      <p className="mt-1.5 text-[9px] italic text-carbon-gray-40">{CMS_0057F_NOTE}</p>
    </div>
  );
}
