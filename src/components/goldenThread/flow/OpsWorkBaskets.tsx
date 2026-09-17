'use client';
/**
 * OpsWorkBaskets — the 3-column persona work-baskets (LEFT) + the selected-ticket detail area (RIGHT),
 * split out of OperationsBoard. Owns `selectedKey` and derives `selectedLive`/`selectedSeed`, plus the
 * diane-ma keep-resolved-hero logic (`isDiane`, `resolvedHero`). Pure composition — no sim/engine
 * change; the shared <TicketActionBar> wiring + onAct dispatchers are preserved exactly.
 */
import { useState } from 'react';
import {
  seedTicketByRef,
  ROLE_LABEL,
  ROLE_SIDE,
  OPERATORS,
  type OpsTicket,
  type OpsRole,
} from '@/lib/goldenThread/e2eFlow';
import { displayAuthority, type SimState } from '@/lib/goldenThread/flowSim';
import { slaRemaining, detectionRoute } from '@/lib/goldenThread/surveillanceMap';
import { scenarioOf } from '@/lib/goldenThread/scenarios';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';
import { TwinLadderCodes, TicketActionBar } from '@/components/goldenThread/flow/opsShared';
import { WorkflowPanel } from '@/components/goldenThread/flow/WorkflowPanel';
import { TicketExposureEvidence } from '@/components/goldenThread/flow/TicketExposureEvidence';
import { OpsTicketDetail } from '@/components/goldenThread/flow/OpsTicketDetail';

type Side = 'payer' | 'provider' | 'neutral';
const SIDES: Array<{ key: Side; label: string }> = [
  { key: 'payer', label: 'Payer / MCO' },
  { key: 'provider', label: 'Provider' },
  { key: 'neutral', label: 'Neutral' },
];
const seedByRef = (ref: string): OpsTicket | undefined => seedTicketByRef(ref); // resolves WA + scenario tickets

export function OpsWorkBaskets({
  op,
  s,
  onOpenTicket,
}: {
  op: OperatingSim;
  s: SimState;
  onOpenTicket?: (seedTicketId: string, side: Side, liveKey?: string) => void;
}): React.ReactElement {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const isDiane = s.scenario === 'diane-ma';
  const openTickets = s.tickets.filter((t) => t.status !== 'Closed');
  // On the Diane MA scenario the single advisory ticket auto-closes on the Path-A save (~6 ticks after it
  // mints), and nothing else mints (seedMedicaidTickets:false, single-fire detector). Keep the RESOLVED
  // hero ticket selectable so its "caught early → resolved within clock" detail — the actual demo win —
  // stays reachable, instead of dead-ending on an empty "press Play" panel.
  const resolvedHero = isDiane
    ? s.tickets.find((t) => t.ref === 'TKT-DIANE-CLK' && t.status === 'Closed')
    : undefined;
  const selectedLive =
    s.tickets.find((t) => t.key === selectedKey) ?? openTickets[0] ?? resolvedHero;
  const selectedSeed = selectedLive ? seedByRef(selectedLive.ref) : undefined;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
      {/* Persona work-baskets — live minted tickets routed by role */}
      <div className="grid gap-3 sm:grid-cols-3">
        {SIDES.map((side) => {
          const roles = (Object.keys(ROLE_LABEL) as OpsRole[]).filter(
            (r) => ROLE_SIDE[r] === side.key
          );
          return (
            <div key={side.key} className="ed-card p-3">
              <p className="text-[11px] font-semibold text-carbon-gray-90">{side.label}</p>
              <div className="mt-2 space-y-3">
                {roles.map((role) => {
                  // Keep the RESOLVED Diane hero ticket in its basket so it stays clickable after auto-close.
                  const q = s.tickets.filter(
                    (t) =>
                      t.role === role &&
                      (t.status !== 'Closed' || (isDiane && t.ref === 'TKT-DIANE-CLK'))
                  );
                  return (
                    <div key={role}>
                      <p className="text-[10px] font-semibold text-carbon-gray-60">
                        {ROLE_LABEL[role]}
                      </p>
                      <p className="mono text-[9px] text-carbon-gray-40">{OPERATORS[role]}</p>
                      <div className="mt-1 space-y-1">
                        {q.length === 0 && (
                          <p className="text-[10px] italic text-carbon-gray-40">
                            idle — press Play
                          </p>
                        )}
                        {q.map((t) => {
                          const seed = seedByRef(t.ref);
                          const closed = t.status === 'Closed';
                          const sla = slaRemaining(s.tick, t.bornTick, t.slaHours);
                          return (
                            <button
                              key={t.key}
                              type="button"
                              onClick={() => setSelectedKey(t.key)}
                              className={`w-full rounded border p-1.5 text-left transition ${t.key === selectedLive?.key ? 'border-carbon-blue bg-carbon-blue-lighter' : closed ? 'border-carbon-gray-20 bg-carbon-gray-10 hover:border-carbon-blue-hover' : 'border-carbon-gray-20 bg-white hover:border-carbon-blue-hover'}`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="mono text-[10px] font-semibold text-carbon-gray-80">
                                  {t.key}
                                </span>
                                {closed ? (
                                  <span className="mono text-[9px] font-bold text-[#24a148]">
                                    ✓ RESOLVED
                                  </span>
                                ) : (
                                  <span
                                    className="mono text-[9px] font-bold"
                                    style={{
                                      color:
                                        sla.pct > 0.5
                                          ? '#24a148'
                                          : sla.pct > 0.2
                                            ? '#b45309'
                                            : '#da1e28',
                                    }}
                                  >
                                    SLA {sla.label}
                                  </span>
                                )}
                              </div>
                              <p className="truncate text-[10px] leading-tight text-carbon-gray-70">
                                {t.title}
                              </p>
                              {seed &&
                                (() => {
                                  const da = displayAuthority(
                                    seed.verdict.permittedRung,
                                    seed.verdict.requiresHuman,
                                    s
                                  );
                                  return (
                                    <div className="mt-0.5">
                                      <TwinLadderCodes
                                        tier={seed.verdict.evidenceTier}
                                        rung={da.capability}
                                        human={seed.verdict.requiresHuman}
                                        capped={da.capped}
                                        now={da.ceiling}
                                      />
                                    </div>
                                  );
                                })()}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected ticket → the live workflow (if any) OR the grounded RCA + verdict */}
      {selectedLive && s.workflows.find((w) => w.ticketKey === selectedLive.key) ? (
        <WorkflowPanel op={op} wf={s.workflows.find((w) => w.ticketKey === selectedLive.key)!} />
      ) : selectedLive && selectedSeed ? (
        <OpsTicketDetail
          live={selectedLive}
          seed={selectedSeed}
          s={s}
          onAct={(verb) => {
            if (verb === 'grab') op.grab(selectedLive.key, selectedSeed.operator);
            else if (verb === 'route') {
              const r = detectionRoute(selectedSeed.role, 'adverse', selectedSeed.algorithm);
              op.route(selectedLive.key, r.seat, r.authority, r.terminal);
            } else onOpenTicket?.(selectedSeed.id, ROLE_SIDE[selectedSeed.role], selectedLive.key);
          }}
        />
      ) : selectedLive ? (
        // Recon-routed ticket (RCLM/RPAT) with no catalogue seed and no workflow — render purely from
        // its own sealed reconciliation record so the recon-driven path never dead-ends or crashes.
        <div className="ed-card p-4">
          <p className="mono text-[10px] uppercase tracking-wide text-carbon-gray-50">
            {selectedLive.key} · {selectedLive.algorithm} · queued to{' '}
            {ROLE_LABEL[selectedLive.role as OpsRole] ?? selectedLive.role} ({selectedLive.operator}
            )
          </p>
          <h3 className="text-base">{selectedLive.title}</h3>
          <TicketExposureEvidence live={selectedLive} s={s} />
          <div className="mt-3">
            <TicketActionBar
              status={selectedLive.status}
              ctx={{
                surface: 'operations',
                routed: selectedLive.routedSeal !== undefined,
                hasWorkflow: false,
              }}
              onAct={(verb) => {
                if (verb === 'grab') op.grab(selectedLive.key, selectedLive.operator);
                else if (verb === 'route') {
                  const r = detectionRoute(selectedLive.role, 'adverse', selectedLive.algorithm);
                  op.route(selectedLive.key, r.seat, r.authority, r.terminal);
                } else
                  onOpenTicket?.(
                    selectedLive.ref,
                    ROLE_SIDE[selectedLive.role as OpsRole] ?? 'payer',
                    selectedLive.key
                  );
              }}
            />
          </div>
        </div>
      ) : (
        <div className="ed-card flex items-center justify-center p-6 text-center text-[11px] italic text-carbon-gray-40">
          {isDiane
            ? `Press Play — the expedited-clock detector raises ${scenarioOf(s).member?.name ?? 'the member'}’s governed advisory ticket here as the cert-gap pend approaches the ${scenarioOf(s).clockCite} window.`
            : 'Press Play — as the flow raises issues, governed tickets mint here. Select one to see its agent RCA.'}
        </div>
      )}
    </div>
  );
}
