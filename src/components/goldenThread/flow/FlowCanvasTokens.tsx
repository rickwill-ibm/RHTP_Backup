'use client';
/**
 * FlowCanvasTokens — the moving-token + arc layer for the v2 FlowCanvas, split out so the canvas
 * frame stays under the size cap. This DUPLICATES the original LiveProcessFlowBoard geometry +
 * token helpers verbatim (the user asked to "duplicate the screen"); it changes no engine logic.
 *
 * Exports the shared geometry so the sibling FlowCanvas grid frame reads from one source, plus the
 * animated SVG components (gold-card / kickback arcs, moving tokens, kickback packets).
 *
 * CLIENT-SAFE: spine + engine types + React only. No `@/lib/evidence` barrel, no `node:crypto`.
 */
import {
  PATH,
  PAYER_SUBSTEPS,
  SIM_LANES,
  RT_LEG_TICKS,
  KB_LEG_TICKS,
  TXN_TYPE_META,
  type SimState,
  type Txn,
  type TxnType,
  type TxnTypeMeta,
  type Gate,
} from '@/lib/goldenThread/flowSim';
import { getGlobalTick } from '@/components/goldenThread/flow/useOperatingSim';

// ── Geometry (duplicated from LiveProcessFlowBoard, sanctioned) ─────────────────────
export const LABEL_W = 128;
export const CELL_W = 76;
export const CELL_H = 48;
export const HEADER_H = 24;
export const LANE_H = 58;
export const GW_COL = 11;
export const GRID_W = LABEL_W + (GW_COL + 1) * CELL_W;
export const GRID_H = HEADER_H + SIM_LANES.length * LANE_H;
export const SUB_CELL_W = 50;
export const TRAY_Y = GRID_H + 10;
export const TRAY_H = 52;
export const TOTAL_H = TRAY_Y + TRAY_H + 6;

export const cellX = (col: number): number => LABEL_W + col * CELL_W;
export const cellCX = (col: number): number => cellX(col) + CELL_W / 2;
export const laneY = (row: number): number => HEADER_H + row * LANE_H;
export const laneCY = (row: number): number => laneY(row) + LANE_H / 2;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const quad = (a: number, c: number, b: number, t: number): number =>
  (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;

export const PROV_GW = { x: cellCX(GW_COL), y: laneCY(1) };
export const PAYER_GW = { x: cellCX(GW_COL), y: laneCY(2) };
export const PAYER_OPS_COL = PATH.find((p) => p.stage.key === 'payer-ops')?.col ?? 5;
export const PAS_COL = PATH.find((p) => p.stage.key === 'pas-submit')?.col ?? 4;
export const GOLD_COL = PATH.find((p) => p.stage.key === 'gold-card')?.col ?? 2;
export const CLAIM_COL = PATH.find((p) => p.stage.key === 'claim')?.col ?? 6;
export const DTR_COL = PATH.find((p) => p.stage.key === 'dtr')?.col ?? 3;
export const subCellX = (i: number): number => cellX(PAYER_OPS_COL) + i * SUB_CELL_W;
const subCellCX = (i: number): number => subCellX(i) + SUB_CELL_W / 2;
export const TRAY_CY = TRAY_Y + TRAY_H / 2;
export const BYPASS_Y = laneY(2) - 20;

export const GATE_COLOR: Record<Gate, string> = {
  pass: '#24a148',
  pend: '#b45309',
  deny: '#da1e28',
};
export const GATE_BG: Record<Gate, string> = {
  pass: '#defbe6',
  pend: '#fdf6dd',
  deny: '#fff1f1',
};
export const LANE_ACCENT: Record<string, string> = {
  emr: '#0f766e',
  'provider-agent': '#0e7490',
  payer: '#24427e',
  'payer-agent': '#5b3fa3',
  surveillance: '#b45309',
};

export function tokenGeom(meta: TxnTypeMeta): { size: number; radius: string; rotate: boolean } {
  const size = meta.light ? 14 : 18;
  switch (meta.shape) {
    case 'circle':
      return { size, radius: '50%', rotate: false };
    case 'diamond':
      return { size: size - 2, radius: '3px', rotate: true };
    case 'roundsq':
      return { size, radius: '4px', rotate: false };
    case 'moneysq':
      return { size, radius: '2px', rotate: false };
    case 'shield':
      return { size, radius: '5px 5px 8px 8px', rotate: false };
    case 'chevron':
      return { size, radius: '2px', rotate: false };
    default:
      return { size, radius: '3px', rotate: false };
  }
}

function subIndexInTray(t: Txn): number {
  const key = t.steps[t.sub]?.key;
  const i = PAYER_SUBSTEPS.findIndex((s) => s.key === key);
  return i < 0 ? 0 : i;
}

export function txnXY(t: Txn): { x: number; y: number } {
  if (t.kbPhase !== 'none') return { x: cellCX(PATH[t.idx].col), y: laneCY(PATH[t.idx].row) };
  if (t.phase === 'subflow') return { x: subCellCX(subIndexInTray(t)), y: TRAY_CY };
  if (t.phase === 'roundtrip') {
    const p = Math.min(1, Math.max(0, (getGlobalTick() - t.phaseStart) / RT_LEG_TICKS));
    const legs = [
      [{ x: cellCX(PAS_COL), y: laneCY(1) }, PROV_GW],
      [PROV_GW, PAYER_GW],
      [PAYER_GW, { x: cellCX(PAYER_OPS_COL), y: laneCY(2) }],
    ];
    const [a, b] = legs[Math.min(2, t.rtLeg)];
    return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) };
  }
  const src = PATH[t.idx];
  if (t.phase === 'transit') {
    const tgt = PATH[t.targetIdx] ?? src;
    if (t.goldCarded && src.col >= PAYER_OPS_COL && tgt.col >= CLAIM_COL) {
      const x = quad(cellCX(src.col), cellCX((src.col + tgt.col) / 2), cellCX(tgt.col), t.progress);
      const y = quad(laneCY(src.row), BYPASS_Y, laneCY(tgt.row), t.progress);
      return { x, y };
    }
    return {
      x: lerp(cellCX(src.col), cellCX(tgt.col), t.progress),
      y: lerp(laneCY(src.row), laneCY(tgt.row), t.progress),
    };
  }
  return { x: cellCX(src.col), y: laneCY(src.row) };
}

export function kbXY(t: Txn): { x: number; y: number } {
  const payerCol = t.kbReason === 'reject' ? CLAIM_COL : PAYER_OPS_COL;
  const P = { x: cellCX(payerCol), y: laneCY(2) };
  const Q = { x: cellCX(DTR_COL), y: laneCY(1) };
  const p = Math.min(1, Math.max(0, (getGlobalTick() - t.kbStart) / KB_LEG_TICKS));
  if (t.kbPhase === 'toProvider') return { x: lerp(P.x, Q.x, p), y: lerp(P.y, Q.y, p) };
  if (t.kbPhase === 'toPayer') return { x: lerp(Q.x, P.x, p), y: lerp(Q.y, P.y, p) };
  return Q;
}

export function FlowArcs({ txns }: { txns: Txn[] }): React.ReactElement {
  const mid = (GOLD_COL + CLAIM_COL) / 2;
  const goldPath = `M ${cellCX(GOLD_COL)} ${laneCY(3)} Q ${cellCX(mid)} ${BYPASS_Y - 6} ${cellCX(CLAIM_COL)} ${laneCY(2)}`;
  const gcActive = txns.some((t) => t.goldCarded);
  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={GRID_W}
      height={TOTAL_H}
      style={{ zIndex: 4 }}
    >
      <path
        d={goldPath}
        fill="none"
        stroke="#d4a017"
        strokeWidth={2}
        opacity={gcActive ? 0.5 : 0.2}
      />
      <text
        x={cellCX(mid)}
        y={BYPASS_Y - 9}
        fill={gcActive ? '#b58a00' : '#a8a8a8'}
        fontSize={9}
        fontWeight={700}
        textAnchor="middle"
      >
        {gcActive ? 'Gold-card bypass · PA WAIVED · no human' : 'Gold-card bypass · earned at A3'}
      </text>
      {txns
        .filter((t) => t.kbPhase !== 'none')
        .map((t) => {
          const payerCol = t.kbReason === 'reject' ? CLAIM_COL : PAYER_OPS_COL;
          const d = `M ${cellCX(payerCol)} ${laneCY(2)} Q ${cellCX((payerCol + DTR_COL) / 2)} ${laneCY(1) - 24} ${cellCX(DTR_COL)} ${laneCY(1)}`;
          return (
            <path
              key={`kbp-${t.id}`}
              d={d}
              fill="none"
              stroke="#0e7490"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              opacity={0.6}
            />
          );
        })}
    </svg>
  );
}

/** The moving tokens + kickback packets, duplicated from the original board's render. */
export function FlowTokens({
  txns,
  inCapture,
}: {
  txns: Txn[];
  inCapture: boolean;
}): React.ReactElement {
  return (
    <>
      {txns.map((t) => {
        const { x, y } = txnXY(t);
        const meta: TxnTypeMeta = TXN_TYPE_META[t.type as TxnType];
        const g = tokenGeom(meta);
        const half = g.size / 2;
        const gate = t.gates[t.idx];
        const ring = t.goldCarded
          ? '#d4a017'
          : t.phase === 'denied'
            ? GATE_COLOR.deny
            : gate && t.phase !== 'transit' && t.phase !== 'subflow'
              ? GATE_COLOR[gate]
              : meta.color;
        const kbActive = t.kbPhase !== 'none';
        return (
          <div
            key={t.id}
            className="absolute flex items-center justify-center font-bold text-white"
            style={{
              width: g.size,
              height: g.size,
              left: 0,
              top: 0,
              borderRadius: g.radius,
              transform: `translate(${x - half}px, ${y - half}px)${g.rotate ? ' rotate(45deg)' : ''}`,
              transition: inCapture ? 'none' : 'transform 220ms linear',
              background: meta.color,
              boxShadow: `0 0 0 2px ${ring}, 0 0 6px ${ring}88`,
              fontSize: meta.light ? 6 : 7,
              opacity: t.phase === 'done' ? 0.35 : kbActive ? 0.4 : 1,
              zIndex: 6,
            }}
            title={`${t.id} · ${meta.label} (${meta.edi}) · ${t.phase}${t.goldCarded ? ' · PA WAIVED' : ''}${t.mustHuman ? ' · always-reviewed' : ''}`}
          >
            <span style={{ transform: g.rotate ? 'rotate(-45deg)' : undefined }}>
              {t.goldCarded ? '★' : meta.letter}
            </span>
          </div>
        );
      })}
      {txns
        .filter((t) => t.kbPhase !== 'none')
        .map((t) => {
          const { x, y } = kbXY(t);
          return (
            <div
              key={`kb-${t.id}`}
              className="absolute flex items-center justify-center rounded-sm text-[6px] font-bold text-white"
              style={{
                width: 24,
                height: 13,
                left: 0,
                top: 0,
                transform: `translate(${x - 12}px, ${y - 6.5}px)`,
                transition: inCapture ? 'none' : 'transform 200ms linear',
                background: '#0e7490',
                boxShadow: '0 0 4px #0e749088',
                zIndex: 7,
              }}
              title={`${t.id} · ${t.kbReason} · ${t.kbPhase}`}
            >
              {t.kbReason === 'reject' ? 'REJ' : 'RFAI'}
            </div>
          );
        })}
    </>
  );
}

/** EDI gateways + the dashed X12 wire between them. */
export function GatewayNodes(): React.ReactElement {
  const ehr = PATH[0]?.stage.emr ?? 'Epic';
  const box = (label: string, sub: string, y: number): React.ReactElement => (
    <div
      className="absolute flex flex-col items-center justify-center rounded border-2 px-1 text-center"
      style={{
        left: cellX(GW_COL) + 5,
        top: y + 6,
        width: CELL_W - 10,
        height: CELL_H,
        borderColor: '#24427e',
        background: '#eaf2fb',
        zIndex: 2,
      }}
    >
      <span className="text-[9px] font-bold text-carbon-gray-90">{label}</span>
      <span className="mono text-[7px] text-carbon-gray-50">{sub}</span>
    </div>
  );
  return (
    <>
      <div
        className="absolute"
        style={{
          left: cellCX(GW_COL) - 1,
          top: laneY(1) + CELL_H + 6,
          width: 2,
          height: laneY(2) - (laneY(1) + CELL_H),
          borderLeft: '2px dashed #24427e',
        }}
      />
      <div
        className="absolute text-center text-[7px] font-semibold text-carbon-blue"
        style={{ left: cellX(GW_COL), top: laneY(1) + CELL_H + 8, width: CELL_W }}
      >
        X12 wire
      </div>
      {box('Provider GW', `${ehr} · Availity`, laneY(1))}
      {box('Payer GW', 'TA1/999/277CA', laneY(2))}
    </>
  );
}

/** EDI acknowledgment pulses stacked at the payer gateway. */
export function AckPulses({ s }: { s: SimState }): React.ReactElement {
  return (
    <>
      {s.acks.map((a, i) => (
        <div
          key={a.id}
          className="absolute rounded px-1 text-[8px] font-bold"
          style={{
            left: cellX(GW_COL) + CELL_W - 6,
            top: laneY(2) - i * 13,
            color: a.ok ? '#24a148' : '#b45309',
            background: a.ok ? '#defbe6' : '#fdf6dd',
            border: `1px solid ${a.ok ? '#24a148' : '#b45309'}`,
            zIndex: 7,
          }}
        >
          {a.label}
        </div>
      ))}
    </>
  );
}

/** The payer UM internal sub-lane tray (intake → … → notify; human steps flagged). */
export function SubLaneTray({ s }: { s: SimState }): React.ReactElement {
  const activeKeys = new Set(
    s.txns.filter((t) => t.phase === 'subflow').map((t) => t.steps[t.sub]?.key)
  );
  return (
    <>
      <div
        className="absolute"
        style={{
          left: cellCX(PAYER_OPS_COL) - 1,
          top: laneY(2) + CELL_H + 6,
          width: 2,
          height: TRAY_Y - (laneY(2) + CELL_H) - 6,
          background: '#24427e',
        }}
      />
      <div
        className="absolute text-[8px] font-semibold uppercase tracking-wide text-carbon-gray-50"
        style={{ left: cellX(PAYER_OPS_COL), top: TRAY_Y - 12 }}
      >
        Payer UM internal
      </div>
      {PAYER_SUBSTEPS.map((step, i) => {
        const active = activeKeys.has(step.key);
        const color = step.human ? '#b45309' : '#0e7490';
        return (
          <div
            key={step.key}
            className="absolute flex flex-col items-center justify-center rounded border px-0.5 text-center"
            style={{
              left: subCellX(i) + 3,
              top: TRAY_Y + 4,
              width: SUB_CELL_W - 6,
              height: TRAY_H - 8,
              borderColor: active ? color : '#e0e0e0',
              background: active ? (step.human ? '#fdf6dd' : '#e6f2f5') : '#fafafa',
              opacity: step.human ? 1 : 0.95,
            }}
          >
            <span
              className="mono text-[9px] font-bold"
              style={{ color: active ? color : '#8d8d8d' }}
            >
              {step.short}
            </span>
            <span className="text-[7px] leading-none text-carbon-gray-50">
              {step.human ? '👤' : 'agent'}
            </span>
          </div>
        );
      })}
    </>
  );
}
