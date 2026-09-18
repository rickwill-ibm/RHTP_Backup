/**
 * ShiftLeftPanel (#501) — the CITED denial / PA baseline panel.
 *
 * Grounds the shift-left framing in published, defensible industry baselines
 * (KFF / CAQH / JAMA / CMS-0057-F), each carrying its source tag. Decision-support
 * only — it states plainly that these are cited industry figures, not a guarantee
 * and not this deployment's book of business. Presentational; all figures come
 * from the single source of truth in `@/lib/policy/denialBaselines`.
 *
 * PHI-safe: renders population statistics only, no member data.
 */
import {
  DENIAL_BASELINES,
  CMS_0057F_MILESTONES,
  SHIFT_LEFT_FRAMING,
} from '@/lib/policy/denialBaselines';

export function ShiftLeftPanel(): React.ReactElement {
  return (
    <section
      className="space-y-4 rounded-lg border border-carbon-gray-20 p-4"
      aria-label="Denial baseline (shift-left decision support)"
    >
      <div>
        <h2 className="text-lg font-semibold">Why shift denial prevention left</h2>
        <p className="mt-0.5 text-xs text-carbon-gray-50">{SHIFT_LEFT_FRAMING}</p>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {DENIAL_BASELINES.map((b) => (
          <li
            key={b.id}
            className="rounded border border-carbon-gray-20 bg-carbon-gray-10 p-3 text-sm"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold">{b.value}</span>
              <span className="rounded bg-carbon-gray-20 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-carbon-gray-70">
                {b.source}
              </span>
            </div>
            <p className="mt-0.5 text-carbon-gray-70">{b.label}</p>
            {b.note ? <p className="mt-0.5 text-xs text-carbon-gray-50">{b.note}</p> : null}
          </li>
        ))}
      </ul>

      <div className="rounded border border-carbon-blue-light bg-carbon-blue-lighter p-3 text-xs text-carbon-blue">
        <p className="font-semibold">CMS-0057-F compliance horizon</p>
        <ul className="mt-1 space-y-1">
          {CMS_0057F_MILESTONES.map((m) => (
            <li key={m.id}>
              <span className="font-mono">{m.effective.slice(0, 10)}</span> — {m.label}{' '}
              <span className="text-carbon-blue">({m.source})</span>
              {m.note ? <span className="block text-[11px] text-carbon-blue">{m.note}</span> : null}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[11px] italic text-carbon-gray-50">
        Baselines inform where to intervene (eligibility, medical necessity, and PA at the point of
        order); they are not a determination and do not predict an individual claim outcome.
      </p>
    </section>
  );
}
