'use client';
/**
 * SurveillanceConsole — the operational surveillance layer over the ONE shared sim, and the FRONT of a
 * governed pipeline: a detection is a work item that enters a NAMED seat queue under an SLA, is claimed
 * by a named person under segregation of duties, and every routing hop is SEALED to the ledger. The
 * workbench is reachable only THROUGH that queue (route → claim → open).
 *
 * Dispositions are PROJECTED from real ticket state (never fabricated), so this screen can never
 * disagree with the Operations queue about the same key. Credible-fraud SIU detections refer OUT to the
 * State Medicaid agency / MFCU under 42 CFR 455.23 — a sealed human referral, not a caption.
 *
 * CLIENT-SAFE: shared sim + library data + presentational helpers only. No `@/lib/evidence` barrel.
 */
import { useState } from 'react';
import {
  ALGORITHMS,
  CATEGORIES,
  LANE_LABEL,
  TECHNIQUE_LABEL,
  type Algorithm,
} from '@/lib/surveillance/library';
import {
  TICKETS as SEED_TICKETS,
  ROLE_SIDE,
  OPERATORS,
  type OpsTicket,
  type OpsRole,
} from '@/lib/goldenThread/e2eFlow';
import { displayAuthority, type SimState, type LiveTicket } from '@/lib/goldenThread/flowSim';
import { TICKS_PER_HOUR } from '@/lib/goldenThread/workflow';
import { nistForAlgorithm } from '@/lib/goldenThread/nistMap';
import {
  libraryIdForAlgorithm,
  isWiredLibraryId,
  detectionRoute,
  DISPOSITION_LABEL,
  NOT_CLAIMING,
  type Disposition,
  type Routing,
} from '@/lib/goldenThread/surveillanceMap';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';
import { TwinLadderCodes, NistChips } from '@/components/goldenThread/flow/opsShared';
import StatusBadge from '@/components/ui/StatusBadge';

type Side = 'payer' | 'provider' | 'neutral';
type Variant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';
// 'action' is a PRIORITY tier (not a verb / CTA) — label it as one and give it a color that outranks 'info'.
const SEV_VARIANT: Record<OpsTicket['severity'], Variant> = {
  critical: 'danger',
  warning: 'warning',
  action: 'purple',
  info: 'neutral',
};
const SEV_LABEL: Record<OpsTicket['severity'], string> = {
  critical: 'critical',
  warning: 'warning',
  action: 'priority',
  info: 'info',
};
const DISP_COLOR: Record<Disposition, string> = {
  detected: '#8d8d8d',
  routed: '#24427e',
  assigned: '#b45309',
  'action-proposed': '#24a148',
  cleared: '#8d8d8d',
};
const seedByRef = (ref: string): OpsTicket | undefined => SEED_TICKETS.find((t) => t.id === ref);

export interface SurveillanceConsoleProps {
  op: OperatingSim;
  onOpenTicket?: (seedTicketId: string, side: Side, liveKey?: string) => void;
}

/** Disposition PROJECTED from real ticket state — the single source of truth (matches Operations). */
function dispositionOf(t: LiveTicket): Disposition {
  if (t.status === 'Closed') return t.disposition === 'cleared' ? 'cleared' : 'action-proposed';
  if (t.status === 'Proposed') return 'action-proposed';
  if (t.status === 'Assigned') return 'assigned';
  if (t.routedSeal !== undefined) return 'routed';
  return 'detected';
}

/** SLA remaining, single-sourced with the workflow/Operations window (slaHours × TICKS_PER_HOUR ticks). */
function slaRemaining(
  s: SimState,
  bornTick: number,
  slaHours: number
): { pct: number; label: string } {
  const span = Math.max(1, slaHours * TICKS_PER_HOUR);
  const pct = Math.max(0, 1 - (s.tick - bornTick) / span);
  if (pct <= 0) return { pct: 0, label: 'PAST DUE' };
  const remH = slaHours * pct;
  const hh = Math.floor(remH);
  const mm = Math.floor((remH - hh) * 60);
  return { pct, label: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` };
}
const slaColor = (pct: number): string =>
  pct > 0.5 ? '#24a148' : pct > 0.2 ? '#b45309' : '#da1e28';

export function SurveillanceConsole({
  op,
  onOpenTicket,
}: SurveillanceConsoleProps): React.ReactElement {
  const s = op.sim;
  const [notClaimingOpen, setNotClaimingOpen] = useState(false);

  // Live detections = the OPEN governed tickets the run has minted, joined to the seed narrative.
  const detections = s.tickets
    .map((t) => ({ t, seed: seedByRef(t.ref) }))
    .filter((d): d is { t: LiveTicket; seed: OpsTicket } => !!d.seed && d.t.status !== 'Closed');
  const hitCount: Record<string, number> = {};
  for (const d of detections)
    hitCount[libraryIdForAlgorithm(d.seed.algorithm)] =
      (hitCount[libraryIdForAlgorithm(d.seed.algorithm)] ?? 0) + 1;
  const wiredCount = ALGORITHMS.filter((a) => isWiredLibraryId(a.id)).length;

  // Queue health — projected from real state (the SIU-chief's "how big is my backlog / what's breaching").
  const disp = detections.map((d) => dispositionOf(d.t));
  const unrouted = disp.filter((x) => x === 'detected').length;
  const inQueue = disp.filter((x) => x === 'routed').length;
  const claimed = disp.filter((x) => x === 'assigned').length;
  const working = disp.filter((x) => x === 'action-proposed').length;
  const clearedReal = s.tickets.filter(
    (t) => t.status === 'Closed' && t.disposition === 'cleared'
  ).length;
  const referredOut = detections.filter((d) => d.t.referSeal !== undefined).length;
  const slas = detections.map((d) => slaRemaining(s, d.t.bornTick, d.t.slaHours).pct);
  const pastSla = slas.filter((p) => p <= 0).length;
  const aging = slas.filter((p) => p > 0 && p < 0.5).length;

  const byCat = Object.keys(CATEGORIES)
    .map(Number)
    .map((cat) => ({ cat, algos: ALGORITHMS.filter((a) => a.cat === cat) }));

  return (
    <div className="space-y-4">
      {/* Transport + honesty */}
      <div className="ed-card flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={op.play}
            className="rounded bg-carbon-blue px-3 py-1 text-xs font-semibold text-white hover:bg-carbon-blue-hover"
          >
            {op.running ? '❚❚ Pause run' : '▶ Play surveillance run'}
          </button>
          <button
            type="button"
            onClick={op.step}
            className="rounded border border-carbon-gray-30 px-2 py-1 text-xs text-carbon-gray-70 hover:bg-carbon-gray-10"
          >
            ⏭ Step
          </button>
          <span className="mono text-[11px] text-carbon-gray-60">
            {detections.length} live detections · tick {s.tick}
          </span>
        </div>
        <span className="rounded border border-carbon-yellow bg-carbon-yellow-light px-2 py-0.5 text-[10px] text-[#b45309]">
          Illustrative event cadence — production detectors run as scheduled batch / near-real-time
          analytics
        </span>
      </div>

      {/* Queue health — the governed backlog, projected from real ticket state */}
      <div className="ed-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold text-carbon-gray-90">
            Queue health · governed backlog
          </p>
          <span className="text-[9px] text-carbon-gray-40">
            projected from live ticket state · matches Operations
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {(
            [
              {
                label: 'Unrouted',
                value: unrouted,
                color: '#8d8d8d',
                hint: 'detected, awaiting routing',
              },
              { label: 'In queue', value: inQueue, color: '#24427e', hint: 'routed · unassigned' },
              {
                label: 'Claimed',
                value: claimed,
                color: '#b45309',
                hint: 'grabbed by a named analyst',
              },
              {
                label: 'Action proposed',
                value: working,
                color: '#24a148',
                hint: 'pending human release',
              },
              {
                label: 'Aging (<50%)',
                value: aging,
                color: '#b45309',
                hint: 'SLA window past halfway',
              },
              { label: 'Past SLA', value: pastSla, color: '#da1e28', hint: 'breached the clock' },
              {
                label: 'Referred out',
                value: referredOut,
                color: '#6929c4',
                hint: '455.23 → State / MFCU',
              },
            ] as const
          ).map((m) => (
            <div key={m.label} className="rounded border border-carbon-gray-20 p-2" title={m.hint}>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-carbon-gray-50">
                {m.label}
              </p>
              <p className="num text-lg" style={{ color: m.color }}>
                {m.value}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[9px] italic text-carbon-gray-40">
          Segregation of duties: investigative (SIU / FWA) and clinical (medical-necessity) are
          DIFFERENT authorities — a detection is routed to one, never both. Credible fraud refers
          OUT to the State (455.23); the MCO acts under 438.608(a). Cleared — not FWA:{' '}
          <span className="font-semibold not-italic">{clearedReal}</span> (real human closures
          only).
        </p>
      </div>

      {/* Honesty panel */}
      <div className="rounded-lg border border-carbon-gray-20 bg-carbon-gray-10 p-3">
        <button
          type="button"
          onClick={() => setNotClaimingOpen((o) => !o)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-[11px] font-semibold uppercase tracking-wide text-carbon-gray-70">
            What this console is NOT claiming
          </span>
          <span className="mono text-[11px] text-carbon-gray-50">
            {notClaimingOpen ? '▾' : '▸ show'}
          </span>
        </button>
        {notClaimingOpen && (
          <ul className="mt-1.5 space-y-1">
            {NOT_CLAIMING.map((line) => (
              <li key={line} className="flex gap-1.5 text-[10px] text-carbon-gray-70">
                <span className="text-carbon-gray-40">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            { label: 'Catalog detectors', value: String(ALGORITHMS.length), color: '#24427e' },
            { label: 'Scripted (narrative)', value: String(wiredCount), color: '#0f766e' },
            { label: 'Flagged detections', value: String(detections.length), color: '#5b3fa3' },
            { label: 'Sealed records', value: String(s.ledgerSeq), color: '#b45309' },
          ] as const
        ).map((tile) => (
          <div key={tile.label} className="ed-card p-2">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-carbon-gray-50">
              {tile.label}
            </p>
            <p className="num text-xl" style={{ color: tile.color }}>
              {tile.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* Detector library board */}
        <div className="ed-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold text-carbon-gray-90">
              Program-integrity library · {ALGORITHMS.length} detectors
            </p>
            <span className="flex items-center gap-2 text-[9px]">
              <span className="flex items-center gap-1">
                <span
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ background: '#0f766e' }}
                />
                scripted narrative
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm border border-carbon-gray-30 bg-carbon-gray-10" />
                catalog reference
              </span>
            </span>
          </div>
          <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
            {byCat.map(({ cat, algos }) => (
              <div key={cat}>
                <p className="text-[9px] font-semibold uppercase tracking-wide text-carbon-gray-50">
                  {cat}. {CATEGORIES[cat]}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {algos.map((a) => (
                    <DetectorChip
                      key={a.id}
                      a={a}
                      wired={isWiredLibraryId(a.id)}
                      hits={hitCount[a.id] ?? 0}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[8px] italic text-carbon-gray-40">
            Techniques: R = rules/edits (prepay) · S = statistical outlier (batch) · G = graph
            analytics (batch) · ML = scored (scheduled). Max rung is the ceiling the interlock
            permits; adverse lanes stay human-gated.
          </p>
        </div>

        {/* Live detection feed — each card carries the governed route→claim→open lifecycle */}
        <div className="ed-card p-3">
          <p className="mb-2 text-[11px] font-semibold text-carbon-gray-90">
            Live detections · route → claim → open
          </p>
          <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
            {detections.length === 0 && (
              <p className="text-[11px] italic text-carbon-gray-40">
                press Play — wired detectors raise governed detections as the run proceeds
              </p>
            )}
            {detections.map(({ t, seed }) => (
              <DetectionCard
                key={t.key}
                op={op}
                s={s}
                t={t}
                seed={seed}
                onOpenTicket={onOpenTicket}
              />
            ))}
          </div>
          <p className="mt-2 text-[8px] italic text-carbon-gray-40">
            Lifecycle: detected → <span className="font-semibold">Route to queue</span> (sealed
            routing event) → <span className="font-semibold">Claim</span> (a named analyst grabs it)
            → <span className="font-semibold">Open</span> in the workbench → action proposed
            (pending human release). The queue lives on the Operations tab; this is the sealed
            hand-off into it. Nothing is transmitted (mock channel).
          </p>
        </div>
      </div>
    </div>
  );
}

function DetectionCard({
  op,
  s,
  t,
  seed,
  onOpenTicket,
}: {
  op: OperatingSim;
  s: SimState;
  t: LiveTicket;
  seed: OpsTicket;
  onOpenTicket?: (seedTicketId: string, side: Side, liveKey?: string) => void;
}): React.ReactElement {
  const libId = libraryIdForAlgorithm(seed.algorithm);
  const route: Routing = detectionRoute(seed.role, laneForVerdict(seed), libId);
  const disp = dispositionOf(t);
  const spec = nistForAlgorithm(seed.algorithm);
  const da = displayAuthority(seed.verdict.permittedRung, seed.verdict.requiresHuman, s);
  const role = seed.role as OpsRole;
  const owner = t.assignedTo ?? OPERATORS[role] ?? route.seat;
  const sla = slaRemaining(s, t.bornTick, t.slaHours);
  const isSiu = !!route.terminal;

  return (
    <div
      className="rounded border border-carbon-gray-20 p-2"
      style={{ opacity: disp === 'cleared' ? 0.72 : 1 }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="mono text-[10px] font-semibold text-carbon-gray-80">
          {t.key} · {libId}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="mono text-[9px] font-bold"
            style={{ color: slaColor(sla.pct) }}
            title="SLA remaining (illustrative clock)"
          >
            SLA {sla.label}
          </span>
          <StatusBadge
            label={SEV_LABEL[seed.severity]}
            variant={SEV_VARIANT[seed.severity]}
            size="sm"
          />
        </span>
      </div>
      <div className="flex items-center gap-1">
        <p className="truncate text-[10px] text-carbon-gray-70">{seed.title}</p>
        <span
          className="shrink-0 rounded bg-carbon-gray-10 px-1 text-[8px] font-semibold uppercase text-carbon-gray-50"
          title="Scripted seed narrative — illustrative, not a live model output"
        >
          scripted
        </span>
      </div>
      <div className="mt-1">
        <TwinLadderCodes
          tier={seed.verdict.evidenceTier}
          rung={da.capability}
          human={seed.verdict.requiresHuman}
          capped={da.capped}
          now={da.ceiling}
        />
      </div>
      <div className="mt-1">
        <NistChips fn={spec.fn} char={spec.char} oversight={da.oversight} />
      </div>

      {/* Routing target + segregation of duties + sealed provenance */}
      <div className="mt-1 rounded bg-carbon-gray-10 px-1.5 py-1">
        <p className="text-[10px] text-carbon-gray-80">
          <span className="font-semibold">Queue:</span> {route.seat} ·{' '}
          <span className="mono">{owner}</span>
        </p>
        <p className="text-[9px] text-carbon-gray-50">{route.authority}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
          <span
            className="rounded px-1 text-[8px] font-semibold uppercase"
            style={{
              background: isSiu ? '#f6f2ff' : '#eef4fb',
              color: isSiu ? '#6929c4' : '#24427e',
            }}
          >
            {isSiu
              ? 'investigative · SIU'
              : seed.role === 'payer-md'
                ? 'clinical · UM'
                : 'seat authority'}
          </span>
          <span
            className="rounded bg-carbon-gray-10 px-1 text-[8px] text-carbon-gray-50"
            title="Investigative and clinical are different authorities; a detection routes to one, never both"
          >
            SoD: investigative ≠ clinical
          </span>
          {t.routedSeal !== undefined && (
            <span
              className="mono rounded bg-white px-1 text-[8px] text-carbon-gray-60"
              title="The sealed routing event backing this hand-off"
            >
              routing sealed #{t.routedSeal}
            </span>
          )}
          {t.referSeal !== undefined && (
            <span
              className="mono rounded bg-[#f6f2ff] px-1 text-[8px] font-semibold text-[#6929c4]"
              title="Sealed refer-out under 42 CFR 455.23"
            >
              refer-out #{t.referSeal} · 455.23
            </span>
          )}
        </div>
        {route.terminal && t.referSeal === undefined && (
          <p className="mt-0.5 text-[9px] font-semibold text-[#b45309]">
            ↳ on routing: {route.terminal}
          </p>
        )}
      </div>

      {/* Disposition + the governed step buttons */}
      <div className="mt-1 flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-1 text-[10px] font-semibold"
          style={{ color: DISP_COLOR[disp] }}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: DISP_COLOR[disp] }}
          />
          {DISPOSITION_LABEL[disp]}
        </span>
        <div className="flex items-center gap-1">
          {disp === 'detected' && (
            <button
              type="button"
              onClick={() => op.route(t.key, route.seat, route.authority, route.terminal)}
              className="rounded bg-[#24427e] px-2 py-0.5 text-[9px] font-semibold text-white hover:opacity-90"
              title="Seal a governed routing event and place this detection in the seat's queue"
            >
              Route to queue →
            </button>
          )}
          {disp === 'routed' && (
            <>
              <button
                type="button"
                onClick={() => op.grab(t.key, owner)}
                className="rounded bg-[#b45309] px-2 py-0.5 text-[9px] font-semibold text-white hover:opacity-90"
                title={`Claim into ${owner}'s work (New → Assigned)`}
              >
                Claim →
              </button>
              <span
                className="rounded border border-carbon-gray-20 px-1.5 py-0.5 text-[9px] text-carbon-gray-40"
                title="Open is enabled once the item is claimed"
              >
                Open
              </span>
            </>
          )}
          {(disp === 'assigned' || disp === 'action-proposed') && (
            <button
              type="button"
              onClick={() => onOpenTicket?.(seed.id, ROLE_SIDE[role], t.key)}
              className="rounded bg-carbon-blue px-2 py-0.5 text-[9px] font-semibold text-white hover:bg-carbon-blue-hover"
            >
              Open in workbench →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DetectorChip({
  a,
  wired,
  hits,
}: {
  a: Algorithm;
  wired: boolean;
  hits: number;
}): React.ReactElement {
  return (
    <span
      className="inline-flex items-center gap-1 rounded border px-1 py-0.5 text-[9px]"
      style={{
        borderColor: wired ? '#0f766e' : '#e0e0e0',
        background: wired ? '#e6f4f1' : '#fafafa',
        opacity: wired ? 1 : 0.85,
      }}
      title={`${a.id} — ${a.desc}\nmax ${a.maxRung} · ${LANE_LABEL[a.lane]} · ${a.techniques.map((t) => TECHNIQUE_LABEL[t]).join(', ')}${wired ? ' · scripted narrative (illustrative)' : ' · catalog reference (no live analysis)'}`}
    >
      <span className="mono font-semibold" style={{ color: wired ? '#0f766e' : '#8d8d8d' }}>
        {a.id}
      </span>
      <span
        className="mono rounded px-0.5 text-white"
        style={{ background: wired ? '#24427e' : '#c4c4c4', fontSize: 8 }}
      >
        {a.maxRung}
      </span>
      {wired ? (
        hits > 0 && (
          <span className="mono rounded bg-[#0f766e] px-0.5 text-white" style={{ fontSize: 8 }}>
            {hits}
          </span>
        )
      ) : (
        <span className="mono text-carbon-gray-40" style={{ fontSize: 8 }}>
          —
        </span>
      )}
    </span>
  );
}

// A detection's lane, inferred from its verdict (adverse when human-gated at a low rung).
function laneForVerdict(seed: OpsTicket): string {
  return seed.verdict.requiresHuman ? 'adverse' : 'self-directed';
}
