'use client';
/**
 * LiveDetectionFeed — the "Live detections · route → claim → open" column, extracted whole from the
 * SurveillanceConsole so it can stand as its own full-width sub-tab. Each card carries the governed
 * route → claim → open lifecycle: a detection is a work item that enters a NAMED seat queue under an
 * SLA, is claimed by a named person under segregation of duties, and every routing hop is SEALED.
 *
 * Behavior is preserved exactly from the original console (no change to the feed or card rendering).
 * This file OWNS the shared surveillance projection helpers (`dispositionOf`, the `Detection` join
 * type, the `Side` alias) so the queue-health panel reads the identical time-left / disposition
 * projection without duplicating it.
 *
 * CLIENT-SAFE: shared sim + library data + presentational helpers only. No `@/lib/evidence` barrel.
 */
import { ROLE_SIDE, OPERATORS, type OpsTicket, type OpsRole } from '@/lib/goldenThread/e2eFlow';
import { displayAuthority, type SimState, type LiveTicket } from '@/lib/goldenThread/flowSim';
import { nistForAlgorithm } from '@/lib/goldenThread/nistMap';
import {
  libraryIdForAlgorithm,
  detectionRoute,
  DISPOSITION_LABEL,
  slaRemaining,
  slaColor,
  type Disposition,
  type Routing,
  type TicketActionVerb,
} from '@/lib/goldenThread/surveillanceMap';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';
import {
  TwinLadderCodes,
  NistChips,
  TicketActionBar,
} from '@/components/goldenThread/flow/opsShared';
import StatusBadge from '@/components/ui/StatusBadge';

export type Side = 'payer' | 'provider' | 'neutral';
/** Live detection = an OPEN governed ticket the run has minted, joined to its seed narrative. */
export type Detection = { t: LiveTicket; seed: OpsTicket };

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

/** Disposition PROJECTED from real ticket state — the single source of truth (matches Operations). */
export function dispositionOf(t: LiveTicket): Disposition {
  if (t.status === 'Closed') return t.disposition === 'cleared' ? 'cleared' : 'action-proposed';
  if (t.status === 'Proposed') return 'action-proposed';
  if (t.status === 'Assigned') return 'assigned';
  if (t.routedSeal !== undefined) return 'routed';
  return 'detected';
}

// A detection's lane, inferred from its verdict (adverse when human-gated at a low rung).
function laneForVerdict(seed: OpsTicket): string {
  return seed.verdict.requiresHuman ? 'adverse' : 'self-directed';
}

export interface LiveDetectionFeedProps {
  op: OperatingSim;
  s: SimState;
  detections: Detection[];
  onOpenTicket?: (seedTicketId: string, side: Side, liveKey?: string) => void;
}

export function LiveDetectionFeed({
  op,
  s,
  detections,
  onOpenTicket,
}: LiveDetectionFeedProps): React.ReactElement {
  return (
    <div className="ed-card p-3">
      <p className="mb-2 text-[11px] font-semibold text-carbon-gray-90">
        Live detections · route → claim → open
      </p>
      <div className="space-y-2">
        {detections.length === 0 && (
          <p className="text-[11px] italic text-carbon-gray-40">
            press Play — wired detectors raise governed detections as the run proceeds
          </p>
        )}
        {detections.map(({ t, seed }) => (
          <DetectionCard key={t.key} op={op} s={s} t={t} seed={seed} onOpenTicket={onOpenTicket} />
        ))}
      </div>
      <p className="mt-2 text-[8px] italic text-carbon-gray-40">
        Lifecycle: detected → <span className="font-semibold">Route to queue</span> (sealed routing
        event) → <span className="font-semibold">Claim</span> (a named analyst grabs it) →{' '}
        <span className="font-semibold">Open</span> in the workbench → action proposed (pending
        human release). The queue lives on the Operations tab; this is the sealed hand-off into it.
        Nothing is transmitted (mock channel).
      </p>
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
  const sla = slaRemaining(s.tick, t.bornTick, t.slaHours);
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
        {/* Shared governed action row (single-sourced with the Process-flow + Operations boards). As a
            MONITORING lens, Surveillance may route/grab a New detection; every disposition defers to the
            workbench (ticketActions enforces this for surface='surveillance'). */}
        <TicketActionBar
          status={t.status}
          ctx={{
            surface: 'surveillance',
            routed: t.routedSeal !== undefined,
            hasWorkflow: s.workflows.some((w) => w.ticketKey === t.key),
          }}
          onAct={(verb: TicketActionVerb) => {
            if (verb === 'grab') op.grab(t.key, owner);
            else if (verb === 'route') op.route(t.key, route.seat, route.authority, route.terminal);
            else onOpenTicket?.(seed.id, ROLE_SIDE[role], t.key);
          }}
        />
      </div>
    </div>
  );
}
