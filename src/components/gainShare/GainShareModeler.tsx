'use client';
/**
 * GainShareModeler — the MODELLED half of gain-share, now a THIN shell composing four child panels
 * (LanRungPicker · LeversRail · SplitOutputPanel · RebasingScenarioPanel) so no file breaches the cap.
 * The TCOC shared-savings wedge is illustrative (the sim has no attribution / risk-adjusted benchmark /
 * run-out), so every actuarial input is HELD CONSTANT and labelled, the ladder is the HCP-LAN taxonomy,
 * gating is real Medicaid logic (minimum savings rate + quality gate + two-sided downside/stop-loss),
 * and a governance chip states splits can't move without actuarial certification + CMS 438.6(c) approval.
 *
 * The one REAL number on this board — payment-integrity recovery — is carried in from the pinned recon
 * epoch and shown QUARANTINED (already in the MLR numerator; never part of the split). One shared epoch.
 *
 * CLIENT-SAFE: pure economics + shared sim only. No `@/lib/evidence` barrel, no node:crypto.
 */
import { useMemo, useState } from 'react';
import {
  defaultModel,
  computeVbcScenario,
  type ContractModel,
  type LanTierId,
  type RecoveryRoi,
} from '@/lib/gainShare/gainShareEconomics';
import { LanRungPicker } from '@/components/gainShare/LanRungPicker';
import { LeversRail } from '@/components/gainShare/LeversRail';
import { SplitOutputPanel } from '@/components/gainShare/SplitOutputPanel';
import { RebasingScenarioPanel, type Slot } from '@/components/gainShare/RebasingScenarioPanel';

/** `recovery` is the SAME pinned RecoveryRoi the ROI panel shows — one shared epoch, passed by the parent. */
export function GainShareModeler({ recovery }: { recovery: RecoveryRoi }): React.ReactElement {
  const [model, setModel] = useState<ContractModel>(() => defaultModel('cat3a'));
  const [saved, setSaved] = useState<Partial<Record<Slot, ContractModel>>>({});
  const v = useMemo(() => computeVbcScenario(model), [model]);
  const set = <K extends keyof ContractModel>(k: K, val: ContractModel[K]): void =>
    setModel((m) => ({ ...m, [k]: val }));
  const pickTier = (id: LanTierId): void => setModel(defaultModel(id));

  return (
    <section className="space-y-4 rounded-lg border border-carbon-gray-20 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Gain-share scenario modeler · illustrative</h2>
          <p className="text-[11px] text-carbon-gray-60">
            TCOC shared savings on a risk-adjusted benchmark. Every VBC figure below is modelled;
            the quarantined payment-integrity figure is real (already in the MLR numerator).
            Actuarial inputs are held constant.
          </p>
        </div>
        <span
          className="rounded border border-[#d4bbff] bg-[#f6f2ff] px-2 py-1 text-[10px] font-semibold text-[#6929c4]"
          title="This is pre-certification scenario modelling"
        >
          ⚖ Pre-certification — splits require actuarial certification (438.4 / 438.7) + CMS
          438.6(c) approval
        </span>
      </div>

      <LanRungPicker activeTierId={model.tierId} tierNote={v.tier.note} onPick={pickTier} />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <LeversRail model={model} v={v} onSet={set} />
        <div className="space-y-3">
          <SplitOutputPanel v={v} recovery={recovery} />
          <RebasingScenarioPanel
            model={model}
            v={v}
            saved={saved}
            onSave={(slot) => setSaved((sv) => ({ ...sv, [slot]: model }))}
          />
        </div>
      </div>
    </section>
  );
}
