'use client';

/**
 * Promote stage body (policy-expert facing) — the operational conclusion of authoring.
 *
 * Promotion is NOT "live now": the signed-off policy is stamped as an immutable version and QUEUED
 * into the next release window with a future effective date (advance provider notice). This renders
 * the pre-submit prompt and, once submitted, the release-summary card (version, window, effective
 * date, change id, maker/checker sign-off, queued stakeholder notifications, rollback affordance).
 * Presentation only — the {@link ReleaseSummary} is derived in the tested `workflow/release` module.
 */
import type { PolicyReview } from '@/lib/policy/policyReview';
import type { ReleaseSummary } from '@/lib/policy/workflow/release';

export function PromoteStage({
  review,
  release,
  onSubmit,
  showRollback,
  onToggleRollback,
}: {
  review: PolicyReview;
  release: ReleaseSummary | null;
  onSubmit: () => void;
  showRollback: boolean;
  onToggleRollback: () => void;
}): React.ReactElement {
  if (!release) {
    return (
      <section className="space-y-3 rounded-lg border border-slate-300 bg-slate-50 p-4">
        <h3 className="text-sm font-semibold">Promote to production</h3>
        <p className="text-sm text-slate-600">
          Stamp the signed-off policy as an immutable version and submit it to the change-control
          queue{review.tenant ? ` for ${review.tenant}` : ''}. It is scheduled into the next release
          window with advance provider notice — coverage does not change the instant you click.
        </p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            Signed off and ready to submit for release.
          </span>
          <button
            type="button"
            onClick={onSubmit}
            className="ml-auto rounded bg-blue-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-blue-700"
          >
            Submit for release
          </button>
        </div>
      </section>
    );
  }

  const cards = [
    { k: 'Version', v: release.version },
    { k: 'Release window', v: release.releaseWindow },
    { k: `Effective (${release.noticeDays}-day notice)`, v: release.effectiveDate },
    { k: 'Supersedes', v: release.supersedes ?? 'initial release' },
  ];

  return (
    <section className="space-y-4 rounded-lg border border-emerald-300 bg-emerald-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] text-white">
              ✓
            </span>
            Release scheduled — not yet live
          </h3>
          <p className="mt-1 text-xs text-slate-600">
            {review.guidelineId ?? 'Policy'} <b>v{release.version}</b> is queued for the next
            release window. Coverage takes effect on the effective date after provider notice.
          </p>
        </div>
        <span className="whitespace-nowrap rounded bg-white px-2 py-1 font-mono text-[11px] text-slate-600 shadow-sm">
          {release.changeId}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c) => (
          <div key={c.k} className="rounded border border-emerald-200 bg-white px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wide text-slate-400">{c.k}</div>
            <div className="mt-0.5 text-xs font-semibold text-slate-700">{c.v}</div>
          </div>
        ))}
      </div>

      <div className="rounded border border-emerald-200 bg-white px-3 py-2.5">
        <div className="text-[10px] uppercase tracking-wide text-slate-400">
          Two-person sign-off (on the change record)
        </div>
        <div className="mt-1 text-xs text-slate-700">
          Submitted by <b>{release.submittedBy ?? '—'}</b> · Approved by{' '}
          <b>{release.approvedBy ?? '—'}</b>
        </div>
      </div>

      <div className="rounded border border-emerald-200 bg-white px-3 py-2.5">
        <div className="text-[10px] uppercase tracking-wide text-slate-400">
          Release notifications · queued
        </div>
        <ul className="mt-1.5 space-y-1">
          {release.notifications.map((n) => (
            <li key={n.team} className="flex gap-2 text-xs text-slate-600">
              <span className="font-semibold text-slate-700">{n.team}</span>
              <span className="text-slate-400">—</span>
              <span>{n.reason}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-slate-500">
          The change record is immutable and audited. The CRD→DTR→PAS flow serves this version on
          its effective date.
        </span>
        <button
          type="button"
          onClick={onToggleRollback}
          className="ml-auto rounded border border-slate-300 bg-white px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
        >
          Roll back…
        </button>
      </div>
      {showRollback && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
          A published version is immutable, so rollback does not delete it — it opens a new change
          that re-activates the prior live version (or pulls this one from the release queue before
          its effective date) and requires its own maker→checker sign-off and provider-notice
          handling.
        </p>
      )}
    </section>
  );
}

export default PromoteStage;
