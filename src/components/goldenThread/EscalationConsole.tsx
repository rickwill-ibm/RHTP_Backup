/**
 * EscalationConsole (Phase C — reviewer surface over the REAL escalation engine). A
 * server, presentational console over a `RoutedEscalation` (the Wave-6/7 `routeEscalation`
 * output) plus the escalation policy tier the routed item keys on. It COMPUTES no
 * governance of its own — it renders exactly what the router produced: the process gate,
 * the PHI-safe signal set, the per-party notification lenses, the routed work-queue item
 * (masked record ref · priority · SLA · due-by), and the escalation path (tier hierarchy)
 * with the next hop that fires on SLA breach.
 *
 * SERVER COMPONENT: purely presentational over already-PHI-safe data (routeEscalation masks
 * the member-embedding fields before the item crosses a party boundary). No hooks.
 */
import type { RoutedEscalation } from '@/lib/goldenThread/escalationRouter';
import type {
  EscalationSignal,
  SignalSeverity,
  ProcessGate,
} from '@/lib/goldenThread/escalationSignals';
import type { EscalationTier, EscalationStep } from '@/lib/agentRuntime/escalation';
import * as clock from '@/lib/clock'; // injected clock seam — the only wall-clock read
import { escalationBreachState, hopIntervalLabel, slaLabel } from './escalationView';

const SEVERITY_CLS: Record<SignalSeverity, string> = {
  info: 'bg-carbon-gray-10 text-carbon-gray-70 border-carbon-gray-20',
  action: 'bg-carbon-blue-lighter text-carbon-blue border-carbon-blue',
  warning: 'bg-carbon-yellow-light text-[#b45309] border-carbon-yellow',
  critical: 'bg-carbon-red-light text-carbon-red border-[#ffb3b8]',
};

const GATE_LABEL: Record<ProcessGate, string> = {
  assist: 'Assist only (A0)',
  hitl: 'Human-in-the-loop (A1)',
  hotl: 'Human-on-the-loop (A2)',
  autonomous: 'Autonomous (A3)',
};

function SignalRow({ s }: { s: EscalationSignal }): React.ReactElement {
  return (
    <div className={`rounded border p-2 ${SEVERITY_CLS[s.severity]}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wide">
          {s.kind}
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase">
          <span className="rounded bg-white/60 px-1.5 py-0.5">{s.party}</span>
          <span>{s.severity}</span>
        </span>
      </div>
      <p className="mt-1 text-xs">{s.message}</p>
    </div>
  );
}

function PartyLens({
  title,
  signals,
  accent,
}: {
  title: string;
  signals: EscalationSignal[];
  accent: string;
}): React.ReactElement {
  return (
    <div className="rounded-lg border border-carbon-gray-20 bg-white p-3">
      <h3 className={`text-sm font-semibold ${accent}`}>{title}</h3>
      <p className="mb-2 text-[11px] text-carbon-gray-50">
        {signals.length} signal{signals.length === 1 ? '' : 's'} for this lens
      </p>
      <div className="space-y-2">
        {signals.length ? (
          signals.map((s, i) => <SignalRow key={i} s={s} />)
        ) : (
          <p className="rounded border border-dashed border-carbon-gray-20 p-2 text-center text-[11px] text-carbon-gray-50">
            No signals routed to this lens.
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-carbon-gray-20 py-1 last:border-0">
      <span className="text-xs text-carbon-gray-50">{label}</span>
      <span className="text-sm font-medium text-carbon-gray-100">{value}</span>
    </div>
  );
}

export function EscalationConsole({
  routed,
  tier,
  path,
  asOf,
}: {
  routed: RoutedEscalation;
  tier: EscalationTier | null;
  path: EscalationStep | null;
  /**
   * The instant the breach is judged against. Defaults to the injected clock so the console
   * reports the REAL SLA position rather than the router's frozen routing timestamp. Pass it
   * explicitly to render an as-of view.
   */
  asOf?: string;
}): React.ReactElement {
  const { gate, signals, notifications, queueItem, escalationStep } = routed;
  const asOfIso = typeof asOf === 'string' ? asOf : clock.nowIso();
  // Breach is EITHER signal: a hop already fired, OR the due-by has passed as of `asOfIso`.
  // Reading `escalationStep` alone made an item 21 days overdue render as "within SLA",
  // because the router computes the hop against a frozen demo instant.
  const breach = escalationBreachState({ queueItem, escalationStep }, asOfIso);
  const breached = breach.breached;

  return (
    <div className="space-y-5">
      {/* Process gate + signal summary */}
      <section className="rounded-lg border border-carbon-gray-20 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-carbon-gray-50">
              Process gate over the authority ladder
            </p>
            <p className="mt-0.5 text-lg font-semibold">{GATE_LABEL[gate]}</p>
          </div>
          <div className="flex gap-2 text-center">
            <div className="rounded border border-carbon-gray-20 px-3 py-1.5">
              <p className="text-lg font-semibold">{signals.length}</p>
              <p className="text-[10px] uppercase text-carbon-gray-50">signals</p>
            </div>
            <div
              className={`rounded border px-3 py-1.5 ${
                breached
                  ? 'border-carbon-red bg-carbon-red-light text-carbon-red'
                  : 'border-carbon-gray-20'
              }`}
            >
              <p className="text-lg font-semibold">
                {breach.reason === 'no-item' ? 'no item' : breached ? 'SLA breach' : 'within SLA'}
              </p>
              <p className="text-[10px] uppercase text-carbon-gray-50">
                {breach.daysPastDue > 0
                  ? `${breach.daysPastDue}d past due`
                  : breach.reason === 'due-by-unreadable'
                    ? 'due-by unreadable'
                    : 'queue status'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Per-party notification lenses */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Per-party notification lenses</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <PartyLens title="Payer / MCO" signals={notifications.payer} accent="text-carbon-blue" />
          <PartyLens title="Provider" signals={notifications.provider} accent="text-carbon-green" />
        </div>
      </section>

      {/* Routed work-queue item */}
      <section className="rounded-lg border border-carbon-gray-20 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold">Routed work-queue item</h2>
        {queueItem ? (
          <div>
            <Row
              label="Record"
              value={<span className="font-mono text-xs">{queueItem.recordRef}</span>}
            />
            <Row label="Queue" value={queueItem.queue} />
            <Row label="Disposition" value={queueItem.disposition} />
            <Row label="Action code" value={<span className="font-mono">{queueItem.code}</span>} />
            <Row
              label="Priority"
              value={
                <span
                  className={`rounded px-2 py-0.5 text-xs font-semibold ${
                    queueItem.priority === 'expedited'
                      ? 'bg-carbon-red-light text-carbon-red'
                      : 'bg-carbon-gray-10 text-carbon-gray-70'
                  }`}
                >
                  {queueItem.priority}
                </span>
              }
            />
            <Row label="SLA (CMS-0057-F)" value={slaLabel(queueItem)} />
            <Row label="Submitted" value={queueItem.submittedAt} />
            <Row label="Due by" value={queueItem.dueBy} />
            {queueItem.note ? (
              <p className="mt-2 text-xs text-carbon-gray-70">{queueItem.note}</p>
            ) : null}
          </div>
        ) : (
          <p className="rounded border border-dashed border-carbon-gray-20 p-3 text-center text-xs text-carbon-gray-50">
            No routed item — the record carries no recovery draft to escalate.
          </p>
        )}
      </section>

      {/* Escalation path (tier hierarchy) */}
      {tier ? (
        <section className="rounded-lg border border-carbon-gray-20 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold">Escalation path</h2>
          <p className="mb-3 text-[11px] text-carbon-gray-50">
            {hopIntervalLabel(tier)} · on-exhaust: {tier.onExhaust}. This interval is the escalation
            policy&apos;s hop spacing, not a second SLA — the item&apos;s SLA is the CMS-0057-F
            clock shown above. The path below fires hop-by-hop once that SLA is breached; the item
            parks after the hierarchy is exhausted.
          </p>
          <ol className="flex flex-wrap items-center gap-1.5">
            {tier.hierarchy.map((target, i) => {
              const isNext = path?.kind === 'escalate' && path.level === i;
              return (
                <li key={i} className="flex items-center gap-1.5">
                  <span
                    className={`rounded px-2.5 py-1 text-xs font-semibold ${
                      isNext
                        ? 'bg-carbon-red text-white'
                        : 'border border-carbon-gray-20 bg-carbon-gray-10 text-carbon-gray-70'
                    }`}
                  >
                    {i + 1}. {target}
                    {isNext ? ' · next hop' : ''}
                  </span>
                  {i < tier.hierarchy.length - 1 ? (
                    <span className="text-carbon-gray-40">→</span>
                  ) : null}
                </li>
              );
            })}
            <li className="flex items-center gap-1.5">
              <span className="text-carbon-gray-40">→</span>
              <span
                className={`rounded px-2.5 py-1 text-xs font-semibold ${
                  path?.kind === 'park'
                    ? 'bg-carbon-gray-100 text-white'
                    : 'border border-carbon-gray-20 text-carbon-gray-50'
                }`}
              >
                park (audited)
              </span>
            </li>
          </ol>
          {breached ? (
            <p className="mt-3 rounded border border-carbon-red bg-carbon-red-light p-2 text-[11px] text-carbon-red">
              {breach.reason === 'hop-fired'
                ? 'A hop has fired — the highlighted target above now owns the item.'
                : breach.reason === 'due-by-unreadable'
                  ? 'The due-by on this item cannot be read, so it is surfaced as breached.'
                  : `SLA breached ${breach.daysPastDue} day(s) ago as of ${asOfIso.slice(0, 10)}. The next hop above is what fires on the sweep.`}
            </p>
          ) : (
            <p className="mt-3 rounded border border-carbon-gray-20 bg-carbon-gray-10 p-2 text-[11px] text-carbon-gray-60">
              The item is within SLA as of {asOfIso.slice(0, 10)} — no hop has fired. The path above
              is what would fire on breach.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
