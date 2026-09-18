'use client';
/**
 * OpsTicketDetail — the grounded RCA + Twin-Ladder verdict panel for a selected seeded ticket, split
 * out of OperationsBoard so the Work-baskets child stays lean. Presentational; no sim/engine change.
 * Props unchanged from the original in-file helper (`live`, `seed`, `s`, `onAct`).
 */
import { ROLE_LABEL, type OpsTicket } from '@/lib/goldenThread/e2eFlow';
import { displayAuthority, type SimState } from '@/lib/goldenThread/flowSim';
import { type TicketActionVerb } from '@/lib/goldenThread/surveillanceMap';
import { nistForAlgorithm, type NistFn, type Oversight } from '@/lib/goldenThread/nistMap';
import { scenarioOf } from '@/lib/goldenThread/scenarios';
import {
  TwinLadderCodes,
  NistChips,
  TicketActionBar,
} from '@/components/goldenThread/flow/opsShared';
import { TicketExposureEvidence } from '@/components/goldenThread/flow/TicketExposureEvidence';
import StatusBadge from '@/components/ui/StatusBadge';

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

export function OpsTicketDetail({
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
      {/* Honest evidence: grounded per-claim figures come ONLY from this ticket's sealed recon record;
          the catalogue exposure + RCA are shown as a labelled illustrative pattern, never as this
          claim's record (fixes the "static constant labelled grounded" defect). */}
      <TicketExposureEvidence live={live} seed={seed} s={s} />

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
