'use client';
/**
 * TicketExposureEvidence — the honest evidence section of an Operations ticket detail. It fixes the
 * "static catalogue constant labelled 'grounded in the record'" defect: the ONLY figures presented as
 * grounded are the ones the ticket's own sealed reconciliation record carries (joined by
 * `reconRecordSeq`). The catalogue's exemplar exposure and root-cause narrative are shown — they are
 * useful — but explicitly as an ILLUSTRATIVE pattern, never as this claim's record. When a ticket has
 * a sealed recon record, the catalogue identity (provider / refs / exposure) is NOT rendered as fact,
 * so a real single-claim record can never sit beside a contradicting catalogue exemplar on one card.
 *
 * Works with or without a catalogue `seed` — recon-routed tickets (RCLM/RPAT) have no seed and render
 * purely from their sealed record.
 *
 * CLIENT-SAFE: type-only engine imports; no `@/lib/evidence` barrel.
 */
import type { OpsTicket } from '@/lib/goldenThread/e2eFlow';
import type { SimState, LiveTicket, ReconRecord } from '@/lib/goldenThread/flowSim';

const usd = (n: number): string => `$${Math.round(n).toLocaleString()}`;

function SealedReconEvidence({ rec }: { rec: ReconRecord }): React.ReactElement {
  const under = rec.deltaUsd < 0;
  return (
    <div
      className="mt-3 rounded border p-2"
      style={{ borderColor: '#0f766e55', background: '#effcf9' }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[#0f766e]">
        Reconciliation evidence — this claim · sealed sub-ledger #{rec.seq}
      </p>
      <p className="mono mt-0.5 text-[10px] text-carbon-gray-70">{rec.claimRef}</p>
      <div className="mono mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-carbon-gray-80 sm:grid-cols-3">
        <span>{rec.provider}</span>
        <span>{rec.payer}</span>
        <span>
          {rec.carc} · {rec.group}
        </span>
        <span>contracted {usd(rec.contractedUsd)}</span>
        <span>paid {usd(rec.paidUsd)}</span>
        <span style={{ color: under ? '#da1e28' : '#b45309', fontWeight: 700 }}>
          {under ? 'underpaid' : 'overpaid'} {usd(Math.abs(rec.deltaUsd))} ({rec.variancePct}%)
        </span>
      </div>
      <p className="mt-1 text-[9px] italic text-carbon-gray-50">
        Per-claim figures re-derive from this sealed record (tamper-evident). Modelled 835 vs loaded
        contract · claim-level · mock channel — not parsed from a live remittance.
      </p>
    </div>
  );
}

function IllustrativeExposure({ seed }: { seed: OpsTicket }): React.ReactElement {
  // An advisory ticket (e.g. clock-jeopardy) carries no dollar exposure — don't invent an "exemplar
  // exposure $0". The honest claim is only that NO sealed per-claim reconciliation record is joined,
  // which is true whether this is a catalogue exemplar or a scenario's own advisory ticket.
  const hasDollars = seed.exposureUsd > 0;
  return (
    <div className="mt-3 rounded border border-carbon-gray-20 bg-carbon-gray-10 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
        {hasDollars ? 'Reference exposure — illustrative' : 'Advisory ticket — no dollar exposure'}{' '}
        · no sealed per-claim reconciliation record joined
      </p>
      <div className="mono mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-carbon-gray-60">
        <span>{seed.provider}</span>
        <span>{seed.payer}</span>
        {seed.emr && <span>{seed.emr}</span>}
        {hasDollars && <span>exemplar exposure {usd(seed.exposureUsd)}</span>}
        <span>{seed.claimRefs}</span>
      </div>
    </div>
  );
}

export function TicketExposureEvidence({
  live,
  seed,
  s,
}: {
  live: LiveTicket;
  seed?: OpsTicket;
  s: SimState;
}): React.ReactElement {
  const rec =
    live.reconRecordSeq !== undefined
      ? s.reconLedger.find((r) => r.seq === live.reconRecordSeq)
      : undefined;

  return (
    <div>
      {/* Grounded first (when the ticket carries a sealed record); otherwise the labelled exemplar. */}
      {rec ? <SealedReconEvidence rec={rec} /> : seed ? <IllustrativeExposure seed={seed} /> : null}

      {seed && (
        <div className="mt-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
            Root-cause analysis — illustrative · not grounded in a per-claim record
          </p>
          <ol className="mt-1 list-decimal space-y-1 pl-4 text-xs text-carbon-gray-90">
            {seed.rca.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
          <div className="mt-2 rounded border border-carbon-gray-20 bg-white p-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-50">
              Recommended action (pattern)
            </p>
            <p className="mt-0.5 text-xs text-carbon-gray-90">{seed.recommendation}</p>
          </div>
        </div>
      )}

      {!rec && !seed && (
        <p className="mt-3 rounded border border-carbon-gray-20 bg-carbon-gray-10 px-3 py-2 text-[10px] italic text-carbon-gray-50">
          No per-instance reconciliation record is joined to this ticket yet — nothing here is
          claimed as grounded evidence.
        </p>
      )}
    </div>
  );
}
