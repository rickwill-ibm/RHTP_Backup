'use client';
/**
 * FlowCanvas — the v2 live-operations animation, kept PROMINENT (co-resident with the spine, never
 * hidden behind a toggle). It duplicates the original board's animated SVG grid (lanes, stage cells,
 * gateways, EDI acks, payer-UM tray, gold-card / kickback arcs, moving tokens) and adds a compact
 * transport bar + a lean counter strip. The column matching the spine's `focused` stage is
 * highlighted so the canvas stays connected to the Authorization Spine above it.
 *
 * PRESENTATION-ONLY: reads state from `op.sim`, calls only existing `op` handlers. It never imports
 * createSim/advance and never touches seal()/hashing/ledger fields.
 *
 * CLIENT-SAFE: spine + engine types + opsShared + React only. No `@/lib/evidence`, no `node:crypto`.
 */
import { LANE_LABEL } from '@/lib/goldenThread/e2eFlow';
import {
  PATH,
  SIM_LANES,
  maturityBand,
  throughputPerMin,
  touchlessPct,
  pctWaived,
  pendRate,
  slaAtRisk,
  execEarnedCeiling,
  type SimState,
  type Gate,
} from '@/lib/goldenThread/flowSim';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';
import {
  LABEL_W,
  CELL_W,
  CELL_H,
  GRID_W,
  LANE_H,
  TOTAL_H,
  cellX,
  laneY,
  GATE_COLOR,
  GATE_BG,
  LANE_ACCENT,
  FlowArcs,
  FlowTokens,
  GatewayNodes,
  AckPulses,
  SubLaneTray,
} from '@/components/goldenThread/flow/FlowCanvasTokens';

function activeGateAt(s: SimState, idx: number): Gate | undefined {
  for (const t of s.txns) {
    if (t.idx === idx && (t.phase === 'gate' || t.phase === 'held' || t.phase === 'denied')) {
      const g = t.phase === 'denied' ? 'deny' : t.gates[idx];
      if (g) return g;
    }
  }
  return undefined;
}

export interface FlowCanvasProps {
  op: OperatingSim;
  focused: number;
}

export function FlowCanvas({ op, focused }: FlowCanvasProps): React.ReactElement {
  const s = op.sim;
  const anySub = s.txns.some((t) => t.phase === 'subflow');
  const focusedCol = PATH[focused]?.col ?? -1;

  return (
    <div className="space-y-2">
      <TransportBar op={op} />
      <CounterStrip s={s} />
      <div className="overflow-x-auto rounded-lg border border-carbon-gray-20 bg-white">
        <div className="relative" style={{ width: GRID_W, height: TOTAL_H }}>
          {/* focus column highlight — ties the canvas back to the spine */}
          {focusedCol >= 0 && (
            <div
              className="pointer-events-none absolute"
              data-testid="focus-column"
              style={{
                left: cellX(focusedCol),
                top: 2,
                width: CELL_W,
                height: TOTAL_H - 4,
                background: '#eaf2fb66',
                border: '1px solid #24427e55',
                borderRadius: 6,
                zIndex: 1,
              }}
            />
          )}
          {/* header col numbers */}
          {PATH.map((p) => (
            <div
              key={`h-${p.col}`}
              className="absolute text-center text-[9px] font-semibold text-carbon-gray-40"
              style={{ left: cellX(p.col), top: 6, width: CELL_W }}
            >
              {p.col + 1}
            </div>
          ))}
          {/* lane labels + separators */}
          {SIM_LANES.map((lane, row) => (
            <div key={lane}>
              <div
                className="absolute border-t border-carbon-gray-10"
                style={{ left: 0, top: laneY(row), width: GRID_W }}
              />
              <div
                className="absolute flex items-center px-2 text-[10px] font-semibold text-carbon-gray-80"
                style={{
                  left: 0,
                  top: laneY(row),
                  width: LABEL_W,
                  height: LANE_H,
                  borderLeft: `3px solid ${LANE_ACCENT[lane]}`,
                }}
              >
                {LANE_LABEL[lane]}
              </div>
            </div>
          ))}
          {/* stage cells */}
          {PATH.map((p) => {
            const gateHere = activeGateAt(s, p.idx);
            const inSub = p.stage.key === 'payer-ops' && anySub;
            const isFocus = p.idx === focused;
            return (
              <div
                key={p.stage.key}
                className="absolute rounded border bg-white px-1.5 py-1"
                style={{
                  left: cellX(p.col) + 5,
                  top: laneY(p.row) + 6,
                  width: CELL_W - 10,
                  height: CELL_H,
                  borderColor: gateHere
                    ? GATE_COLOR[gateHere]
                    : isFocus
                      ? '#24427e'
                      : inSub
                        ? '#24427e'
                        : '#e0e0e0',
                  background: gateHere ? GATE_BG[gateHere] : inSub ? '#eef4fb' : '#fff',
                  boxShadow: isFocus ? '0 0 0 2px #24427e55' : undefined,
                  zIndex: 2,
                }}
              >
                <p className="truncate text-[9px] font-semibold leading-tight text-carbon-gray-90">
                  {p.stage.label}
                </p>
                <p className="mono text-[8px] text-carbon-gray-50">
                  {p.stage.verdict.evidenceTier}→{p.stage.verdict.permittedRung} cap · now A
                  {execEarnedCeiling(s)}
                </p>
                {gateHere && (
                  <span
                    className="mono text-[8px] font-bold uppercase"
                    style={{ color: GATE_COLOR[gateHere] }}
                  >
                    {gateHere}
                  </span>
                )}
              </div>
            );
          })}
          <GatewayNodes />
          <AckPulses s={s} />
          {anySub && <SubLaneTray s={s} />}
          <FlowArcs txns={s.txns} />
          <FlowTokens txns={s.txns} inCapture={op.inCapture} />
        </div>
      </div>
      <p className="text-[10px] italic text-carbon-gray-40">
        Prototype on seed data · mock channel, not transmitted. Transactions cross the real EDI
        topology with acknowledgments (TA1/999/277CA/278 resp); gate colors read from the real
        Twin-Ladder verdict; only the Medical Director issues a deny. An auth is <em>pended</em>{' '}
        (not &ldquo;suspended&rdquo; — that is a 42 CFR 455.23 payment-hold). SLA clocks are
        time-compressed for the demo.
      </p>
    </div>
  );
}

function TransportBar({ op }: { op: OperatingSim }): React.ReactElement {
  const band = maturityBand(op.maturity / 100);
  return (
    <div className="ed-card flex flex-wrap items-center gap-2 p-2">
      <button
        type="button"
        onClick={op.play}
        className="rounded bg-carbon-blue px-3 py-1 text-xs font-semibold text-white hover:bg-carbon-blue-hover"
      >
        {op.running ? '❚❚ Pause' : '▶ Play'}
      </button>
      <button
        type="button"
        onClick={op.step}
        className="rounded border border-carbon-gray-30 px-2 py-1 text-xs text-carbon-gray-70 hover:bg-carbon-gray-10"
      >
        ⏭ Step
      </button>
      <div className="flex items-center gap-1">
        {[0.5, 1, 2, 4].map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => op.setSpeed(x)}
            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${op.speed === x ? 'bg-carbon-gray-90 text-white' : 'border border-carbon-gray-30 text-carbon-gray-70'}`}
          >
            {x}×
          </button>
        ))}
      </div>
      <span className="mx-1 h-4 w-px bg-carbon-gray-20" />
      <button
        type="button"
        onClick={op.spawn}
        className="rounded border border-[#0f766e] px-2 py-1 text-[11px] font-semibold text-[#0f766e] hover:bg-[#e6f4f1]"
      >
        + 278 prior-auth
      </button>
      <button
        type="button"
        onClick={op.batch}
        className="rounded border border-[#5b3fa3] px-2 py-1 text-[11px] font-semibold text-[#5b3fa3] hover:bg-[#f0ecfa]"
      >
        ⇉ Run 837 batch
      </button>
      <button
        type="button"
        onClick={op.reset}
        className="rounded border border-carbon-gray-30 px-2 py-1 text-[11px] text-carbon-gray-60 hover:bg-carbon-gray-10"
      >
        ↺ Reset
      </button>
      <label className="ml-auto flex items-center gap-2 text-[10px] font-semibold text-carbon-gray-60">
        Maturity · {band.label}
        <input
          aria-label="Trust maturity"
          type="range"
          min={0}
          max={100}
          value={op.maturity}
          onChange={(e) => op.changeMaturity(Number(e.target.value))}
          className="w-32 accent-carbon-blue"
        />
      </label>
    </div>
  );
}

function CounterStrip({ s }: { s: SimState }): React.ReactElement {
  const tiles: Array<{ label: string; value: string; color: string }> = [
    { label: 'In flight', value: String(s.counters.inFlight), color: '#24427e' },
    { label: 'Approved', value: String(s.counters.approved), color: '#24a148' },
    { label: 'Denied (MD)', value: String(s.counters.denied), color: '#da1e28' },
    { label: 'Touchless', value: `${touchlessPct(s)}%`, color: '#0f766e' },
    { label: 'PA-waived', value: `${pctWaived(s)}%`, color: '#b58a00' },
    { label: 'Pend rate', value: `${pendRate(s)}%`, color: '#b45309' },
    { label: 'Throughput /min', value: String(throughputPerMin(s)), color: '#161616' },
    { label: 'SLA at risk', value: String(slaAtRisk(s)), color: '#da1e28' },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
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
