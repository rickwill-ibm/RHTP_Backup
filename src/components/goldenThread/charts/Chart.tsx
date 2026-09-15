'use client';
/**
 * Chart — one dependency-free, inline-SVG chart that renders a ChartSpec (scatter / line / bar) in the
 * shared analytic theme. Reusable app-wide. Follows the dataviz method: a framed plot area, thin
 * recessive grid on BOTH axes, real x- and y-axis tick labels, fixed-order validated categorical hues,
 * ≥9px markers, 2.5px lines, selective direct labels, a legend for ≥2 series, a hover tooltip on every
 * mark, and status-red reserved for flagged outliers only.
 *
 * CLIENT-SAFE: theme + spec types only.
 */
import { useState } from 'react';
import { CAT, STATUS, INK } from '@/lib/goldenThread/analyticsTheme';
import type { ChartSpec, TickFmt } from '@/lib/goldenThread/chartSpec';

const W = 680,
  H = 340,
  PAD = { t: 20, r: 22, b: 48, l: 62 };
const IW = W - PAD.l - PAD.r,
  IH = H - PAD.t - PAD.b;

/** Tooltip / direct-label formatter (precise). */
const fmt = (v: number, k?: TickFmt): string =>
  k === 'pct'
    ? `${Math.round(v * 100)}%`
    : k === 'usd'
      ? `$${Math.round(v).toLocaleString()}`
      : k === 'day'
        ? `d${Math.round(v)}`
        : `${Math.round(v * 10) / 10}`;

/** Axis-tick formatter (compact — keeps ticks from colliding). */
const fmtTick = (v: number, k?: TickFmt): string => {
  if (k === 'pct') return `${Math.round(v * 100)}%`;
  if (k === 'usd') return Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`;
  if (k === 'day') return `d${Math.round(v)}`;
  return `${Math.round(v * 100) / 100}`;
};

function niceTicks(min: number, max: number, n = 4): number[] {
  if (min === max) return [min];
  const span = max - min,
    step = Math.pow(10, Math.floor(Math.log10(span / n)));
  const err = span / n / step;
  const mult = err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1;
  const s = mult * step;
  const t: number[] = [];
  for (let v = Math.ceil(min / s) * s; v <= max + 1e-9; v += s) t.push(Number(v.toFixed(6)));
  return t;
}

interface Tip {
  x: number;
  y: number;
  text: string;
}

export function Chart({ spec }: { spec: ChartSpec }): React.ReactElement {
  const [tip, setTip] = useState<Tip | null>(null);

  // ── domain ──
  let xs: number[] = [],
    ys: number[] = [];
  if (spec.kind === 'scatter') {
    xs = spec.points.map((p) => p.x);
    ys = spec.points.map((p) => p.y);
    if (spec.threshold) ys.push(spec.threshold.y);
  } else if (spec.kind === 'line') {
    for (const s of spec.series) {
      xs.push(...s.points.map((p) => p.x));
      ys.push(...s.points.map((p) => p.y));
    }
    if (spec.threshold) ys.push(spec.threshold.y);
  } else {
    xs = spec.bars.map((_, i) => i);
    ys = spec.bars.map((b) => b.value);
    if (!ys.some((v) => v < 0)) ys.push(0);
  }

  const xMin = Math.min(...xs),
    xMax = Math.max(...xs);
  const yMin = Math.min(...ys, 0);
  let yMax = Math.max(...ys);
  if (yMin === yMax) yMax = yMin + 1;
  const yPad = (yMax - yMin) * 0.1;
  yMax += yPad;
  const sx = (x: number): number =>
    PAD.l + (xMax === xMin ? IW / 2 : ((x - xMin) / (xMax - xMin)) * IW);
  const sy = (y: number): number => PAD.t + IH - ((y - yMin) / (yMax - yMin)) * IH;

  const yFmt = 'yTickFmt' in spec ? spec.yTickFmt : undefined;
  const xFmt = 'xTickFmt' in spec ? spec.xTickFmt : undefined;
  const yTicks = niceTicks(yMin, yMax, 4);
  const xTicks = spec.kind === 'bar' ? [] : niceTicks(xMin, xMax, 5);
  const legendSeries = spec.kind === 'line' && spec.series.length >= 2 ? spec.series : null;
  const accent = CAT[0];

  return (
    <figure
      className="relative m-0 overflow-hidden rounded-lg border border-carbon-gray-20 bg-white shadow-sm"
      style={{ maxWidth: W }}
    >
      {/* title strip — anchors the chart as a finished artifact */}
      <figcaption
        className="flex items-center gap-2 border-b border-carbon-gray-10 px-3 py-2"
        style={{ background: '#fafbfc' }}
      >
        <span className="inline-block h-3 w-1 rounded-sm" style={{ background: accent }} />
        <span className="text-[12px] font-semibold text-carbon-gray-90">{spec.title}</span>
      </figcaption>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={spec.title}
        style={{ display: 'block' }}
      >
        {/* plot-area frame */}
        <rect
          x={PAD.l}
          y={PAD.t}
          width={IW}
          height={IH}
          fill="#fcfdfe"
          stroke={INK.grid}
          strokeWidth={1}
          rx={3}
        />

        {/* horizontal grid + y ticks */}
        {yTicks.map((t) => (
          <g key={`y${t}`}>
            <line
              x1={PAD.l}
              y1={sy(t)}
              x2={PAD.l + IW}
              y2={sy(t)}
              stroke={INK.grid}
              strokeWidth={1}
            />
            <text x={PAD.l - 9} y={sy(t) + 3.5} textAnchor="end" fontSize={10.5} fill={INK.muted}>
              {fmtTick(t, yFmt)}
            </text>
          </g>
        ))}

        {/* vertical grid + x ticks (scatter / line) */}
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line
              x1={sx(t)}
              y1={PAD.t}
              x2={sx(t)}
              y2={PAD.t + IH}
              stroke={INK.grid}
              strokeWidth={1}
              strokeOpacity={0.6}
            />
            <text
              x={sx(t)}
              y={PAD.t + IH + 15}
              textAnchor="middle"
              fontSize={10.5}
              fill={INK.muted}
            >
              {fmtTick(t, xFmt)}
            </text>
          </g>
        ))}

        {/* axis lines */}
        <line
          x1={PAD.l}
          y1={PAD.t}
          x2={PAD.l}
          y2={PAD.t + IH}
          stroke={INK.axis}
          strokeWidth={1.25}
        />
        <line
          x1={PAD.l}
          y1={PAD.t + IH}
          x2={PAD.l + IW}
          y2={PAD.t + IH}
          stroke={INK.axis}
          strokeWidth={1.25}
        />

        {/* axis titles */}
        <text
          x={PAD.l + IW / 2}
          y={H - 8}
          textAnchor="middle"
          fontSize={10.5}
          fontWeight={600}
          fill={INK.secondary}
        >
          {spec.xLabel ?? ''}
        </text>
        <text
          transform={`translate(15 ${PAD.t + IH / 2}) rotate(-90)`}
          textAnchor="middle"
          fontSize={10.5}
          fontWeight={600}
          fill={INK.secondary}
        >
          {spec.yLabel}
        </text>

        {/* threshold line */}
        {'threshold' in spec && spec.threshold && (
          <g>
            <line
              x1={PAD.l}
              y1={sy(spec.threshold.y)}
              x2={PAD.l + IW}
              y2={sy(spec.threshold.y)}
              stroke={STATUS.critical}
              strokeWidth={1.5}
              strokeDasharray="6 4"
            />
            <rect
              x={PAD.l + IW - 4 - measure(spec.threshold.label)}
              y={sy(spec.threshold.y) - 15}
              width={measure(spec.threshold.label) + 4}
              height={13}
              rx={2}
              fill={STATUS.critical}
              fillOpacity={0.1}
            />
            <text
              x={PAD.l + IW - 6}
              y={sy(spec.threshold.y) - 5}
              textAnchor="end"
              fontSize={9.5}
              fontWeight={700}
              fill={STATUS.critical}
            >
              {spec.threshold.label}
            </text>
          </g>
        )}

        {/* marks — scatter */}
        {spec.kind === 'scatter' &&
          spec.points.map((p, i) => (
            <circle
              key={i}
              cx={sx(p.x)}
              cy={sy(p.y)}
              r={p.highlight ? 7 : 5}
              fill={p.highlight ? STATUS.critical : catColorForSeries(p.series)}
              fillOpacity={p.highlight ? 0.95 : 0.7}
              stroke={INK.surface}
              strokeWidth={p.highlight ? 2 : 1.25}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() =>
                setTip({
                  x: sx(p.x),
                  y: sy(p.y),
                  text: p.label ?? `(${fmt(p.x, spec.xTickFmt)}, ${fmt(p.y, spec.yTickFmt)})`,
                })
              }
              onMouseLeave={() => setTip(null)}
            />
          ))}

        {/* marks — line */}
        {spec.kind === 'line' &&
          spec.series.map((s, si) => (
            <g key={si}>
              <polyline
                fill="none"
                stroke={CAT[si] ?? INK.secondary}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')}
              />
              {s.points.map((p, i) => (
                <circle
                  key={i}
                  cx={sx(p.x)}
                  cy={sy(p.y)}
                  r={4.5}
                  fill={CAT[si] ?? INK.secondary}
                  stroke={INK.surface}
                  strokeWidth={1.5}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() =>
                    setTip({
                      x: sx(p.x),
                      y: sy(p.y),
                      text: `${s.name}: ${fmt(p.y, spec.yTickFmt)} (${fmt(p.x)})`,
                    })
                  }
                  onMouseLeave={() => setTip(null)}
                />
              ))}
            </g>
          ))}

        {/* marks — bar */}
        {spec.kind === 'bar' &&
          (() => {
            const n = spec.bars.length,
              bw = Math.min(72, IW / n - 12);
            return spec.bars.map((b, i) => {
              const cx = PAD.l + (IW / n) * (i + 0.5);
              const y0 = sy(0),
                y1 = sy(b.value);
              const label = b.label.length > 14 ? b.label.slice(0, 13) + '…' : b.label;
              return (
                <g
                  key={i}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() =>
                    setTip({
                      x: cx,
                      y: Math.min(y0, y1),
                      text: `${b.label}: ${fmt(b.value, spec.yTickFmt)}`,
                    })
                  }
                  onMouseLeave={() => setTip(null)}
                >
                  <rect
                    x={cx - bw / 2}
                    y={Math.min(y0, y1)}
                    width={bw}
                    height={Math.max(2, Math.abs(y1 - y0))}
                    rx={4}
                    fill={b.highlight ? STATUS.critical : catColorForSeries(b.seriesIndex)}
                    fillOpacity={b.highlight ? 0.95 : 0.82}
                  />
                  <text
                    x={cx}
                    y={Math.min(y0, y1) - 6}
                    textAnchor="middle"
                    fontSize={10.5}
                    fontWeight={700}
                    fill={b.highlight ? STATUS.critical : INK.primary}
                  >
                    {fmt(b.value, spec.yTickFmt)}
                  </text>
                  <text
                    x={cx}
                    y={PAD.t + IH + 15}
                    textAnchor="middle"
                    fontSize={9.5}
                    fill={INK.secondary}
                  >
                    {label}
                  </text>
                </g>
              );
            });
          })()}
      </svg>

      {legendSeries && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 px-3 pb-2">
          {legendSeries.map((s, i) => (
            <span key={s.name} className="flex items-center gap-1 text-[10px] text-carbon-gray-70">
              <span
                className="inline-block h-2 w-3 rounded-sm"
                style={{ background: CAT[i] ?? INK.secondary }}
              />
              {s.name}
            </span>
          ))}
        </div>
      )}

      {tip && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded bg-carbon-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-white shadow"
          style={{
            left: `${(tip.x / W) * 100}%`,
            top: `calc(${(tip.y / H) * 100}% + 34px)`,
            marginTop: -6,
            whiteSpace: 'nowrap',
          }}
        >
          {tip.text}
        </div>
      )}
    </figure>
  );
}

/** rough label width for the threshold pill (monospace-ish estimate) */
function measure(s: string): number {
  return s.length * 5.2;
}
function catColorForSeries(i?: number): string {
  return i === undefined ? CAT[0] : (CAT[i] ?? INK.secondary);
}
