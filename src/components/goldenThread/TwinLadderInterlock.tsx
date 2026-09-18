/**
 * TwinLadderInterlock — Wave-5 UI. Presentational visualization of the Twin-Ladder
 * governance interlock for a recovery action. It shows the two ladders side by side:
 *
 *   EVIDENCE ladder  D0 → D3   (how strong / contestable the evidence is)
 *   AUTHORITY ladder A0 → A3   (how much the agent may act without a human)
 *
 * and the INTERLOCK between them: the permitted authority rung is the WEAKEST LINK
 *   permittedRung = min( AUTONOMY_RUNG[manifestTier], TIER_RUNG_CEILING[evidenceTier] )
 *
 * This component computes NOTHING of its own governance: it IMPORTS the real
 * `permittedRung`, `AUTONOMY_RUNG` and `TIER_RUNG_CEILING` and displays them, and it
 * renders the agent-stamped `grantedRung` as given (single-sourced from the recovery
 * outcome). Two honest invariants are stated in the UI so the picture cannot be
 * misread: (1) the ledger SEAL is integrity/provenance only and NEVER lifts the tier;
 * (2) a payer-facing SUBMISSION is human-gated regardless of rung
 * (`requiresHumanForSubmission` is always true).
 *
 * PHI DISCIPLINE: renders tiers, rungs and codes only — no memberId, name, or id.
 */
// Deep import (not the '@/lib/evidence' barrel): this component is pulled into a client
// bundle (SimulationConsole), and the barrel re-exports ledgerIntegrity → node:crypto.
import {
  TIER_RUNG_CEILING,
  type EvidenceTier,
  type AuthorityRung,
} from '@/lib/evidence/tierConfig';
import { AUTONOMY_RUNG, permittedRung } from '@/lib/agents/governance/interlock';

const EVIDENCE_TIERS: readonly EvidenceTier[] = ['D0', 'D1', 'D2', 'D3'];
const AUTHORITY_RUNGS: readonly AuthorityRung[] = ['A0', 'A1', 'A2', 'A3'];

const TIER_MEANING: Record<EvidenceTier, string> = {
  D0: 'Fragmented / raw',
  D1: 'Conformed',
  D2: 'Reconciled / contestable',
  D3: 'Settlement-grade',
};
const RUNG_MEANING: Record<AuthorityRung, string> = {
  A0: 'Assist only',
  A1: 'Human-in-the-loop',
  A2: 'Human-on-the-loop',
  A3: 'Autonomous',
};

/** Ordinal for display comparison only (which source is the binding constraint). */
const RUNG_ORDINAL: Record<AuthorityRung, number> = { A0: 0, A1: 1, A2: 2, A3: 3 };

export interface TwinLadderInterlockProps {
  /** The freshly recomputed weakest-link process tier at the recovery-authority check. */
  evidenceTier: EvidenceTier;
  /** The recovery agent's manifest autonomy tier (a key of AUTONOMY_RUNG). */
  manifestTier: keyof typeof AUTONOMY_RUNG;
  /** The rung the governed agent actually stamped (recovery.rung) — single source. */
  grantedRung: AuthorityRung;
  /** FIX-1: always true — a payer-facing submission is human-gated regardless of rung. */
  requiresHumanForSubmission: boolean;
}

function Ladder<T extends string>({
  title,
  steps,
  active,
  meaning,
  activeClass,
}: {
  title: string;
  steps: readonly T[];
  active: T;
  meaning: Record<T, string>;
  activeClass: string;
}): React.ReactElement {
  return (
    <div className="flex-1">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-carbon-gray-50">
        {title}
      </p>
      <ol className="flex flex-col-reverse gap-1" aria-label={title}>
        {steps.map((s) => {
          const isActive = s === active;
          return (
            <li
              key={s}
              aria-current={isActive ? 'step' : undefined}
              className={`flex items-baseline justify-between rounded border px-3 py-1.5 text-sm ${
                isActive ? activeClass : 'border-carbon-gray-20 bg-white text-carbon-gray-50'
              }`}
            >
              <span className="font-mono font-semibold">{s}</span>
              <span className="text-xs">{meaning[s]}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function TwinLadderInterlock({
  evidenceTier,
  manifestTier,
  grantedRung,
  requiresHumanForSubmission,
}: TwinLadderInterlockProps): React.ReactElement {
  // The governance model — imported, not reimplemented.
  const autonomyGrant = AUTONOMY_RUNG[manifestTier];
  const evidenceCeiling = TIER_RUNG_CEILING[evidenceTier];
  const permitted = permittedRung(manifestTier, evidenceTier);
  const cappedByEvidence = RUNG_ORDINAL[evidenceCeiling] < RUNG_ORDINAL[autonomyGrant];

  return (
    <section
      className="space-y-4 rounded-lg border border-carbon-gray-20 p-4"
      aria-label="Twin-Ladder governance interlock"
    >
      <div>
        <h3 className="text-sm font-semibold">Twin-Ladder interlock</h3>
        <p className="mt-0.5 text-xs text-carbon-gray-50">
          Evidence strength gates agent authority. The permitted rung is the weakest link of the two
          ladders — evidence can only ever cap authority, never raise it.
        </p>
      </div>

      <div className="flex items-stretch gap-4">
        <Ladder
          title="Evidence tier"
          steps={EVIDENCE_TIERS}
          active={evidenceTier}
          meaning={TIER_MEANING}
          activeClass="border-carbon-blue bg-carbon-blue-lighter text-carbon-blue font-medium"
        />
        <div className="flex items-center px-1 text-carbon-gray-30" aria-hidden="true">
          →
        </div>
        <Ladder
          title="Authority rung"
          steps={AUTHORITY_RUNGS}
          active={grantedRung}
          meaning={RUNG_MEANING}
          activeClass="border-carbon-yellow bg-carbon-yellow-light text-[#b45309] font-medium"
        />
      </div>

      <div className="rounded border border-carbon-gray-20 bg-carbon-gray-10 p-3 text-xs text-carbon-gray-70">
        <p>
          Autonomy ladder grants <span className="font-mono font-semibold">{autonomyGrant}</span>{' '}
          for a <span className="font-semibold">{manifestTier}</span> agent; evidence at{' '}
          <span className="font-mono font-semibold">{evidenceTier}</span> caps authority at{' '}
          <span className="font-mono font-semibold">{evidenceCeiling}</span>. Permitted ={' '}
          <span className="font-mono font-semibold">{permitted}</span>{' '}
          {cappedByEvidence
            ? '(evidence is the binding constraint)'
            : '(autonomy is the binding constraint)'}
          .
        </p>
        <p className="mt-2">
          A payer-facing submission is{' '}
          <span className="font-semibold">
            {requiresHumanForSubmission ? 'human-gated regardless of rung' : 'not human-gated'}
          </span>{' '}
          — the agent may draft, never auto-submit. The ledger seal is tamper-evidence only and does
          not change the tier.
        </p>
      </div>
    </section>
  );
}
