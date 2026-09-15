/**
 * TwinLadderBadge (Phase A — Golden Thread guided surface). A compact three-chip
 * footer for a stage card: the stage's EVIDENCE tier, the owning AGENT, and the
 * authority-rung CEILING that tier permits. Presentational; the tier→rung ceiling
 * is computed upstream (threadStageView) from the real TIER_RUNG_CEILING and passed
 * in — this component renders, it does not govern.
 *
 * SERVER COMPONENT: no hooks/handlers. Deep type import (not the '@/lib/evidence'
 * barrel → node:crypto).
 *
 * PHI DISCIPLINE: tiers, rungs, and an agent label only — never member data.
 */
import StatusBadge from '@/components/ui/StatusBadge';
import type { EvidenceTier, AuthorityRung } from '@/lib/evidence/tierConfig';

type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';

/** Tier → chip variant (weakest D0 → strongest D3). Mirrors EvidenceTimeline. */
const TIER_VARIANT: Record<EvidenceTier, StatusVariant> = {
  D0: 'neutral',
  D1: 'info',
  D2: 'purple',
  D3: 'success',
};

/** Rung → chip variant (weakest A0 → strongest A3). */
const RUNG_VARIANT: Record<AuthorityRung, StatusVariant> = {
  A0: 'neutral',
  A1: 'info',
  A2: 'purple',
  A3: 'success',
};

export function TwinLadderBadge({
  tier,
  agent,
  rung,
}: {
  tier?: EvidenceTier;
  agent: string;
  rung?: AuthorityRung;
}): React.ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" aria-label="Twin-ladder stage badge">
      {tier ? (
        <span title={`Evidence tier ${tier}`}>
          <StatusBadge label={tier} variant={TIER_VARIANT[tier]} size="sm" />
        </span>
      ) : (
        <span className="rounded bg-carbon-gray-10 px-1.5 py-0.5 text-2xs font-medium text-carbon-gray-50">
          no evidence yet
        </span>
      )}
      <span className="rounded bg-carbon-gray-10 px-1.5 py-0.5 text-2xs font-medium text-carbon-gray-70">
        {agent}
      </span>
      {rung ? (
        <span className="font-mono" title={`Authority ceiling ${rung}`}>
          <StatusBadge label={rung} variant={RUNG_VARIANT[rung]} size="sm" />
        </span>
      ) : null}
    </div>
  );
}
