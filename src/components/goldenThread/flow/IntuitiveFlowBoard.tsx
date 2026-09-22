'use client';
/**
 * IntuitiveFlowBoard — the "Process flow (v2)" container. A presentation-only redesign over the
 * existing deterministic engine: it reads state from the shared `op: OperatingSim` and calls only
 * the existing handlers. Top-to-bottom it stacks a persistent honesty header + guided controls, the
 * Authorization Spine (hero), the hash-chained Journey Ledger trail, the Stage Focus governance
 * panel, and — kept PROMINENT, never hidden — the live-operations FlowCanvas animation.
 *
 * It owns `focusedStage` (a PATH index) so the spine, trail, focus panel and canvas all read the
 * same selection. The default follows the spotlight thread's current stage.
 *
 * CLIENT-SAFE: spine + engine types + sibling v2 components + React only. No `@/lib/evidence`.
 */
import { useState } from 'react';
import {
  PATH,
  spotlight,
  TXN_TYPE_META,
  type SimState,
  type TxnType,
} from '@/lib/goldenThread/flowSim';
import { ROLE_SIDE, type OpsRole } from '@/lib/goldenThread/e2eFlow';
import {
  slaRemaining,
  slaColor,
  detectionRoute,
  type TicketActionVerb,
} from '@/lib/goldenThread/surveillanceMap';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';
import { AuthorizationSpine } from '@/components/goldenThread/flow/AuthorizationSpine';
import { JourneyLedgerTrail } from '@/components/goldenThread/flow/JourneyLedgerTrail';
import { StageFocusPanel } from '@/components/goldenThread/flow/StageFocusPanel';
import { FlowCanvas } from '@/components/goldenThread/flow/FlowCanvas';
import { IntakeChannelBar } from '@/components/goldenThread/flow/IntakeChannelBar';
import { LifecycleChip, TicketActionBar } from '@/components/goldenThread/flow/opsShared';

type OpenTicket = (
  seedTicketId: string,
  side: 'payer' | 'provider' | 'neutral',
  liveKey?: string
) => void;

export function IntuitiveFlowBoard({
  op,
  operatorName = 'you',
  onOpenTicket,
}: {
  op: OperatingSim;
  operatorName?: string;
  onOpenTicket?: OpenTicket;
}): React.ReactElement {
  const spot = spotlight(op.sim);
  const [focusedStage, setFocusedStage] = useState<number>(spot?.idx ?? 0);
  const last = PATH.length - 1;
  const followingLabel = spot
    ? `${spot.id} · ${TXN_TYPE_META[spot.type as TxnType].label}`
    : 'no thread live yet';

  const prev = (): void => setFocusedStage((n) => Math.max(0, n - 1));
  const nextStage = (): void => setFocusedStage((n) => Math.min(last, n + 1));

  return (
    <div className="space-y-3">
      {/* (a) persistent honesty header + guided controls */}
      <div className="ed-card flex flex-wrap items-center justify-between gap-2 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-carbon-yellow-light px-2 py-0.5 text-[10px] font-semibold text-[#b45309]">
            Prototype · seed data · mock channel — not transmitted
          </span>
          <span className="text-[11px] text-carbon-gray-70">
            Following: <span className="font-semibold">{followingLabel}</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={prev}
            disabled={focusedStage <= 0}
            className="rounded border border-carbon-gray-30 px-2 py-1 text-[11px] font-semibold text-carbon-gray-70 hover:bg-carbon-gray-10 disabled:opacity-40"
          >
            ← Prev
          </button>
          <button
            type="button"
            onClick={nextStage}
            disabled={focusedStage >= last}
            className="rounded border border-carbon-gray-30 px-2 py-1 text-[11px] font-semibold text-carbon-gray-70 hover:bg-carbon-gray-10 disabled:opacity-40"
          >
            Next →
          </button>
          <span className="mx-1 h-4 w-px bg-carbon-gray-20" />
          <button
            type="button"
            onClick={op.play}
            className="rounded bg-carbon-blue px-3 py-1 text-[11px] font-semibold text-white hover:bg-carbon-blue-hover"
          >
            {op.running ? '❚❚ Pause' : '▶ Play'}
          </button>
          <button
            type="button"
            onClick={op.step}
            className="rounded border border-carbon-gray-30 px-2 py-1 text-[11px] text-carbon-gray-70 hover:bg-carbon-gray-10"
          >
            ⏭ Step
          </button>
        </div>
      </div>

      {/* (a2) multi-channel intake — the four real entering paths, live-counted from sim.txns */}
      <IntakeChannelBar sim={op.sim} />

      {/* (b) the hero spine */}
      <AuthorizationSpine sim={op.sim} focused={focusedStage} onFocus={setFocusedStage} />

      {/* (c) the connective ledger trail */}
      <JourneyLedgerTrail sim={op.sim} focused={focusedStage} />

      {/* (d) the governance read-out for the focused stage */}
      <StageFocusPanel sim={op.sim} focused={focusedStage} />

      {/* (e) live operations — visible, NOT collapsed */}
      <div>
        <h2 className="mb-1 mt-1 text-[11px] font-bold uppercase tracking-wide text-carbon-gray-60">
          Live operations
        </h2>
        <FlowCanvas op={op} focused={focusedStage} />
      </div>

      {/* (f) the operator loop — detections mint governed tickets; grab/route inline, else open the
          named operator's workbench. Parity with the original board so the demo payoff is reachable. */}
      <LiveTicketRail op={op} operatorName={operatorName} onOpenTicket={onOpenTicket} />
    </div>
  );
}

function LiveTicketRail({
  op,
  operatorName,
  onOpenTicket,
}: {
  op: OperatingSim;
  operatorName: string;
  onOpenTicket?: OpenTicket;
}): React.ReactElement {
  const s: SimState = op.sim;
  const act = (verb: TicketActionVerb, t: SimState['tickets'][number]): void => {
    if (verb === 'grab') op.grab(t.key, operatorName);
    else if (verb === 'route') {
      const r = detectionRoute(t.role, 'adverse', t.algorithm);
      op.route(t.key, r.seat, r.authority, r.terminal);
    } else onOpenTicket?.(t.ref, ROLE_SIDE[t.role as OpsRole] ?? 'payer', t.key);
  };
  return (
    <div className="ed-card p-3">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
          Governed ticket queue · detection → named operator
        </p>
        <span className="mono text-[10px] text-carbon-gray-40">{s.tickets.length} open</span>
      </div>
      <div className="max-h-56 space-y-1.5 overflow-y-auto">
        {s.tickets.length === 0 && (
          <p className="text-[10px] italic text-carbon-gray-40">
            no tickets yet — detections mint them as transactions flow (press Play)
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
                <LifecycleChip t={t} nowTick={s.tick} showSla={false} />
              </div>
              <p className="truncate text-[10px] text-carbon-gray-70">{t.title}</p>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="mono text-[9px] text-carbon-gray-50">
                  {t.operator} · ${t.exposureUsd.toLocaleString()}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="mono text-[10px] font-bold" style={{ color: slaColor(sla.pct) }}>
                    SLA {sla.label}
                  </span>
                  <TicketActionBar
                    status={t.status}
                    ctx={{
                      surface: 'flow',
                      routed: t.routedSeal !== undefined,
                      hasWorkflow: s.workflows.some((w) => w.ticketKey === t.key),
                    }}
                    onAct={(verb) => act(verb, t)}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
