/**
 * ReconciliationMoneyShot (Phase A — Golden Thread guided surface). The headline
 * reconciliation visual: contracted-allowed (expected) vs payer-paid (actual) vs the
 * Δ, the computed verdict, and — when the reconciliation produced a contestable finding
 * — an HONEST twin-ladder callout.
 *
 * WEAKEST-LINK HONESTY (adversarial fix): the reconciliation FINDING is D2 (contestable),
 * and that is what makes the shortfall recoverable. But the recovery agent's authority is
 * gated by the PROCESS tier (`currentTier` = computeProcessTier, the weakest decision-
 * critical link), NOT by this single finding. So the callout distinguishes the two: it
 * names the finding tier (`liftsTierTo`) and then states the process tier that actually
 * governs the recovery rung (`currentTier` → `TIER_RUNG_CEILING[currentTier]`). This
 * removes the earlier contradiction where the money-shot implied "A2 unlocked" while the
 * recovery card below correctly showed the process tier capping authority to A1. All tiers
 * and rungs are read from the REAL values — nothing is asserted.
 *
 * SERVER COMPONENT (no hooks). Deep import for the tier/rung config (not the
 * '@/lib/evidence' barrel → node:crypto).
 *
 * PHI DISCIPLINE: amounts + verdict only.
 */
import StatusBadge from '@/components/ui/StatusBadge';
import { TIER_RUNG_CEILING, type EvidenceTier } from '@/lib/evidence/tierConfig';
import type { ReconcileResult, ReconcileVerdict } from '@/lib/goldenThread/reconciliation';

type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';

const VERDICT_VARIANT: Record<ReconcileVerdict, StatusVariant> = {
  matched: 'success',
  underpaid: 'purple',
  overpaid: 'warning',
  'not-recoverable': 'danger',
  indeterminate: 'neutral',
};

const money = (n: number): string =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Tile({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: string;
  tone?: 'slate' | 'green' | 'amber';
}): React.ReactElement {
  const toneCls = {
    slate: 'border-carbon-gray-20 bg-white',
    green: 'border-carbon-green bg-carbon-green-light',
    amber: 'border-carbon-yellow bg-carbon-yellow-light',
  }[tone];
  return (
    <div className={`rounded border p-3 ${toneCls}`}>
      <p className="text-[11px] uppercase tracking-wide text-carbon-gray-50">{label}</p>
      <p className="mt-0.5 text-lg font-semibold">{value}</p>
    </div>
  );
}

export function ReconciliationMoneyShot({
  reconciliation,
  currentTier,
}: {
  reconciliation: ReconcileResult;
  currentTier?: EvidenceTier;
}): React.ReactElement {
  const { verdict, contractedAllowed, paidAmount, delta } = reconciliation;
  const matched = verdict === 'matched';
  const deltaTone: 'green' | 'amber' = matched || delta === 0 ? 'green' : 'amber';
  // The reconciliation produced a contestable finding (D2 or better on the finding itself).
  const findingTier = reconciliation.liftsTierTo;
  const contestableFinding = findingTier === 'D2' || findingTier === 'D3';
  // The PROCESS tier is what actually gates the recovery agent's authority (weakest link).
  const processCeiling = currentTier ? TIER_RUNG_CEILING[currentTier] : undefined;

  return (
    <section
      className="space-y-3 rounded-lg border border-carbon-gray-20 p-4"
      aria-label="Reconciliation"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Reconciliation — 835 vs contracted</h3>
        <StatusBadge label={verdict} variant={VERDICT_VARIANT[verdict]} size="md" />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Tile label="Allowed (expected)" value={money(contractedAllowed)} />
        <Tile label="Paid (actual)" value={money(paidAmount)} />
        <Tile label="Δ (payer-owed − paid)" value={money(delta)} tone={deltaTone} />
      </div>

      {contestableFinding ? (
        <p className="rounded border border-[#d4bbff] bg-[#f6f2ff] p-2 text-xs text-[#6929c4]">
          Reconciled finding is <span className="font-mono font-semibold">{findingTier}</span>{' '}
          (contestable) — the shortfall is recoverable.
          {currentTier ? (
            <>
              {' '}
              Recovery authority is gated by the <em>process</em> tier{' '}
              <span className="font-mono font-semibold">{currentTier}</span> (twin-ladder weakest
              link) → ceiling <span className="font-mono font-semibold">{processCeiling}</span>; see
              the interlock on the Recovery card.
            </>
          ) : null}{' '}
          Any payer-facing submission stays human-gated.
        </p>
      ) : (
        <p className="text-xs text-carbon-gray-50">
          Tolerance applied ${reconciliation.toleranceApplied.toFixed(2)} · member liability{' '}
          {reconciliation.memberLiability}.
        </p>
      )}
    </section>
  );
}
