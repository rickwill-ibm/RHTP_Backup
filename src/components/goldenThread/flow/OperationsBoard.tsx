'use client';
/**
 * OperationsBoard — the operating layer over the ONE shared sim (client).
 *
 * The live flow mints governed tickets → they queue to named analyst personas → selecting one shows
 * its agent-produced RCA (grounded in the seeded transaction facts, joined by ref) + the REAL
 * Twin-Ladder verdict → "Open in workbench" routes to that persona's analyst console. The forensic
 * log IS the live, hash-chained evidence ledger (seal re-derives — genuinely tamper-evident), shown
 * in the shared NIST-per-record language.
 *
 * CLIENT-SAFE: shared sim + spine + presentational helpers only. No `@/lib/evidence` barrel.
 */
import { useMemo, useState } from 'react';
import {
  seedTicketByRef,
  ROLE_LABEL,
  ROLE_SIDE,
  OPERATORS,
  type OpsTicket,
  type ForensicEntry,
  type OpsRole,
} from '@/lib/goldenThread/e2eFlow';
import {
  ledgerIntact,
  slaAtRisk,
  throughputPerMin,
  displayAuthority,
  type SimState,
  type LedgerEntry,
} from '@/lib/goldenThread/flowSim';
import {
  slaRemaining,
  detectionRoute,
  type TicketActionVerb,
} from '@/lib/goldenThread/surveillanceMap';
import {
  NIST_COLOR,
  nistForAlgorithm,
  type NistFn,
  type Oversight,
} from '@/lib/goldenThread/nistMap';
import { scenarioOf } from '@/lib/goldenThread/scenarios';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';
import {
  TwinLadderCodes,
  NistChips,
  ExecLegendMini,
  HONEST_NIST_NOTE,
  TicketActionBar,
} from '@/components/goldenThread/flow/opsShared';
import { WorkflowPanel } from '@/components/goldenThread/flow/WorkflowPanel';
import { NotificationStrip } from '@/components/goldenThread/flow/NotificationStrip';
import StatusBadge from '@/components/ui/StatusBadge';

type Side = 'payer' | 'provider' | 'neutral';
type Variant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';
const SEV_VARIANT: Record<OpsTicket['severity'], Variant> = {
  critical: 'danger',
  warning: 'warning',
  action: 'purple',
  info: 'neutral',
};
// 'action' is a priority tier, not a verb — label it as one so the badge reads as a priority.
const SEV_LABEL: Record<OpsTicket['severity'], string> = {
  critical: 'critical',
  warning: 'warning',
  action: 'priority',
  info: 'info',
};
const SIDES: Array<{ key: Side; label: string }> = [
  { key: 'payer', label: 'Payer / MCO' },
  { key: 'provider', label: 'Provider' },
  { key: 'neutral', label: 'Neutral' },
];
const seedByRef = (ref: string): OpsTicket | undefined => seedTicketByRef(ref); // resolves WA + scenario tickets

export interface OperationsBoardProps {
  op: OperatingSim;
  tickets?: OpsTicket[];
  forensic?: ForensicEntry[];
  onOpenParty?: (side: Side) => void;
  onOpenTicket?: (seedTicketId: string, side: Side, liveKey?: string) => void;
}

export function OperationsBoard({ op, onOpenTicket }: OperationsBoardProps): React.ReactElement {
  const s = op.sim;
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
    <div className="space-y-4">
      {/* Transport + honesty — the SAME shared run drives the flow and these queues */}
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
            {s.tickets.length} open · tick {s.tick}
          </span>
        </div>
        <span className="rounded border border-carbon-yellow bg-carbon-yellow-light px-2 py-0.5 text-[10px] text-[#b45309]">
          Same run as the flow tab · findings, verdicts &amp; role-routing are real; cadence is
          illustrative
        </span>
      </div>

      <NotificationStrip op={op} />
      <OpsCounters s={s} />
      <ExecLegendMini />

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
          <TicketDetail
            live={selectedLive}
            seed={selectedSeed}
            s={s}
            onAct={(verb) => {
              if (verb === 'grab') op.grab(selectedLive.key, selectedSeed.operator);
              else if (verb === 'route') {
                const r = detectionRoute(selectedSeed.role, 'adverse', selectedSeed.algorithm);
                op.route(selectedLive.key, r.seat, r.authority, r.terminal);
              } else
                onOpenTicket?.(selectedSeed.id, ROLE_SIDE[selectedSeed.role], selectedLive.key);
            }}
          />
        ) : (
          <div className="ed-card flex items-center justify-center p-6 text-center text-[11px] italic text-carbon-gray-40">
            {isDiane
              ? `Press Play — the expedited-clock detector raises ${scenarioOf(s).member?.name ?? 'the member'}’s governed advisory ticket here as the cert-gap pend approaches the ${scenarioOf(s).clockCite} window.`
              : 'Press Play — as the flow raises issues, governed tickets mint here. Select one to see its agent RCA.'}
          </div>
        )}
      </div>

      {/* Forensic log = the LIVE hash-chained ledger */}
      <ForensicLedger s={s} op={op} />
    </div>
  );
}

function OpsCounters({ s }: { s: SimState }): React.ReactElement {
  const open = s.tickets.filter((t) => t.status !== 'Closed');
  const critical = open.filter((t) => t.severity === 'critical').length;
  const exposure = open.reduce((a, t) => a + t.exposureUsd, 0);
  const closed = s.tickets.filter((t) => t.status === 'Closed').length;
  const tiles: Array<{ label: string; value: string; color: string }> = [
    { label: 'Open tickets', value: String(open.length), color: '#24427e' },
    { label: 'Critical', value: String(critical), color: '#da1e28' },
    { label: 'SLA at risk', value: String(slaAtRisk(s)), color: '#b45309' },
    { label: 'Closed', value: String(closed), color: '#24a148' },
    { label: 'Queue exposure', value: `$${(exposure / 1000).toFixed(0)}k`, color: '#161616' },
    { label: 'Sealed records', value: String(s.ledgerSeq), color: '#5b3fa3' },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
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

function TicketDetail({
  live,
  seed,
  s,
  onAct,
}: {
  live: SimState['tickets'][number];
  seed: OpsTicket;
  s: SimState;
  onAct: (verb: TicketActionVerb) => void;
}): React.ReactElement {
  const v = seed.verdict;
  const da = displayAuthority(v.permittedRung, v.requiresHuman, s);
  const resolved = live.status === 'Closed';
  return (
    <div className="ed-card p-4">
      {resolved && (
        <div
          className="mb-3 rounded border px-3 py-2 text-[11px]"
          style={{ borderColor: '#24a14855', background: '#eafaf0', color: '#0e6027' }}
        >
          <span className="font-bold uppercase tracking-wide">
            ✓ Resolved within the expedited clock ·{' '}
          </span>
          caught {live.closedTick !== undefined ? `at tick ${live.closedTick}` : 'before expiry'} —
          the provider attestation was located in the member evidence record; no clinical
          determination was touched and the 72h clock never lapsed. The advisory did not decide the
          outcome.
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="mono text-[10px] uppercase tracking-wide text-carbon-gray-50">
            {live.key} · {seed.algorithm} · queued to {ROLE_LABEL[seed.role]} ({seed.operator})
          </p>
          <h3 className="text-base">{seed.title}</h3>
        </div>
        <StatusBadge
          label={resolved ? 'resolved' : SEV_LABEL[seed.severity]}
          variant={resolved ? 'success' : SEV_VARIANT[seed.severity]}
        />
      </div>
      <div className="mono mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-carbon-gray-60">
        <span>{seed.provider}</span>
        <span>{seed.payer}</span>
        {seed.emr && <span>{seed.emr}</span>}
        <span>exposure ${seed.exposureUsd.toLocaleString()}</span>
        <span>{seed.claimRefs}</span>
      </div>

      <div className="mt-3">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
          Root-cause analysis — agent-produced, grounded in the record
        </p>
        <ol className="mt-1 list-decimal space-y-1 pl-4 text-xs text-carbon-gray-90">
          {seed.rca.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
      </div>

      <div className="mt-3 rounded border border-carbon-gray-20 bg-carbon-gray-10 p-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
          Recommendation
        </p>
        <p className="mt-0.5 text-xs text-carbon-gray-90">{seed.recommendation}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TwinLadderCodes
          tier={v.evidenceTier}
          rung={da.capability}
          human={v.requiresHuman}
          size="md"
          capped={da.capped}
          now={da.ceiling}
        />
      </div>
      <div className="mt-1">
        <NistChips {...nistForTicket(seed, s)} />
      </div>
      <p className="mt-1 text-[11px] text-carbon-gray-60">
        {v.reason}
        {da.capped
          ? ` The fleet has not earned autonomous A${da.capability.slice(1)} on this action class (now A${da.ceiling}) — it routes to a human.`
          : ''}
      </p>

      {s.scenario === 'wa-medicaid' ? (
        <>
          {/* Shared governed action row — single-sourced with the Process-flow + Surveillance boards.
              This TicketDetail is only shown for a NON-workflow ticket (workflow-backed ones render in
              WorkflowPanel), so hasWorkflow is false here; disposition still defers to the workbench. */}
          <div className="mt-3">
            <TicketActionBar
              status={live.status}
              ctx={{
                surface: 'operations',
                routed: live.routedSeal !== undefined,
                hasWorkflow: false,
              }}
              onAct={onAct}
            />
          </div>
          <p className="mt-1 text-[10px] italic text-carbon-gray-40">
            Adverse determinations (455.23 suspension, deemed-adverse NABD, gold-card revocation,
            recoupment) are human decisions — never one-click agent actions.
          </p>
        </>
      ) : (
        <p className="mt-3 rounded border border-carbon-gray-20 bg-carbon-gray-10 px-3 py-2 text-[10px] italic text-carbon-gray-60">
          Detection-only in this step: this is a <strong>preemptive advisory</strong> ticket — it
          does not itself decide anything, and it did not drive the outcome. The analyst workbench
          that <em>acts</em> on the gap (the resolver + maturity ladder) is re-grounded for the{' '}
          {scenarioOf(s).label} scenario in the next step. Any {scenarioOf(s).adverseNotice} is a
          human decision — never a one-click agent action.
        </p>
      )}
    </div>
  );
}

// NIST chips for a ticket, resolved from its algorithm via the single shared map.
function nistForTicket(
  seed: OpsTicket,
  s: SimState
): { fn: NistFn; char: string; oversight: Oversight } {
  const spec = nistForAlgorithm(seed.algorithm);
  const oversight: Oversight = displayAuthority(
    seed.verdict.permittedRung,
    seed.verdict.requiresHuman,
    s
  ).oversight; // single-sourced
  return { fn: spec.fn, char: spec.char, oversight };
}

function ForensicLedger({ s, op }: { s: SimState; op: OperatingSim }): React.ReactElement {
  const [actor, setActor] = useState('all');
  const [fired, setFired] = useState('all');
  const [reproduced, setReproduced] = useState<Record<number, boolean>>({});
  const intact = ledgerIntact(s);
  const rows = useMemo(() => [...s.ledger].slice(-140).reverse(), [s.ledger]);
  const actors = useMemo(
    () => Array.from(new Set(s.ledger.map((e) => e.actor))).sort(),
    [s.ledger]
  );
  const fires = useMemo(() => Array.from(new Set(s.ledger.map((e) => e.fired))).sort(), [s.ledger]);
  const shown = rows.filter(
    (e) => (actor === 'all' || e.actor === actor) && (fired === 'all' || e.fired === fired)
  );

  return (
    <div className="rounded-lg" style={{ background: '#0b1a2b' }}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <h3 className="text-sm font-semibold text-white">
          Forensic log — the live evidence ledger
        </h3>
        <span
          className="mono text-[10px] font-semibold"
          style={{ color: intact ? '#54d98c' : '#ff8a8a' }}
        >
          {intact ? '● seal intact' : '● seal BROKEN'} · {s.ledgerSeq} sealed · head{' '}
          {s.chainHead.toString(16).slice(-6)}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[9px] text-[#9fc2e0]">
          {(['GOVERN', 'MAP', 'MEASURE', 'MANAGE'] as const).map((fn) => (
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
      <div className="flex flex-wrap items-center gap-2 px-3 pb-1 text-[10px] text-[#9fc2e0]">
        <span className="font-semibold uppercase tracking-wide">Actor</span>
        <select
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          className="rounded border border-[#274b6d] bg-[#0f2740] px-1 py-0.5 text-[10px] text-[#cfe3f4]"
        >
          <option value="all">all</option>
          {actors.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <span className="font-semibold uppercase tracking-wide">Fired</span>
        <select
          value={fired}
          onChange={(e) => setFired(e.target.value)}
          className="rounded border border-[#274b6d] bg-[#0f2740] px-1 py-0.5 text-[10px] text-[#cfe3f4]"
        >
          <option value="all">all</option>
          {fires.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <span className="mono text-[9px] text-[#6f93b3]">{shown.length} shown</span>
      </div>
      <div className="max-h-72 overflow-y-auto px-3 pb-2">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0" style={{ background: '#0b1a2b' }}>
            <tr className="text-[9px] uppercase tracking-wide text-[#6f93b3]">
              <th className="py-1 pr-2 font-semibold">#</th>
              <th className="py-1 pr-2 font-semibold">Actor</th>
              <th className="py-1 pr-2 font-semibold">Fired</th>
              <th className="py-1 pr-2 font-semibold">Tier→Rung</th>
              <th className="py-1 pr-2 font-semibold">Decision</th>
              <th className="py-1 pr-2 font-semibold">NIST AI-RMF (illustrative)</th>
              <th className="py-1 font-semibold">Integrity</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className="py-3 text-[10px] italic text-[#6f93b3]">
                  the record builds as the run proceeds — press Play
                </td>
              </tr>
            )}
            {shown.map((e: LedgerEntry) => {
              const rep = reproduced[e.seq];
              return (
                <tr key={e.seq} className="border-b border-[#13324f] align-top">
                  <td className="mono py-1.5 pr-2 text-[10px] text-[#6f93b3]">{e.seq}</td>
                  <td
                    className="mono py-1.5 pr-2 text-[10px]"
                    style={{ color: e.human ? '#ffd27a' : '#9fc2e0' }}
                  >
                    {e.actor}
                  </td>
                  <td className="mono py-1.5 pr-2 text-[10px] text-[#cfe3f4]">
                    {e.fired}
                    <span className="block text-[8px] text-[#5f83a3]">{e.version}</span>
                  </td>
                  <td className="mono py-1.5 pr-2 text-[10px] font-semibold text-white">
                    {e.tier}→{e.rung}
                  </td>
                  <td className="py-1.5 pr-2 text-[10px] text-[#cfe3f4]">{e.decision}</td>
                  <td className="py-1.5 pr-2">
                    <span className="inline-flex flex-wrap items-center gap-1">
                      <span
                        className="mono rounded px-1 py-0.5 text-[9px] font-bold text-white"
                        style={{ background: NIST_COLOR[e.nistFn] }}
                      >
                        {e.nistFn}
                      </span>
                      <span className="text-[9px] text-[#9fc2e0]">{e.nistChar}</span>
                      <span className="rounded border border-[#274b6d] px-1 text-[9px] text-[#7fa8c9]">
                        {e.oversight}
                      </span>
                    </span>
                  </td>
                  <td className="py-1.5">
                    {rep === undefined ? (
                      <button
                        type="button"
                        onClick={() => setReproduced((r) => ({ ...r, [e.seq]: op.verify(e.seq) }))}
                        className="rounded border border-[#274b6d] px-1.5 py-0.5 text-[9px] text-[#9fc2e0] hover:bg-[#13324f]"
                      >
                        ↻ Re-verify seal
                      </button>
                    ) : rep ? (
                      <span className="mono text-[9px] font-bold text-[#54d98c]">✓ seal holds</span>
                    ) : (
                      <span className="mono text-[9px] font-bold text-[#ff8a8a]">✗ mismatch</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-3 pb-2 text-[8px] italic text-[#6f93b3]">
        Append-only, hash-chained: the seal indicator re-derives the whole retained chain on every
        render — any edit to a sealed field breaks it.{' '}
        <strong className="text-[#9fc2e0]">Re-verify seal</strong> re-derives that one entry&apos;s
        hash from its stored fields and checks its chain link — a local integrity re-check, not a
        re-run of the underlying analysis. Agent rows are capped to the{' '}
        <strong className="text-[#9fc2e0]">earned</strong> ceiling — the ticket shows the
        action-class capability, the ledger shows the authority actually exercised.{' '}
        {HONEST_NIST_NOTE}
      </p>
    </div>
  );
}

// slaRemaining is single-sourced in surveillanceMap (imported above) — this board, the Reconciliation
// board, Surveillance, and the Live Process Flow board all read the identical time-left projection.
