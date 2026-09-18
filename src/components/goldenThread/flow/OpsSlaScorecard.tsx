'use client';
/**
 * OpsSlaScorecard — the SLA-attainment view for Operations. Renders `slaBook(s)`: a portfolio strip
 * (attainment %, resolution median/P90, first-touch, open/at-risk/breached) over a per-seat table
 * (queue depth, aging buckets, % within SLA, oldest, approaching-breach). Turnaround / attainment
 * read "—" until enough tickets have been worked (see slaBook's floor) so nothing is asserted over an
 * empty set. Pure projection — reads the engine, mutates nothing.
 */
import { slaBook, type SeatSla } from '@/lib/goldenThread/slaBook';
import type { SimState } from '@/lib/goldenThread/flowSim';

const hrs = (n: number | null): string => (n === null ? '—' : `${n}h`);
const pct = (n: number | null): string => (n === null ? '—' : `${n}%`);

function AgingBar({ aging }: { aging: SeatSla['aging'] }): React.ReactElement {
  const segs: Array<[number, string, string]> = [
    [aging.lt24h, '#24a148', '<24h'],
    [aging.h24_48, '#8ab534', '24–48h'],
    [aging.h48_72, '#b45309', '48–72h'],
    [aging.gt72h, '#da1e28', '>72h'],
  ];
  const total = segs.reduce((a, [n]) => a + n, 0) || 1;
  // Text alternative so aging is NOT conveyed by color alone (WCAG 1.4.1 / Section 508): a visible
  // non-zero breakdown plus an aria-label on the bar itself.
  const breakdown = segs.filter(([n]) => n > 0).map(([n, , label]) => `${label} ${n}`);
  const text = breakdown.length ? breakdown.join(' · ') : 'none';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        role="img"
        aria-label={`Aging of open work — ${text}`}
        className="inline-flex h-2 w-16 overflow-hidden rounded-sm"
      >
        {segs.map(([n, c, label], i) =>
          n > 0 ? (
            <span
              key={i}
              style={{ width: `${(n / total) * 100}%`, background: c }}
              title={`${label}: ${n}`}
            />
          ) : null
        )}
      </span>
      <span className="mono text-[9px] text-carbon-gray-50">{text}</span>
    </span>
  );
}

function PortfolioStrip({ s }: { s: SimState }): React.ReactElement {
  const p = slaBook(s).portfolio;
  const tiles: Array<{ label: string; value: string; color: string; title?: string }> = [
    {
      label: 'Within-SLA attainment',
      value: pct(p.attainmentPct),
      color: '#24a148',
      title: 'Closed within the loaded SLA window ÷ closed. Populates as tickets are worked.',
    },
    { label: 'Resolution TAT (median)', value: hrs(p.resolutionMedianHrs), color: '#24427e' },
    { label: 'Resolution TAT (P90)', value: hrs(p.resolutionP90Hrs), color: '#24427e' },
    {
      label: 'First-touch (median)',
      value: hrs(p.firstTouchMedianHrs),
      color: '#0f766e',
      title: 'Detection → claimed (grab). Populates once tickets are claimed.',
    },
    { label: 'Open', value: String(p.openCount), color: '#161616' },
    { label: 'Approaching breach', value: String(p.approachingCount), color: '#b45309' },
    { label: 'Breached (open)', value: String(p.breachCount), color: '#da1e28' },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      {tiles.map((t) => (
        <div key={t.label} className="ed-card p-2" title={t.title}>
          <p className="text-[9px] font-semibold uppercase tracking-wide text-carbon-gray-50">
            {t.label}
          </p>
          <p className="mono text-lg font-bold" style={{ color: t.color }}>
            {t.value}
          </p>
        </div>
      ))}
    </div>
  );
}

export function OpsSlaScorecard({ s }: { s: SimState }): React.ReactElement {
  const book = slaBook(s);
  return (
    <div className="ed-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold text-carbon-gray-90">
          SLA attainment · governed worklist
        </p>
        <span className="text-[9px] text-carbon-gray-40">
          loaded SLA window · time-compressed clock · turnaround populates as work is grabbed &
          closed
        </span>
      </div>
      <PortfolioStrip s={s} />

      {book.seats.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-[10px]">
            <thead className="text-carbon-gray-50">
              <tr className="border-b border-carbon-gray-20">
                <th className="py-1 pr-2 font-semibold">Seat</th>
                <th className="px-2 font-semibold">Depth</th>
                <th className="px-2 font-semibold">Aging</th>
                <th className="px-2 font-semibold">Within SLA</th>
                <th className="px-2 font-semibold">Approaching</th>
                <th className="px-2 font-semibold">Breached</th>
                <th className="px-2 font-semibold">Oldest</th>
              </tr>
            </thead>
            <tbody>
              {book.seats.map((seat) => (
                <tr key={seat.role} className="border-b border-carbon-gray-10">
                  <td className="py-1 pr-2">
                    <span className="font-semibold text-carbon-gray-90">{seat.label}</span>
                    <span className="mono ml-1 text-[9px] text-carbon-gray-40">
                      {seat.operator}
                    </span>
                  </td>
                  <td className="mono px-2">{seat.depth}</td>
                  <td className="px-2">
                    <AgingBar aging={seat.aging} />
                  </td>
                  <td className="mono px-2">{pct(seat.withinSlaPct)}</td>
                  <td
                    className="mono px-2"
                    style={{ color: seat.approaching ? '#b45309' : undefined }}
                  >
                    {seat.approaching}
                  </td>
                  <td
                    className="mono px-2"
                    style={{ color: seat.breaches ? '#da1e28' : undefined }}
                  >
                    {seat.breaches}
                  </td>
                  <td className="mono px-2">{seat.oldestOpenHrs}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
