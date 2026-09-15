/**
 * GoldenThreadSurface (Phase A — Golden Thread guided reviewer surface). The composed
 * surface: a scenario/policy picker and the ordered stage cards on the left, the sticky
 * Evidence Record rail on the right, and the shift-left baseline, the recovery-policy
 * simulator, and the policy comparison below.
 *
 * SERVER COMPONENT: it holds the full `CashResult` (member-resident) server-side and
 * renders client leaves (picker, simulator, comparison) as children — so no
 * member-embedding record is serialized to the browser. The masked evidence id and the
 * PHI-safe summaries are all that reach the client.
 *
 * PHI DISCIPLINE: the recovery work-item id is forwarded only to the decision panel
 * (never rendered); everything else is codes / amounts / refs / verdicts.
 */
import type { CashResult } from '@/lib/goldenThread/orderToCash';
import type { AutonomyTier } from '@/lib/agents/manifest/types';
import { buildStageModels } from '@/lib/goldenThread/threadStageView';
import { ScenarioPolicyPicker } from './ScenarioPolicyPicker';
import { StagePanel } from './StagePanel';
import { EvidenceRail } from './EvidenceRail';
import { ShiftLeftPanel } from './ShiftLeftPanel';
import { SimulationConsole } from './SimulationConsole';
import { PolicyCompare } from './PolicyCompare';
import type { EvidenceIntegrity } from './EvidenceTimeline';

interface Option {
  id: string;
  label: string;
}

export function GoldenThreadSurface({
  cash,
  recoveryWorkItemId,
  scenarioId,
  presetId,
  scenarios,
  presets,
  memberLabel,
  presetAutonomyTier,
  integrity,
}: {
  cash: CashResult;
  recoveryWorkItemId?: string;
  scenarioId: string;
  presetId: string;
  scenarios: ReadonlyArray<Option>;
  presets: ReadonlyArray<Option>;
  memberLabel: string;
  presetAutonomyTier: AutonomyTier;
  integrity?: EvidenceIntegrity;
}): React.ReactElement {
  const models = buildStageModels(cash);
  // The headline stage: recovery when one was proposed, else the reconciliation finding.
  const activeKey = cash.recovery ? 'recovery' : 'reconciliation';

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <ScenarioPolicyPicker
            scenarioId={scenarioId}
            presetId={presetId}
            scenarios={scenarios}
            presets={presets}
            memberLabel={memberLabel}
            order={{
              code: cash.evidence.order.code,
              ...(cash.evidence.order.display ? { display: cash.evidence.order.display } : {}),
            }}
          />

          {models.map((model, i) =>
            model.present ? (
              <StagePanel
                key={model.key}
                model={model}
                index={i + 1}
                active={model.key === activeKey}
                order={cash.evidence.order}
                memberLabel={memberLabel}
                necessityVm={cash.medicalNecessity.vm}
                eligibility={cash.eligibility}
                estimate={cash.estimate}
                {...(cash.reconciliation ? { reconciliation: cash.reconciliation } : {})}
                {...(cash.recovery ? { recovery: cash.recovery } : {})}
                {...(cash.currentTier ? { currentTier: cash.currentTier } : {})}
                manifestTier={presetAutonomyTier}
                {...(recoveryWorkItemId ? { recoveryWorkItemId } : {})}
                goldCardApplied={cash.summary.goldCardApplied}
              />
            ) : null
          )}
        </div>

        <EvidenceRail record={cash.evidence} integrity={integrity} activeStageKey={activeKey} />
      </div>

      <ShiftLeftPanel />
      <SimulationConsole />
      <PolicyCompare />
    </div>
  );
}
