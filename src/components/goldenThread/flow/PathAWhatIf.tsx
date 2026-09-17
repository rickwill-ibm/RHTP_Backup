'use client';
/**
 * PathAWhatIf — an interactive Twin-Ladder scenario explorer for a stage's governance detail. The
 * reviewer drags the evidence tier (D0–D3) and the agent's manifest autonomy (HITL/HOTL/autonomous)
 * and watches the PERMITTED rung recompute — through the SAME `verdict()` / `permittedRung()` the
 * engine uses, never a copied ladder. It writes NOTHING to the sim or the ledger: the stage's sealed
 * verdict above is unchanged; this is a hypothetical.
 *
 * HONESTY — the gate is preserved, not dropped: a stage that is inherently a payer-facing SUBMISSION
 * or an ADVERSE action stays human-gated at EVERY tier (we recover that gate from the stage's own
 * sealed reason and feed the real predicate into `verdict`), so the what-if can never show a
 * submission as auto-executable — it teaches the real interlock, not a rosier one.
 *
 * CLIENT-SAFE: reuses the already-client-safe `verdict` + `TwinLadderInterlock`; no barrel, no node.
 */
import { useState } from 'react';
import { verdict, type FlowStage } from '@/lib/goldenThread/e2eFlow';
import { stageGate } from '@/lib/goldenThread/stageGovernance';
import type { AutonomyTier } from '@/lib/agents/manifest/types';
import type { EvidenceTier } from '@/lib/evidence/tierConfig';
import { TwinLadderInterlock } from '@/components/goldenThread/TwinLadderInterlock';

const EVIDENCE: readonly EvidenceTier[] = ['D0', 'D1', 'D2', 'D3'];
const AUTONOMY: readonly AutonomyTier[] = ['HITL', 'HOTL', 'autonomous'];

export function PathAWhatIf({ stage }: { stage: FlowStage }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [manifest, setManifest] = useState<AutonomyTier>(stage.verdict.manifestTier);
  const [evidence, setEvidence] = useState<EvidenceTier>(stage.verdict.evidenceTier);
  // Structured gate keyed by StageKey (mirrors e2eFlow's real actionType/adverse) — NOT parsed from
  // the display reason, so a reword can never silently drop a stage's human gate.
  const gate = stageGate(stage.key);
  const v = verdict(manifest, evidence, gate);
  const inherentlyGated = gate.adverse || gate.actionType !== '';

  return (
    <div className="mt-3 rounded border border-carbon-gray-20 bg-carbon-gray-10 p-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-carbon-gray-60">
          {open ? '▾' : '▸'} What-if: explore the Twin-Ladder interlock
        </span>
        <span className="rounded bg-carbon-yellow-light px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#b45309]">
          hypothetical
        </span>
      </button>

      {open && (
        <div className="mt-2">
          <p className="mb-2 text-[10px] italic text-carbon-gray-50">
            Hypothetical — does not alter the governed run; the sealed verdict above is unchanged.
            Recomputes through the real interlock (the weakest link caps authority).
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1 text-[10px] font-semibold text-carbon-gray-60">
              Evidence tier
              <select
                value={evidence}
                onChange={(e) => setEvidence(e.target.value as EvidenceTier)}
                className="rounded border border-carbon-gray-30 bg-white px-1 py-0.5 text-[11px] normal-case text-carbon-gray-90"
              >
                {EVIDENCE.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1 text-[10px] font-semibold text-carbon-gray-60">
              Agent autonomy
              <select
                value={manifest}
                onChange={(e) => setManifest(e.target.value as AutonomyTier)}
                className="rounded border border-carbon-gray-30 bg-white px-1 py-0.5 text-[11px] normal-case text-carbon-gray-90"
              >
                {AUTONOMY.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="mt-2 text-[11px] text-carbon-gray-80">{v.reason}</p>
          {inherentlyGated && (
            <p className="mt-0.5 text-[10px] font-semibold text-[#b45309]">
              This stage is inherently{' '}
              {gate.adverse ? 'an adverse action' : 'a payer-facing submission'} — human-gated at
              every tier, even autonomous · D3.
            </p>
          )}

          <div className="mt-2">
            <TwinLadderInterlock
              evidenceTier={evidence}
              manifestTier={manifest}
              grantedRung={v.permittedRung}
              requiresHumanForSubmission={v.requiresHuman}
            />
          </div>
        </div>
      )}
    </div>
  );
}
