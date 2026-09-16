'use client';
/**
 * LiveProcessFlowBoard — the OPERATIONAL process-flow console (client).
 *
 * A live simulation: transactions spawn on a clock and travel EHR → provider gateway → payer
 * gateway → payer internal; each gate fires against the REAL Twin-Ladder verdict; inside the payer
 * they walk the UM sub-process (intake → eligibility → nurse review → pend/RFI → MD review →
 * determination → notify — only the MD denies); the EDI gateways emit acks (TA1/999/277CA/278
 * resp); detections mint governed tickets with ticking SLA clocks. A MATURITY dial shifts how much
 * runs touchless vs human — honestly (adverse / high-dollar / novel cases always keep a human).
 *
 * Drives the deterministic `flowSim` engine via requestAnimationFrame. `?capture=1` disables the
 * loop and exposes window.__sim* step hooks for deterministic GIF capture.
 *
 * CLIENT-SAFE: imports only the barrel-free spine + engine + StatusBadge. No `@/lib/evidence`.
 */
import { useEffect, useRef } from 'react';
import { LANE_LABEL } from '@/lib/goldenThread/e2eFlow';
import {
  PATH,
  SIM_LANES,
  PAYER_SUBSTEPS,
  MATURITY_BANDS,
  RT_LEG_TICKS,
  KB_LEG_TICKS,
  maturityBand,
  throughputPerMin,
  touchlessPct,
  pendRate,
  slaAtRisk,
  pctWaived,
  ledgerIntact,
  spotlight,
  execScenarioCeiling,
  execEarnedCeiling,
  earnedEligibility,
  TXN_TYPE_META,
  type SimState,
  type Txn,
  type TxnType,
  type TxnTypeMeta,
  type Gate,
  type LedgerEntry,
  type NistFn,
} from '@/lib/goldenThread/flowSim';
import { NIST_COLOR } from '@/lib/goldenThread/nistMap';
import { slaRemaining, slaColor } from '@/lib/goldenThread/surveillanceMap';
import { getGlobalTick, type OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';
import StatusBadge from '@/components/ui/StatusBadge';

// ── Geometry ──────────────────────────────────────────────────────────────────────
const LABEL_W = 128;
const CELL_W = 76;
const CELL_H = 48;
const HEADER_H = 24;
const LANE_H = 58;
const GW_COL = 11;
const GRID_W = LABEL_W + (GW_COL + 1) * CELL_W;
const GRID_H = HEADER_H + SIM_LANES.length * LANE_H;
const SUB_CELL_W = 50;
const SUB_N = PAYER_SUBSTEPS.length;
const TRAY_Y = GRID_H + 10;
const TRAY_H = 52;
const TOTAL_H = TRAY_Y + TRAY_H + 6;

const cellX = (col: number): number => LABEL_W + col * CELL_W;
const cellCX = (col: number): number => cellX(col) + CELL_W / 2;
const laneY = (row: number): number => HEADER_H + row * LANE_H;
const laneCY = (row: number): number => laneY(row) + LANE_H / 2;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const PROV_GW = { x: cellCX(GW_COL), y: laneCY(1) };
const PAYER_GW = { x: cellCX(GW_COL), y: laneCY(2) };
const PAYER_OPS_COL = PATH.find((p) => p.stage.key === 'payer-ops')?.col ?? 5;
const PAS_COL = PATH.find((p) => p.stage.key === 'pas-submit')?.col ?? 4;
const GOLD_COL = PATH.find((p) => p.stage.key === 'gold-card')?.col ?? 2;
const CLAIM_COL = PATH.find((p) => p.stage.key === 'claim')?.col ?? 6;
const DTR_COL = PATH.find((p) => p.stage.key === 'dtr')?.col ?? 3;
const quad = (a: number, c: number, b: number, t: number): number =>
  (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;
const subCellX = (i: number): number => cellX(PAYER_OPS_COL) + i * SUB_CELL_W;
const subCellCX = (i: number): number => subCellX(i) + SUB_CELL_W / 2;
const TRAY_CY = TRAY_Y + TRAY_H / 2;

// Per-type token geometry — the real-world transaction mix reads by shape + color + letter.
const MIX_ORDER: TxnType[] = [
  'elig',
  'status',
  'pa',
  'claimP',
  'claimI',
  'claimD',
  'remit',
  'appeal',
];
function tokenGeom(meta: TxnTypeMeta): { size: number; radius: string; rotate: boolean } {
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
const GATE_COLOR: Record<Gate, string> = { pass: '#24a148', pend: '#b45309', deny: '#da1e28' };
const GATE_BG: Record<Gate, string> = { pass: '#defbe6', pend: '#fdf6dd', deny: '#fff1f1' };
const LANE_ACCENT: Record<string, string> = {
  emr: '#0f766e',
  'provider-agent': '#0e7490',
  payer: '#24427e',
  'payer-agent': '#5b3fa3',
  surveillance: '#b45309',
};

const PROOF_LABELS = [
  'Unproven — Human Assist',
  'Partly Proven — HITL',
  'Well Proven — HOTL',
  'Ironclad — Autonomous',
];
const AUTH_LABELS = [
  'Watch — no autonomous calls',
  'Advise — a human decides',
  'Act with sign-off',
  'Act on its own',
];
const PROOF_CODES = ['D0', 'D1', 'D2', 'D3']; // evidence-tier codes (proof)
const AUTH_CODES = ['A0', 'A1', 'A2', 'A3']; // authority-rung codes
const BEAM_COLOR = ['#8d8d8d', '#24427e', '#0f766e', '#24a148'];

/** The EXEC-consumable Twin-Ladder: two plain-English meters, the authority meter moving itself. */
function ExecTwinLadder({
  s,
  onGrant,
  onBreach,
}: {
  s: SimState;
  onGrant: () => void;
  onBreach: () => void;
}): React.ReactElement {
  const sp = spotlight(s);
  const ev = sp ? sp.evLevel : 0;
  const scenario = execScenarioCeiling(s); // what the fleet COULD earn at this maturity (the dial)
  const earned = s.earnedCeiling; // what it HAS earned + a human granted
  const effective = execEarnedCeiling(s); // min(earned, scenario) — what actually governs
  const elig = earnedEligibility(s);
  const revoked = s.lastRevokeTick >= 0 && s.tick - s.lastRevokeTick < 8;
  const lock: 'hold' | 'charge' | 'ready' | 'slam' = revoked
    ? 'slam'
    : elig.eligible
      ? 'charge'
      : elig.blockedByScenario
        ? 'ready'
        : 'hold';
  const holdNote =
    effective === 0 ? 'watch only · earning trust from zero' : 'earned · human-granted · stable';
  const lockMeta = {
    hold: {
      icon: effective === 0 ? '👁' : '🔒',
      label: effective === 0 ? 'Watching' : 'Holding',
      color: effective === 0 ? '#5c6675' : '#1f7a3d',
      note: holdNote,
    },
    charge: {
      icon: '🔓',
      label: 'Charging',
      color: '#a86b12',
      note: 'eligible — awaiting a human grant',
    },
    ready: {
      icon: '🔓',
      label: 'Ready',
      color: '#a86b12',
      note: 'gates met — raise the scenario dial to allow',
    },
    slam: {
      icon: '⚠',
      label: 'Slammed shut',
      color: '#b42318',
      note: 'breach → fail-closed revoke',
    },
  }[lock];
  const beam = revoked ? '#da1e28' : BEAM_COLOR[effective];
  const last = s.earnedEvents[0];
  const canGrant = elig.eligible;
  const canBreach = earned >= 2;

  const W = 720;
  const H = 202;
  const topY = 32;
  const rowH = 40;
  const rungH = 32;
  const rungW = 234;
  const leftX = 14;
  const rightX = W - 14 - rungW;
  const rungY = (i: number): number => topY + (3 - i) * rowH;
  const midY = (i: number): number => rungY(i) + rungH / 2;
  const hardLineY = (rungY(1) + rungY(2) + rungH) / 2; // between "Advise" (1) and "Act with sign-off" (2)
  const earnedLineY = rungY(effective) - 3; // the solid earned ceiling
  const scenarioLineY = rungY(scenario) - 3; // the ghosted scenario cap

  return (
    <div className="ed-card p-3" style={{ borderLeft: `3px solid ${lockMeta.color}` }}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
          Twin-Ladder — authority is <strong>earned</strong>, granted, and can be revoked
        </p>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold"
          style={{ color: '#fff', background: lockMeta.color }}
        >
          <span aria-hidden>{lockMeta.icon}</span> {lockMeta.label} · A{effective}{' '}
          <span className="font-medium opacity-90">— {lockMeta.note}</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxHeight: 220 }}>
        <text x={leftX} y={18} fontSize={12} fontWeight={700} fill="#525252">
          PROOF — how solid is the evidence?
        </text>
        <text x={rightX} y={18} fontSize={12} fontWeight={700} fill="#525252">
          WHAT THE MACHINE MAY DO
        </text>
        {[0, 1, 2, 3].map((i) => {
          const inEarned = i <= effective;
          const inScenario = i > effective && i <= scenario;
          const isTop = i === effective;
          const fill = isTop
            ? revoked
              ? '#fdeceb'
              : '#eaf7f1'
            : inEarned
              ? '#f3f7fc'
              : inScenario
                ? '#fdf6ec'
                : '#f6f6f6';
          const stroke = isTop ? beam : inScenario ? '#e5c07b' : '#e5e5e5';
          const chip = inEarned
            ? i >= 3
              ? '#24a148'
              : '#24427e'
            : inScenario
              ? '#d9a441'
              : '#d7dbda';
          const labelCol = inEarned ? '#161616' : inScenario ? '#9a6b16' : '#a8a8a8';
          return (
            <g key={i}>
              {/* PROOF rung */}
              <rect
                x={leftX}
                y={rungY(i)}
                width={rungW}
                height={rungH}
                rx={5}
                fill={i === ev ? '#e6f4f1' : '#f6f6f6'}
                stroke={i === ev ? '#0f766e' : '#e0e0e0'}
              />
              <rect
                x={leftX + 7}
                y={midY(i) - 9}
                width={26}
                height={18}
                rx={3}
                fill={i <= ev ? '#0f766e' : '#d7dbda'}
              />
              <text
                x={leftX + 20}
                y={midY(i) + 4}
                fontSize={11}
                fontWeight={700}
                fill="#fff"
                textAnchor="middle"
              >
                {PROOF_CODES[i]}
              </text>
              <text
                x={leftX + 40}
                y={midY(i) + 4}
                fontSize={11.5}
                fontWeight={i === ev ? 700 : 500}
                fill={i <= ev ? '#161616' : '#a8a8a8'}
              >
                {PROOF_LABELS[i]}
              </text>
              {/* AUTHORITY rung — earned (solid) vs scenario headroom (dashed ghost) */}
              <rect
                x={rightX}
                y={rungY(i)}
                width={rungW}
                height={rungH}
                rx={5}
                fill={fill}
                stroke={stroke}
                strokeWidth={isTop ? 2 : 1}
                strokeDasharray={inScenario ? '4 3' : undefined}
              />
              <rect x={rightX + 7} y={midY(i) - 9} width={26} height={18} rx={3} fill={chip} />
              <text
                x={rightX + 20}
                y={midY(i) + 4}
                fontSize={11}
                fontWeight={700}
                fill="#fff"
                textAnchor="middle"
              >
                {AUTH_CODES[i]}
              </text>
              <text
                x={rightX + 40}
                y={midY(i) + 4}
                fontSize={10.5}
                fontWeight={inEarned ? 700 : 500}
                fill={labelCol}
              >
                {AUTH_LABELS[i]}
              </text>
              {inScenario && (
                <text
                  x={rightX + rungW - 6}
                  y={midY(i) + 3}
                  fontSize={8}
                  fill="#b58a3a"
                  textAnchor="end"
                >
                  earn to unlock
                </text>
              )}
            </g>
          );
        })}
        {/* earned ceiling — solid; scenario cap — ghost */}
        <line
          x1={rightX - 4}
          y1={earnedLineY}
          x2={rightX + rungW + 4}
          y2={earnedLineY}
          stroke={lockMeta.color}
          strokeWidth={2.5}
        />
        <text
          x={rightX - 6}
          y={earnedLineY + 3}
          fontSize={8}
          fontWeight={700}
          fill={lockMeta.color}
          textAnchor="end"
        >
          earned
        </text>
        {scenario > effective && (
          <>
            <line
              x1={rightX - 4}
              y1={scenarioLineY}
              x2={rightX + rungW + 4}
              y2={scenarioLineY}
              stroke="#b58a3a"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
            <text
              x={rightX - 6}
              y={scenarioLineY + 3}
              fontSize={8}
              fontWeight={700}
              fill="#b58a3a"
              textAnchor="end"
            >
              scenario
            </text>
          </>
        )}
        {/* interlock beam — HOLDS at the earned ceiling; moves only on an earned event */}
        <line
          x1={leftX + rungW}
          y1={midY(ev)}
          x2={rightX}
          y2={midY(effective)}
          stroke={beam}
          strokeWidth={5}
          opacity={0.85}
        />
        <circle
          cx={leftX + rungW}
          cy={midY(ev)}
          r={7}
          fill="#0f766e"
          stroke="#fff"
          strokeWidth={2}
        />
        {revoked && (
          <circle
            cx={rightX}
            cy={midY(effective)}
            r={13}
            fill="none"
            stroke="#da1e28"
            strokeWidth={2}
            opacity={0.6}
          />
        )}
        <circle cx={rightX} cy={midY(effective)} r={7} fill={beam} stroke="#fff" strokeWidth={2} />
        {/* adverse hard-line */}
        <line
          x1={rightX - 3}
          y1={hardLineY}
          x2={rightX + rungW + 3}
          y2={hardLineY}
          stroke="#da1e28"
          strokeWidth={2}
          strokeDasharray="5 3"
        />
        <text
          x={rightX + rungW / 2}
          y={hardLineY - 4}
          fontSize={8.5}
          fontWeight={700}
          fill="#da1e28"
          textAnchor="middle"
        >
          adverse · high-dollar · novel → always a human
        </text>
      </svg>

      {/* Earned-authority console: the receipt, the distance to next rung, and the human grant */}
      <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
        {/* Receipts + revocation look-back */}
        <div
          className="rounded-md border px-2 py-1.5"
          style={{ borderColor: `${lockMeta.color}40`, background: '#faf9f6' }}
        >
          <p
            className="mb-1 text-[9px] font-bold uppercase tracking-wide"
            style={{ color: lockMeta.color }}
          >
            Last movement — every move is earned &amp; sealed
          </p>
          {last ? (
            <div className="text-[10px] text-carbon-gray-80">
              <span
                className="mono font-bold"
                style={{
                  color:
                    last.kind === 'revoke'
                      ? '#b42318'
                      : last.kind === 'grant'
                        ? '#1f7a3d'
                        : '#6f6f6f',
                }}
              >
                {last.kind === 'revoke'
                  ? '▼ REVOKE'
                  : last.kind === 'grant'
                    ? '▲ GRANT'
                    : '● PROVISIONAL'}{' '}
                A{last.from}→A{last.to}
              </span>{' '}
              <span>
                tick {last.tick} · by {last.by}
              </span>
              <p className="mt-0.5 leading-snug">{last.reason}</p>
              {s.earnedLookback > 0 && (
                <p className="mt-0.5 font-semibold" style={{ color: '#b42318' }}>
                  look-back: {s.earnedLookback} acts queued for re-review
                </p>
              )}
            </div>
          ) : (
            <p className="text-[10px] text-carbon-gray-50">no movement yet</p>
          )}
        </div>
        {/* Distance to the next rung — eligibility gates */}
        <div
          className="rounded-md border px-2 py-1.5"
          style={{ borderColor: '#24427e40', background: '#f7f9fc' }}
        >
          <p
            className="mb-1 text-[9px] font-bold uppercase tracking-wide"
            style={{ color: '#24427e' }}
          >
            Get to A{elig.nextRung} — {elig.gates.filter((g) => g.met).length}/{elig.gates.length}{' '}
            gates met{elig.blockedByScenario ? ' · raise scenario to allow' : ''}
          </p>
          <div className="flex flex-col gap-0.5">
            {elig.gates.map((g) => (
              <div
                key={g.label}
                className="flex items-center gap-1.5 text-[10px] text-carbon-gray-80"
              >
                <span aria-hidden style={{ color: g.met ? '#1f7a3d' : '#a86b12', fontWeight: 700 }}>
                  {g.met ? '✓' : '◐'}
                </span>
                <span className="font-semibold">{g.label}</span>
                <span className="mono text-[9px] text-carbon-gray-50">{g.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* The human grant — promotion is NEVER automatic; revocation IS */}
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onGrant}
          disabled={!canGrant}
          style={{
            background: canGrant ? '#1f7a3d' : '#e3e0d8',
            color: canGrant ? '#fff' : '#9a9a9a',
            cursor: canGrant ? 'pointer' : 'not-allowed',
            border: 'none',
            borderRadius: 8,
            padding: '6px 14px',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          ✍ Ratify promotion A{earned}→A{elig.nextRung}
          {canGrant ? '' : ' — not yet eligible'}
        </button>
        <button
          type="button"
          onClick={onBreach}
          disabled={!canBreach}
          title="Presenter control: trip a §1557 breach to show fail-closed revocation"
          style={{
            background: 'transparent',
            color: canBreach ? '#b42318' : '#c4c4c4',
            border: `1px solid ${canBreach ? '#b4231840' : '#e5e5e5'}`,
            cursor: canBreach ? 'pointer' : 'not-allowed',
            borderRadius: 8,
            padding: '5px 12px',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          ⚡ Simulate breach → revoke
        </button>
      </div>
      <p className="mt-1 text-center text-[10px] text-carbon-gray-50">
        Trust starts at <strong>A0 — watch only</strong>. The machine proves it agrees with humans
        in shadow, and <strong>earns</strong> its way up: A0→A1 advise → A2 sign-off → A3
        autonomous. It may act only up to the <strong>earned</strong> ceiling (solid); the{' '}
        <strong>scenario</strong> dial sets what it <em>could</em> earn. A person{' '}
        <strong>grants</strong> each rung; a §1557 or integrity breach{' '}
        <strong>revokes it automatically</strong>. Adverse always goes to a human.
      </p>
    </div>
  );
}

function FlowArcs({ txns }: { txns: Txn[] }): React.ReactElement {
  const mid = (GOLD_COL + CLAIM_COL) / 2;
  const goldPath = `M ${cellCX(GOLD_COL)} ${laneCY(3)} Q ${cellCX(mid)} ${BYPASS_Y - 6} ${cellCX(CLAIM_COL)} ${laneCY(2)}`;
  const gcActive = txns.some((t) => t.goldCarded); // an autonomous waiver only fires once A3 is EARNED
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
        {gcActive
          ? 'Gold-card bypass · PA WAIVED · no human'
          : 'Gold-card bypass · earned at A3 (now: routes to UM)'}
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

function subIndexInTray(t: Txn): number {
  const key = t.steps[t.sub]?.key;
  const i = PAYER_SUBSTEPS.findIndex((s) => s.key === key);
  return i < 0 ? 0 : i;
}

const BYPASS_Y = laneY(2) - 20; // gold-card express arc apex, above the payer lane
function txnXY(t: Txn): { x: number; y: number } {
  if (t.kbPhase !== 'none') return { x: cellCX(PATH[t.idx].col), y: laneCY(PATH[t.idx].row) }; // main token parks; packet moves
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
    // gold-carded token flies the bypass arc OVER the payer-ops sub-lane straight to claim
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

// Kickback packet position — travels payer side → provider lane → back.
function kbXY(t: Txn): { x: number; y: number } {
  const payerCol = t.kbReason === 'reject' ? CLAIM_COL : PAYER_OPS_COL;
  const P = { x: cellCX(payerCol), y: laneCY(2) };
  const Q = { x: cellCX(DTR_COL), y: laneCY(1) };
  const p = Math.min(1, Math.max(0, (getGlobalTick() - t.kbStart) / KB_LEG_TICKS));
  if (t.kbPhase === 'toProvider') return { x: lerp(P.x, Q.x, p), y: lerp(P.y, Q.y, p) };
  if (t.kbPhase === 'toPayer') return { x: lerp(Q.x, P.x, p), y: lerp(Q.y, P.y, p) };
  return Q; // atProvider
}

export interface LiveProcessFlowBoardProps {
  op: OperatingSim;
  operatorName?: string;
}

export function LiveProcessFlowBoard({
  op,
  operatorName = 'you',
}: LiveProcessFlowBoardProps): React.ReactElement {
  const s = op.sim;
  const inCapture = op.inCapture;
  const anySub = s.txns.some((t) => t.phase === 'subflow');

  return (
    <div className="space-y-3">
      <ExecTwinLadder s={s} onGrant={op.grantPromotion} onBreach={op.simulateBreach} />

      <MaturityDial value={op.maturity} onChange={op.changeMaturity} />

      <TransportControls
        running={op.running}
        speed={op.speed}
        capture={inCapture}
        onPlay={op.play}
        onStep={op.step}
        onSpeed={op.setSpeed}
        onSpawn={op.spawn}
        onBatch={op.batch}
        onReset={op.reset}
      />

      <CounterStrip s={s} />
      <TxnMixLegend s={s} />

      <div className="overflow-x-auto rounded-lg border border-carbon-gray-20 bg-white">
        <div className="relative" style={{ width: GRID_W, height: TOTAL_H }}>
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
            return (
              <div
                key={p.stage.key}
                className="absolute rounded border bg-white px-1.5 py-1"
                style={{
                  left: cellX(p.col) + 5,
                  top: laneY(p.row) + 6,
                  width: CELL_W - 10,
                  height: CELL_H,
                  borderColor: gateHere ? GATE_COLOR[gateHere] : inSub ? '#24427e' : '#e0e0e0',
                  background: gateHere ? GATE_BG[gateHere] : inSub ? '#eef4fb' : '#fff',
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
          {/* gateways + EDI wire */}
          <GatewayNodes />
          <AckPulses s={s} />
          {/* payer UM sub-lane tray */}
          {anySub && <SubLaneTray s={s} />}
          {/* gold-card bypass arc + kickback return paths */}
          <FlowArcs txns={s.txns} />
          {/* moving tokens */}
          {s.txns.map((t) => {
            const { x, y } = txnXY(t);
            const meta = TXN_TYPE_META[t.type];
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
          {/* kickback request packets (277-RFAI / reject → provider, then back) */}
          {s.txns
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
        </div>
      </div>
      <LedgerStrip s={s} />

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <LiveTicketQueue
          s={s}
          operatorName={operatorName}
          onGrab={(k) => op.grab(k, operatorName)}
        />
        <EventTicker s={s} />
      </div>

      <p className="text-[10px] italic text-carbon-gray-40">
        Prototype on seed data · mock channel, not transmitted. Transactions cross the real EDI
        topology (EHR → provider gateway → payer gateway) with acknowledgments (TA1/999/277CA/278
        resp); gate colors read from the real Twin-Ladder verdict; only the Medical Director issues
        a deny. An auth is <em>pended</em> (not &ldquo;suspended&rdquo; — that is a claims/PI
        payment-hold, 42 CFR 455.23). SLA clocks are time-compressed for the demo.
      </p>
    </div>
  );
}

function MaturityDial({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}): React.ReactElement {
  const band = maturityBand(value / 100);
  return (
    <div className="ed-card p-3" style={{ borderLeft: '3px solid #24427e' }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
            Trust maturity — agents earn autonomy
          </p>
          <p className="text-lg">
            <span className="font-semibold">{band.label}</span>
            <span className="mono ml-2 rounded bg-carbon-gray-10 px-1.5 py-0.5 text-[11px] text-carbon-gray-70">
              ceiling {band.ceiling}
            </span>
          </p>
        </div>
        <p className="max-w-sm text-[10px] text-carbon-gray-50">
          Drag it up: touchless auto-approval climbs, pends &amp; MD reviews fall. Adverse,
          high-dollar &amp; novel cases are
          <strong> always human-reviewed</strong> — the arc never claims 100%.
        </p>
      </div>
      <input
        aria-label="Trust maturity"
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-carbon-blue"
      />
      <div className="mt-0.5 flex justify-between text-[9px] font-semibold uppercase tracking-wide text-carbon-gray-40">
        {MATURITY_BANDS.map((b) => (
          <span key={b.key}>{b.label}</span>
        ))}
      </div>
    </div>
  );
}

function activeGateAt(s: SimState, idx: number): Gate | undefined {
  for (const t of s.txns) {
    if (t.idx === idx && (t.phase === 'gate' || t.phase === 'held' || t.phase === 'denied')) {
      const g = t.phase === 'denied' ? 'deny' : t.gates[idx];
      if (g) return g;
    }
  }
  return undefined;
}

function GatewayNodes(): React.ReactElement {
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
      }}
    >
      <span className="text-[9px] font-bold text-carbon-gray-90">{label}</span>
      <span className="mono text-[7px] text-carbon-gray-50">{sub}</span>
    </div>
  );
  return (
    <>
      {/* dashed EDI wire between the two gateways */}
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

function AckPulses({ s }: { s: SimState }): React.ReactElement {
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

function SubLaneTray({ s }: { s: SimState }): React.ReactElement {
  const activeKeys = new Set(
    s.txns.filter((t) => t.phase === 'subflow').map((t) => t.steps[t.sub]?.key)
  );
  return (
    <>
      {/* connector from payer-ops down to the tray */}
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

function TransportControls(props: {
  running: boolean;
  speed: number;
  capture: boolean;
  onPlay: () => void;
  onStep: () => void;
  onSpeed: (n: number) => void;
  onSpawn: () => void;
  onBatch: () => void;
  onReset: () => void;
}): React.ReactElement {
  const { running, speed, capture, onPlay, onStep, onSpeed, onSpawn, onBatch, onReset } = props;
  return (
    <div className="ed-card flex flex-wrap items-center gap-2 p-2">
      <button
        type="button"
        onClick={onPlay}
        className="rounded bg-carbon-blue px-3 py-1 text-xs font-semibold text-white hover:bg-carbon-blue-hover"
      >
        {running ? '❚❚ Pause' : '▶ Play'}
      </button>
      <button
        type="button"
        onClick={onStep}
        className="rounded border border-carbon-gray-30 px-2 py-1 text-xs text-carbon-gray-70 hover:bg-carbon-gray-10"
      >
        ⏭ Step
      </button>
      <div className="flex items-center gap-1">
        {[0.5, 1, 2, 4].map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => onSpeed(x)}
            className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${speed === x ? 'bg-carbon-gray-90 text-white' : 'border border-carbon-gray-30 text-carbon-gray-70'}`}
          >
            {x}×
          </button>
        ))}
      </div>
      <span className="mx-1 h-4 w-px bg-carbon-gray-20" />
      <button
        type="button"
        onClick={onSpawn}
        className="rounded border border-[#0f766e] px-2 py-1 text-[11px] font-semibold text-[#0f766e] hover:bg-[#e6f4f1]"
      >
        + 278 prior-auth
      </button>
      <button
        type="button"
        onClick={onBatch}
        className="rounded border border-[#5b3fa3] px-2 py-1 text-[11px] font-semibold text-[#5b3fa3] hover:bg-[#f0ecfa]"
      >
        ⇉ Run 837 batch
      </button>
      <button
        type="button"
        onClick={onReset}
        className="rounded border border-carbon-gray-30 px-2 py-1 text-[11px] text-carbon-gray-60 hover:bg-carbon-gray-10"
      >
        ↺ Reset
      </button>
      {capture && <span className="mono text-[10px] text-carbon-gray-40">capture mode</span>}
    </div>
  );
}

function MixToken({ type }: { type: TxnType }): React.ReactElement {
  const meta = TXN_TYPE_META[type];
  const g = tokenGeom(meta);
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center font-bold text-white"
      style={{
        width: g.size,
        height: g.size,
        borderRadius: g.radius,
        background: meta.color,
        fontSize: meta.light ? 6 : 7,
        transform: g.rotate ? 'rotate(45deg)' : undefined,
      }}
    >
      <span style={{ transform: g.rotate ? 'rotate(-45deg)' : undefined }}>{meta.letter}</span>
    </span>
  );
}

function TxnMixLegend({ s }: { s: SimState }): React.ReactElement {
  const total = MIX_ORDER.reduce((a, t) => a + s.typeCounts[t], 0);
  return (
    <div className="ed-card p-2">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
          Transaction mix · real-world EDI · evidence impact
        </p>
        <span className="mono text-[9px] text-carbon-gray-40">{total} completed</span>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {MIX_ORDER.map((t) => {
          const m = TXN_TYPE_META[t];
          const n = s.typeCounts[t];
          const pct = total ? Math.round((n / total) * 100) : 0;
          return (
            <div key={t} className="flex items-center gap-1.5" title={`${m.label} (${m.edi})`}>
              <MixToken type={t} />
              <span className="text-[10px] text-carbon-gray-80">
                <span className="font-semibold">{m.label}</span>{' '}
                <span className="mono text-carbon-gray-40">{m.edi}</span>
              </span>
              <span className="num text-[11px] font-bold text-carbon-gray-90">{n}</span>
              <span className="mono text-[9px] text-carbon-gray-40">{pct}%</span>
            </div>
          );
        })}
      </div>
      <p className="mt-1 text-[8px] italic text-carbon-gray-40">
        Real-time inbound: eligibility (270/271), claim-status (276/277), prior-auth (278), appeals.
        837 claims arrive in batch runs; 835 remittance pulses on the payment cycle — neither is
        real-time. Each type routes through the stages that write ITS evidence-ledger entries, so
        the mix drives what the record captures.
      </p>
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

const EVENT_DOT: Record<string, string> = {
  pass: '#24a148',
  pend: '#b45309',
  deny: '#da1e28',
  ticket: '#5b3fa3',
  edi: '#0e7490',
  info: '#8d8d8d',
};
function tickToClock(tick: number): string {
  const d = new Date(Date.UTC(2026, 8, 14, 13, 0, 0) + tick * 250);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
}
function EventTicker({ s }: { s: SimState }): React.ReactElement {
  return (
    <div className="ed-card p-3">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
        Live event feed
      </p>
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {s.events.map((e, i) => (
          <div key={i} className="flex items-start gap-1.5 text-[10px]">
            <span
              className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: EVENT_DOT[e.kind] }}
            />
            <span className="mono text-carbon-gray-40">{tickToClock(e.tick)}</span>
            <span className="text-carbon-gray-80">{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
function LedgerStrip({ s }: { s: SimState }): React.ReactElement {
  const scrollRef = useRef<HTMLDivElement>(null);
  const intact = ledgerIntact(s);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  });
  const shown = s.ledger.slice(-160);
  return (
    <div className="rounded" style={{ background: '#0b1a2b' }}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
        <span className="rounded bg-[#13324f] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#9fc2e0]">
          Shared Evidence Ledger · hash-chained · append-only · agentic activity record
        </span>
        <span
          className="mono text-[10px] font-semibold"
          style={{ color: intact ? '#54d98c' : '#ff8a8a' }}
        >
          {intact ? '● seal intact' : '● seal BROKEN'} · {s.ledger.length} entries · head{' '}
          {s.chainHead.toString(16).slice(-6)}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[8px] text-[#9fc2e0]">
          NIST AI-RMF
          {(['GOVERN', 'MAP', 'MEASURE', 'MANAGE'] as NistFn[]).map((fn) => (
            <span key={fn} className="flex items-center gap-0.5">
              <span
                className="inline-block h-2 w-2 rounded-sm"
                style={{ background: NIST_COLOR[fn] }}
              />
              {fn}
            </span>
          ))}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="flex items-end gap-[3px] overflow-x-auto px-3 pb-2 pt-3"
        style={{ scrollBehavior: 'auto' }}
      >
        {shown.length === 0 && (
          <span className="py-2 text-[10px] italic text-[#9fc2e0]">
            the evidence record builds as transactions flow — press Play
          </span>
        )}
        {shown.map((e: LedgerEntry) => {
          const dashed =
            e.decision === 'PEND' || e.decision.includes('RFAI') || e.decision.includes('277CA');
          return (
            <div
              key={e.seq}
              className="relative shrink-0 rounded-sm"
              title={`#${e.seq}  ${e.actor} · ${e.fired} ${e.version}\nevidence ${e.tier} → authority ${e.rung} · ${e.decision}\nNIST AI-RMF: ${e.nistFn} · ${e.nistChar} · oversight ${e.oversight}\n${e.reproducible ? 'reproducible' : 'pending'} · hash ${e.hash.toString(16)}  (AI-RMF aligned, illustrative — not certification)`}
              style={{
                width: 11,
                height: 22,
                background: NIST_COLOR[e.nistFn],
                border:
                  e.decision === 'DENY'
                    ? '1px solid #ff5b5b'
                    : dashed
                      ? '1px dashed #ffd27a'
                      : '1px solid transparent',
                boxShadow: e.human ? 'inset 0 0 0 1.5px rgba(255,255,255,.75)' : 'none',
              }}
            >
              {e.seq % 10 === 0 && (
                <span className="absolute -top-3 left-0 text-[6px] text-[#7fa8c9]">{e.seq}</span>
              )}
            </div>
          );
        })}
      </div>
      <p className="px-3 pb-1 text-[8px] italic text-[#6f93b3]">
        Every agent/human act appends a sealed, hash-chained entry — actor · what fired + version ·
        evidence tier→rung · decision · NIST AI-RMF function + trustworthiness characteristic +
        human-oversight mode (hover a block). Hollow-ring = agent, solid-ring = human-touched.
        Hash-chained integrity check (illustrative): any naive edit to a sealed field breaks the
        chain on re-read. NIST fields show <em>alignment</em> — illustrative, not a conformance
        assessment; NIST does not certify AI systems. Subcategory conformance lives on the NIST
        AI-RMF tab.
      </p>
    </div>
  );
}

// slaRemaining + slaColor are single-sourced in surveillanceMap (imported above) so this flow board,
// the Reconciliation board, Surveillance, and Operations all read the identical time-left projection
// (slaHours × TICKS_PER_HOUR, with a real PAST DUE) — not a fixed 120-tick span decoupled from hours.
const SEV_VARIANT: Record<
  string,
  'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple'
> = { critical: 'danger', warning: 'warning', action: 'info', info: 'neutral' };
function LiveTicketQueue({
  s,
  operatorName,
  onGrab,
}: {
  s: SimState;
  operatorName: string;
  onGrab: (key: string) => void;
}): React.ReactElement {
  return (
    <div className="ed-card p-3">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
          Live ticket queue · SIU / PI / UM work-basket
        </p>
        <span className="mono text-[10px] text-carbon-gray-40">{s.tickets.length} open</span>
      </div>
      <div className="max-h-64 space-y-1.5 overflow-y-auto">
        {s.tickets.length === 0 && (
          <p className="text-[10px] italic text-carbon-gray-40">
            no tickets yet — detections mint them as transactions flow
          </p>
        )}
        {s.tickets.map((t) => {
          const sla = slaRemaining(s.tick, t.bornTick, t.slaHours);
          return (
            <div key={t.key} className="rounded border border-carbon-gray-20 p-1.5">
              <div className="flex items-center justify-between gap-1">
                <span className="mono text-[10px] font-semibold text-carbon-gray-80">
                  {t.ref} · {t.algorithm}
                </span>
                <StatusBadge
                  label={t.severity}
                  variant={SEV_VARIANT[t.severity] ?? 'neutral'}
                  size="sm"
                />
              </div>
              <p className="truncate text-[10px] text-carbon-gray-70">{t.title}</p>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="mono text-[9px] text-carbon-gray-50">
                  {t.operator} · ${t.exposureUsd.toLocaleString()} · aging {s.tick - t.bornTick}t
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="mono text-[10px] font-bold" style={{ color: slaColor(sla.pct) }}>
                    SLA {sla.label}
                  </span>
                  {t.status === 'New' ? (
                    <button
                      type="button"
                      onClick={() => onGrab(t.key)}
                      className="rounded bg-carbon-blue px-1.5 py-0.5 text-[9px] font-semibold text-white hover:bg-carbon-blue-hover"
                    >
                      Grab
                    </button>
                  ) : (
                    <span className="rounded bg-carbon-green-light px-1.5 py-0.5 text-[9px] font-semibold text-carbon-green">
                      Assigned · {t.assignedTo === operatorName ? 'you' : t.assignedTo}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
