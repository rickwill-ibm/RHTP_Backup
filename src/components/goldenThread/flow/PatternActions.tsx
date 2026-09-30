'use client';
/**
 * PatternActions — the governed-action row under a systematic-pattern chip / drill on the recon
 * Overview. A systematic pattern is one config defect across MANY claims; the verbs already exist on
 * the shared sim, so this surfaces them:
 *   • fee-schedule-config → "Route to Claims-Config → reprocess" (recovers the WHOLE cluster)
 *   • fwa-signal          → "Open Program-Integrity case"
 *     both call op.routePattern(...), which is IDEMPOTENT per RPAT-… ref — once a ticket exists this
 *     shows "✓ routed · sealed → <seat>" instead of the button.
 *   • "Draft exemplar appeal" → appeals the single largest-|delta| underpayment that COVERS the
 *     pattern (op.startAppeal on that record's seq).
 *
 * HONESTY: the appeal action is labelled as the EXEMPLAR that covers the pattern — it is NOT
 * "found N → appealed N". The config reprocess route is what recovers the remaining cluster claims.
 *
 * CLIENT-SAFE: shared sim + pure reconcile/report helpers only. No node/barrel.
 */
import type { ReconRecord } from '@/lib/goldenThread/flowSim';
import type { SystematicPattern } from '@/lib/goldenThread/reconcile';
import { claimsForPattern } from '@/lib/goldenThread/reconReport';
import { detectionRoute } from '@/lib/goldenThread/surveillanceMap';
import type { OperatingSim } from '@/components/goldenThread/flow/useOperatingSim';

/** Replicate the engine's per-pattern ticket ref so we can detect an already-routed pattern (idempotency). */
export function patternRef(p: SystematicPattern): string {
  const role = p.kind === 'fee-schedule-config' ? 'payer-config' : 'payer-pi';
  return `RPAT-${role}-${p.carc}-${p.provider.slice(0, 10)}`.replace(/[^A-Za-z0-9-]/g, '');
}

/** The exemplar this pattern's appeal covers: the largest-|delta| underpayment in the cluster. */
function exemplarOf(
  records: readonly ReconRecord[],
  p: SystematicPattern
): ReconRecord | undefined {
  return claimsForPattern(records, p.provider, p.carc)
    .filter((r) => r.reconClass === 'underpayment')
    .sort((a, b) => Math.abs(b.deltaUsd) - Math.abs(a.deltaUsd))[0];
}

export function PatternActions({
  op,
  p,
  records,
}: {
  op: OperatingSim;
  p: SystematicPattern;
  records: readonly ReconRecord[];
}): React.ReactElement {
  const ref = patternRef(p);
  const routedTicket = op.sim.tickets.find((t) => t.ref === ref);
  const exemplar = exemplarOf(records, p);
  const exemplarAppealed =
    exemplar !== undefined &&
    op.sim.workflows.some((w) => w.kind === 'underpayment-appeal' && w.reconSeq === exemplar.seq);
  const seat = routedTicket
    ? detectionRoute(routedTicket.role, 'adverse', routedTicket.algorithm).seat
    : '';

  const routeLabel =
    p.kind === 'fee-schedule-config'
      ? 'Route to Claims-Config → reprocess'
      : 'Open Program-Integrity case';

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {routedTicket ? (
        <span className="mono rounded border border-[#24a148] bg-[#defbe6] px-2 py-0.5 text-[9px] font-semibold text-[#0e6027]">
          ✓ routed · sealed → {seat}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => op.routePattern(p.kind, p.provider, p.carc, p.count, p.amountUsd)}
          className="rounded border border-carbon-blue bg-carbon-blue px-2 py-0.5 text-[9px] font-semibold text-white hover:bg-carbon-blue-hover"
          title={
            p.kind === 'fee-schedule-config'
              ? 'Seal an advisory → payer Claims Config; a reprocess recovers the whole cluster (human-decided)'
              : 'Seal an advisory → payer Program-Integrity review (opening a case is a human determination)'
          }
        >
          {routeLabel}
        </button>
      )}

      {exemplar &&
        (exemplarAppealed ? (
          <span className="mono rounded border border-[#5b3fa3] bg-[#f3effb] px-2 py-0.5 text-[9px] font-semibold text-[#5b3fa3]">
            ✓ exemplar appeal drafted · {exemplar.claimRef}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => op.startAppeal(exemplar.seq)}
            className="rounded border border-[#5b3fa3] px-2 py-0.5 text-[9px] font-semibold text-[#5b3fa3] hover:bg-[#f3effb]"
            title="Appeals the single exemplar claim that covers the pattern — not every claim in the cluster. The config-reprocess route is what recovers the remaining cluster claims."
          >
            Draft exemplar appeal
          </button>
        ))}

      <span className="text-[8px] italic text-carbon-gray-40">
        Exemplar appeal covers the pattern; the reprocess route recovers the remaining {p.count}{' '}
        cluster claims — not “found {p.count} → appealed {p.count}”.
      </span>
    </div>
  );
}
