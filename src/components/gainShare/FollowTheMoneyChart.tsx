'use client';
/**
 * FollowTheMoneyChart (Phase B — Gain-Share dashboards). The `m3_money_*` mock built for
 * real: a PMPM area chart where the shared-savings wedge opens between the benchmark and
 * actual paid spend and splits provider|payer, while the quarantined recovery money sits
 * at the floor and shrinks. Lens toggle (both / payer / provider), a Play control that
 * scrubs the horizon, and the per-phase headline tiles.
 *
 * Client component, pure SVG (no chart lib, no fetch, no PHI). Figures illustrative.
 */
import { useEffect, useRef, useState } from 'react';
import {
  MONEY_SERIES,
  MONEY_TILES,
  PHASES,
  phaseForScrub,
  type MoneyPoint,
} from '@/lib/gainShare/glidePathModel';

type MoneyLens = 'both' | 'payer' | 'provider';

// Plot geometry (viewBox units).
const W = 720;
const H = 320;
const PAD = { l: 48, r: 20, t: 20, b: 34 };
const Y_MIN = 355;
const Y_MAX = 540;

const xOf = (t: number): number => PAD.l + t * (W - PAD.l - PAD.r);
const yOf = (v: number): number => {
  const clamped = Math.max(Y_MIN, Math.min(Y_MAX, v));
  return PAD.t + (Y_MAX - clamped) * ((H - PAD.t - PAD.b) / (Y_MAX - Y_MIN));
};

const line = (pts: MoneyPoint[], key: keyof MoneyPoint): string =>
  pts.map((p) => `${xOf(p.t)},${yOf(p[key] as number)}`).join(' ');

/** A filled band between two series (upper drawn L→R, lower drawn R→L). */
const band = (pts: MoneyPoint[], upper: keyof MoneyPoint, lower: keyof MoneyPoint): string => {
  const top = pts.map((p) => `${xOf(p.t)},${yOf(p[upper] as number)}`);
  const bot = [...pts].reverse().map((p) => `${xOf(p.t)},${yOf(p[lower] as number)}`);
  return [...top, ...bot].join(' ');
};

function Tile({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone: 'slate' | 'green' | 'blue' | 'red' | 'amber';
}): React.ReactElement {
  const cls = {
    slate: 'border-carbon-gray-20 text-carbon-gray-100',
    green: 'border-carbon-gray-20 text-carbon-green',
    blue: 'border-carbon-gray-20 text-carbon-blue',
    red: 'border-[#ffb3b8] bg-carbon-red-light text-carbon-red',
    amber: 'border-carbon-gray-20 text-[#b45309]',
  }[tone];
  return (
    <div className={`rounded border p-3 ${cls}`}>
      <p className="text-lg font-semibold">{value}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-carbon-gray-60">{label}</p>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-carbon-gray-70">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${swatch}`} />
      {label}
    </span>
  );
}

export function FollowTheMoneyChart(): React.ReactElement {
  const [lens, setLens] = useState<MoneyLens>('both');
  const [scrub, setScrub] = useState<number>(8);
  const [playing, setPlaying] = useState<boolean>(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setScrub((s) => {
        if (s >= 100) {
          setPlaying(false);
          return 100;
        }
        return Math.min(100, s + 2);
      });
    }, 60);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing]);

  const phase = phaseForScrub(scrub);
  const tiles = MONEY_TILES[phase];
  const nowX = xOf(scrub / 100);
  const showProvider = lens !== 'payer';
  const showPayer = lens !== 'provider';

  const yTicks = [420, 480, 540];

  return (
    <section className="space-y-4 rounded-lg border border-carbon-gray-20 bg-carbon-gray-10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Follow the money</h2>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-carbon-gray-20 bg-white p-0.5">
            {(['both', 'payer', 'provider'] as MoneyLens[]).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLens(l)}
                aria-pressed={l === lens}
                className={`rounded px-3 py-1.5 text-sm font-semibold capitalize ${
                  l === lens
                    ? 'bg-carbon-gray-100 text-white'
                    : 'text-carbon-gray-70 hover:bg-carbon-gray-10'
                }`}
              >
                {l === 'payer' ? 'Payer / MCO' : l}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              if (scrub >= 100) setScrub(0);
              setPlaying((p) => !p);
            }}
            className="rounded bg-carbon-blue px-3 py-1.5 text-sm font-semibold text-white hover:bg-carbon-blue-hover"
          >
            {playing ? '❚❚ Pause' : '▶ Play'}
          </button>
          <span className="rounded bg-carbon-gray-100 px-2.5 py-1 text-xs font-semibold text-white">
            {PHASES[phase].name.split(' · ')[0]} · {PHASES[phase].timeframe}
          </span>
        </div>
      </div>

      <p className="text-sm text-carbon-gray-70">
        Per-member-per-month economics as a payer and provider move along the risk-transfer ladder.
        The gap between <strong>benchmark</strong> and <strong>actual paid spend</strong> is shared
        savings — it opens in the shared-computation phase and splits between the parties. Recovery
        (payment-integrity) is a separate, MLR-bearing story shown in the real ROI panel above — it
        is never part of this wedge.
      </p>

      <div className="rounded-lg border border-carbon-gray-20 bg-white p-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label="Follow the money chart"
        >
          {/* phase bands */}
          {[0, 1, 2].map((ph) => {
            const first = MONEY_SERIES.find((p) => p.phase === ph)!;
            const last = [...MONEY_SERIES].reverse().find((p) => p.phase === ph)!;
            return (
              <rect
                key={ph}
                x={xOf(first.t)}
                y={PAD.t}
                width={xOf(last.t) - xOf(first.t)}
                height={H - PAD.t - PAD.b}
                fill={ph === 1 ? '#edf5ff' : ph === 2 ? '#f7f3ff' : '#f4f4f4'}
                opacity={0.5}
              />
            );
          })}
          {/* y gridlines + labels */}
          {yTicks.map((v) => (
            <g key={v}>
              <line
                x1={PAD.l}
                y1={yOf(v)}
                x2={W - PAD.r}
                y2={yOf(v)}
                stroke="#e0e0e0"
                strokeWidth={1}
              />
              <text x={PAD.l - 6} y={yOf(v) + 3} textAnchor="end" fontSize={10} fill="#8d8d8d">
                ${v}
              </text>
            </g>
          ))}
          {/* provider slice (green): actual → providerShareTop */}
          {showProvider && (
            <polygon
              points={band(MONEY_SERIES as MoneyPoint[], 'providerShareTop', 'actual')}
              fill="#a7f0ba"
              opacity={0.85}
            />
          )}
          {/* payer slice (blue): providerShareTop → benchmark */}
          {showPayer && (
            <polygon
              points={band(MONEY_SERIES as MoneyPoint[], 'benchmark', 'providerShareTop')}
              fill="#a6c8ff"
              opacity={0.8}
            />
          )}
          {/* Recovery is NOT drawn here: recovery is payment-integrity (absolute $, MLR-bearing), not a PMPM
              savings series. It lives in the real ROI panel above — never on the VBC wedge. */}
          {/* benchmark (dashed) + actual (solid) */}
          <polyline
            points={line(MONEY_SERIES as MoneyPoint[], 'benchmark')}
            fill="none"
            stroke="#161616"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
          <polyline
            points={line(MONEY_SERIES as MoneyPoint[], 'actual')}
            fill="none"
            stroke="#161616"
            strokeWidth={2.5}
          />
          {/* now marker */}
          <line
            x1={nowX}
            y1={PAD.t}
            x2={nowX}
            y2={H - PAD.b}
            stroke="#0f62fe"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          {/* x labels */}
          {PHASES.map((p) => {
            const first = MONEY_SERIES.find((q) => q.phase === p.id)!;
            const last = [...MONEY_SERIES].reverse().find((q) => q.phase === p.id)!;
            const mid = (xOf(first.t) + xOf(last.t)) / 2;
            return (
              <text
                key={p.id}
                x={mid}
                y={H - 10}
                textAnchor="middle"
                fontSize={10}
                fill="#525252"
                fontWeight={600}
              >
                {p.name.split(' · ')[0]} · {p.name.split(' · ')[1]}
              </text>
            );
          })}
          {/* labels on curves */}
          <text
            x={W - PAD.r}
            y={yOf(MONEY_SERIES[MONEY_SERIES.length - 1].benchmark) - 6}
            textAnchor="end"
            fontSize={11}
            fontWeight={700}
            fill="#161616"
          >
            Benchmark
          </text>
          <text
            x={W - PAD.r}
            y={yOf(MONEY_SERIES[MONEY_SERIES.length - 1].actual) + 14}
            textAnchor="end"
            fontSize={11}
            fontWeight={700}
            fill="#161616"
          >
            Actual paid spend
          </text>
        </svg>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          <Legend swatch="bg-carbon-gray-100" label="Benchmark (what spend would have been)" />
          <Legend swatch="bg-carbon-gray-90" label="Actual paid spend" />
          {showProvider && <Legend swatch="bg-[#a7f0ba]" label="Provider share of savings" />}
          {showPayer && <Legend swatch="bg-[#a6c8ff]" label="Payer share of savings" />}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          value={`$${tiles.sharedSavingsPmpm.toFixed(1)}`}
          label="Shared savings PMPM"
          tone="slate"
        />
        <Tile value={`$${tiles.providerShare.toFixed(1)}`} label="Provider share" tone="green" />
        <Tile value={`$${tiles.payerRetained.toFixed(1)}`} label="Payer retained" tone="blue" />
        <Tile
          value={`$${tiles.adminSaved.toFixed(1)}`}
          label="Admin saved (shift-left)"
          tone="amber"
        />
      </div>

      <div className="rounded border-l-4 border-carbon-yellow bg-carbon-yellow-light p-3 text-xs text-carbon-gray-80">
        {tiles.note}
      </div>
      <p className="text-[11px] italic text-carbon-gray-50">
        Illustrative PMPM values on a ~4-year horizon, to show shape and magnitude. Phase 0 shows
        ~no TCOC savings on purpose: its value is clean-claim / admin, not shared savings.
        Payment-integrity recovery is not shown here — it is not a PMPM savings series; see the real
        ROI panel above.
      </p>
    </section>
  );
}
