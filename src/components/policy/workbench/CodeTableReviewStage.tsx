'use client';

/**
 * Code-table review stage — product → procedure → code rows with confidence-threshold flagging and
 * accept/remove. Extracted from PolicyDtrWorkbench for the size cap; a thin renderer driven by props.
 */
import type { PolicyReview } from '@/lib/policy/policyReview';
import { confidenceClass, codeKey, type ReviewState } from './workbenchParts';

export function CodeTableReviewStage({
  review,
  threshold,
  setThreshold,
  reviewState,
  setSt,
  flagged,
  snippetFor,
  submittable,
  onSubmit,
}: {
  review: PolicyReview;
  threshold: number;
  setThreshold: (n: number) => void;
  reviewState: Record<string, ReviewState>;
  setSt: (k: string, s: ReviewState) => void;
  flagged: { total: number; reviewed: number };
  snippetFor: (code: string) => string | undefined;
  submittable: boolean;
  onSubmit: () => void;
}): React.ReactElement {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-slate-600">Review threshold (confidence ≤)</span>
          <input
            type="range"
            min={0}
            max={100}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
          <span className="w-8 font-mono">{threshold}</span>
        </label>
        <span className="text-xs text-slate-500">
          Reviewed {flagged.reviewed}/{flagged.total} flagged rows
        </span>
      </div>
      {review.productSections?.map((section) => (
        <section key={section.product} className="rounded-lg border border-slate-200">
          <h3 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold">
            {section.product}
          </h3>
          <div className="divide-y divide-slate-100">
            {section.procedures.map((proc) => (
              <div key={proc.procedure} className="p-3">
                <p className="mb-2 text-sm font-medium text-slate-700">{proc.procedure}</p>
                <div className="space-y-1">
                  {proc.codes.map((c, i) => {
                    const k = codeKey(section.product, proc.procedure, c.code, i);
                    const st = reviewState[k] ?? 'pending';
                    const isFlagged = (c.confidence ?? 100) <= threshold;
                    return (
                      <div
                        key={k}
                        className={`flex items-start gap-2 rounded p-1.5 text-sm ${
                          st === 'flagged'
                            ? 'bg-rose-50'
                            : st === 'accepted'
                              ? 'bg-emerald-50/40'
                              : isFlagged
                                ? 'bg-amber-50'
                                : ''
                        }`}
                      >
                        <span className="mt-0.5 font-mono font-medium">{c.code}</span>
                        <span className="mt-0.5 text-xs text-slate-400">{c.codeSystem}</span>
                        <span className="flex-1 text-slate-600">
                          {c.description}
                          {snippetFor(c.code) && (
                            <span className="mt-0.5 block text-xs italic text-slate-400">
                              source: “{snippetFor(c.code)}”
                            </span>
                          )}
                        </span>
                        <span
                          className={`whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${confidenceClass(
                            c.confidence
                          )}`}
                        >
                          {c.confidence === null ? 'n/a' : `${c.confidence}%`}
                        </span>
                        <span className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setSt(k, 'accepted')}
                            className={`rounded border px-1.5 py-0.5 text-xs ${
                              st === 'accepted'
                                ? 'border-emerald-400 bg-emerald-100 text-emerald-800'
                                : 'border-slate-300 text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => setSt(k, 'flagged')}
                            className={`rounded border px-1.5 py-0.5 text-xs ${
                              st === 'flagged'
                                ? 'border-rose-400 bg-rose-100 text-rose-800'
                                : 'border-slate-300 text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            Remove
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      <section className="flex items-center gap-3 rounded-lg border border-slate-300 bg-slate-50 p-4">
        <span className="text-xs text-slate-500">
          {submittable
            ? 'All flagged rows reviewed — ready for sign-off.'
            : `Review the ${flagged.total - flagged.reviewed} remaining flagged row(s).`}
        </span>
        <button
          type="button"
          disabled={!submittable}
          onClick={onSubmit}
          className="ml-auto rounded bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
        >
          Submit for sign-off →
        </button>
      </section>
    </>
  );
}
