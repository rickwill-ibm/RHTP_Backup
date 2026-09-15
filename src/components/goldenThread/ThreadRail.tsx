/**
 * ThreadRail — Wave-5 UI. A presentational, self-contained status rail for the
 * FULL golden thread (clinical clearance → cash cycle). The existing `StageRail`
 * is bound to the four `FC_STAGES` (Eligibility → Patient Estimation); this rail
 * additively renders the whole eight-stage thread through the cash continuation
 * (Claim · Remittance · Reconciliation · Recovery) without touching FC_STAGES.
 *
 * It computes nothing: the caller passes each stage's state. Purely visual.
 */
export type ThreadStageState = 'done' | 'current' | 'skipped' | 'pending';

export interface ThreadStage {
  label: string;
  state: ThreadStageState;
}

const STATE_CLASS: Record<ThreadStageState, string> = {
  current: 'border-carbon-yellow bg-carbon-yellow-light text-[#b45309]',
  done: 'border-carbon-green bg-carbon-green-light text-[#0e6027]',
  skipped: 'border-carbon-gray-20 bg-carbon-gray-10 text-carbon-gray-50 line-through',
  pending: 'border-carbon-gray-20 bg-white text-carbon-gray-50',
};

export function ThreadRail({ stages }: { stages: readonly ThreadStage[] }): React.ReactElement {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Golden thread stages">
      {stages.map((s, i) => (
        <li key={s.label} className="flex items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-medium ${STATE_CLASS[s.state]}`}
          >
            {i + 1}. {s.label}
            {s.state === 'done' ? ' ✓' : ''}
          </span>
          {i < stages.length - 1 ? <span className="text-carbon-gray-30">→</span> : null}
        </li>
      ))}
    </ol>
  );
}
