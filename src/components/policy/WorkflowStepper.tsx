'use client';

/**
 * Workflow stepper (presentational). Renders the five authoring stages and their status from the
 * pure {@link stageStatus} decision — locked stages are non-clickable. All gating lives in the tested
 * `@/lib/policy/workflow/stageflow` module; this is a thin renderer.
 */
import {
  STAGES,
  stageStatus,
  type StageStatus,
  type WorkbenchStage,
  type WorkbenchState,
} from '@/lib/policy/workflow/stageflow';

const badgeClass: Record<StageStatus, string> = {
  done: 'border-emerald-500 bg-emerald-100 text-emerald-700',
  active: 'border-blue-600 bg-blue-600 text-white',
  todo: 'border-slate-300 bg-white text-slate-400',
  locked: 'border-slate-200 bg-slate-50 text-slate-300',
};

const titleClass: Record<StageStatus, string> = {
  done: 'text-slate-700',
  active: 'text-blue-700',
  todo: 'text-slate-700',
  locked: 'text-slate-400',
};

export function WorkflowStepper({
  state,
  active,
  onGo,
}: {
  state: WorkbenchState;
  active: WorkbenchStage;
  onGo: (stage: WorkbenchStage) => void;
}): React.ReactElement {
  return (
    <nav className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1.5">
      {STAGES.map((s) => {
        const st = stageStatus(state, s.stage, active);
        const locked = st === 'locked';
        return (
          <button
            key={s.stage}
            type="button"
            disabled={locked}
            aria-current={st === 'active' ? 'step' : undefined}
            onClick={() => {
              if (!locked) onGo(s.stage);
            }}
            className={`flex min-w-[140px] flex-1 items-center gap-2 rounded-md px-3 py-2 text-left transition ${
              st === 'active' ? 'bg-white shadow-sm' : ''
            } ${locked ? 'cursor-not-allowed opacity-60' : 'hover:bg-white'}`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${badgeClass[st]}`}
            >
              {st === 'done' ? '✓' : locked ? '🔒' : s.index + 1}
            </span>
            <span className="min-w-0">
              <span className={`block text-xs font-semibold leading-tight ${titleClass[st]}`}>
                {s.title}
              </span>
              <span className="block text-[10px] leading-tight text-slate-400">{s.blurb}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export default WorkflowStepper;
