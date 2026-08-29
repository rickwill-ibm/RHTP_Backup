'use client';

/**
 * One row of the Policy Encoding Review — the per-element renderer + its decision controls
 * (Accept / Correct / Reject, or Confirm for a documentation-gated item). Extracted from
 * `EncodingReviewPanel` so each file stays a thin, single-purpose renderer under the size cap.
 * Pure presentation: all state-machine logic lives in `@/lib/policy/review/encodingReview`.
 */
import { useState } from 'react';
import { decide, type ReviewElement } from '@/lib/policy/review/encodingReview';

function flagClass(sev: 'defect' | 'ambiguous' | 'verify'): string {
  if (sev === 'defect') return 'bg-rose-50 text-rose-800';
  if (sev === 'ambiguous') return 'bg-amber-50 text-amber-800';
  return 'bg-blue-50 text-blue-800';
}
// Green/red are RESERVED for a processing DECISION. An undecided ('pending') row shows an empty
// outline chip — no fill — so the eye reads "not yet processed" at a glance; only once the editor
// decides does the chip fill in (green accepted/confirmed, red rejected, indigo corrected).
export function stateClass(state: ReviewElement['state']): string {
  switch (state) {
    case 'accepted':
      return 'bg-emerald-100 text-emerald-800';
    case 'confirmed':
      return 'bg-emerald-100 text-emerald-800';
    case 'rejected':
      return 'bg-rose-100 text-rose-800';
    case 'edited':
      return 'bg-indigo-100 text-indigo-800';
    default:
      return 'border border-dashed border-slate-300 bg-white text-slate-400';
  }
}
const flagIcon = (sev: 'defect' | 'ambiguous' | 'verify'): string =>
  sev === 'defect' ? '⛔' : sev === 'ambiguous' ? '⚠️' : 'ℹ️';

export function ElementRow({
  el,
  gated,
  onDecide,
}: {
  el: ReviewElement;
  gated: boolean;
  onDecide: (id: string, action: Parameters<typeof decide>[2]) => void;
}): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState('');
  const [improveCoding, setImproveCoding] = useState(true);
  const [improveExtractor, setImproveExtractor] = useState(false);
  // Row accent by decision so "processed vs not yet processed" reads at a glance: a colored left
  // rail + faint tint appears ONLY once the editor has actually decided; pending rows stay plain.
  const rowAccent =
    el.state === 'accepted' || el.state === 'confirmed'
      ? 'border-l-emerald-500 bg-emerald-50/40'
      : el.state === 'rejected'
        ? 'border-l-rose-400 bg-rose-50/40'
        : el.state === 'edited'
          ? 'border-l-indigo-400 bg-indigo-50/40'
          : 'border-l-transparent';

  return (
    <div className={`border-b border-l-4 border-slate-100 px-4 py-3 ${rowAccent}`}>
      <div className="flex items-start gap-3">
        {el.code && <div className="min-w-[72px] font-mono text-sm font-semibold">{el.code}</div>}
        <div className="min-w-0 flex-1">
          <div className="font-medium text-slate-800">{el.label}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {el.system && (
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                {el.system}
                {el.role ? ` · ${el.role}` : ''}
              </span>
            )}
            <span
              className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                el.confidence === 'explicit'
                  ? 'bg-slate-100 text-slate-500'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              {el.confidence.toUpperCase()}
            </span>
            <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${stateClass(el.state)}`}>
              {el.state}
            </span>
          </div>
          {el.flag && (
            <div className={`mt-2 rounded px-2.5 py-1.5 text-xs ${flagClass(el.flag.severity)}`}>
              {flagIcon(el.flag.severity)} {el.flag.message}
            </div>
          )}
          {el.source && (
            <details className="mt-1.5 text-xs text-slate-500">
              <summary className="cursor-pointer font-medium text-indigo-600">
                Source evidence
              </summary>
              <blockquote className="mt-1 border-l-2 border-slate-200 bg-slate-50 px-2.5 py-1.5 italic">
                {el.source}
              </blockquote>
            </details>
          )}
          {editing && (
            <div className="mt-2 rounded-lg border border-dashed border-indigo-300 bg-indigo-50 p-2.5">
              <label className="text-[11px] font-bold text-slate-600">
                Reason (audited + trains the engine)
              </label>
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. remove I10 — refractory-HTN threshold is not codeable; gate to documentation"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs"
              />
              <div className="mt-2 flex gap-3 text-xs font-medium text-slate-600">
                Improves:
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={improveCoding}
                    onChange={(e) => setImproveCoding(e.target.checked)}
                  />
                  Coding map
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={improveExtractor}
                    onChange={(e) => setImproveExtractor(e.target.checked)}
                  />
                  Extractor
                </label>
              </div>
              <button
                type="button"
                onClick={() => {
                  const improves: ('coding-map' | 'extractor')[] = [];
                  if (improveCoding) improves.push('coding-map');
                  if (improveExtractor) improves.push('extractor');
                  onDecide(el.id, {
                    type: 'correct',
                    correction: {
                      reason,
                      improves: improves.length ? improves : ['coding-map'],
                    },
                  });
                  setEditing(false);
                }}
                className="mt-2 rounded bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white"
              >
                Save correction
              </button>
            </div>
          )}
        </div>
        <div className="flex min-w-[92px] flex-col gap-1.5">
          {gated ? (
            <button
              type="button"
              onClick={() => onDecide(el.id, { type: 'confirm' })}
              className={`rounded px-2 py-1 text-xs font-semibold ${
                el.state === 'confirmed'
                  ? 'border border-emerald-600 bg-emerald-600 text-white'
                  : 'border border-emerald-300 text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              {el.state === 'confirmed' ? '✓ Confirmed' : 'Confirm gate'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onDecide(el.id, { type: 'accept' })}
                className={`rounded px-2 py-1 text-xs font-semibold ${
                  el.state === 'accepted'
                    ? 'border border-emerald-600 bg-emerald-600 text-white'
                    : 'border border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                {el.state === 'accepted' ? '✓ Accepted' : '✓ Accept'}
              </button>
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className={`rounded px-2 py-1 text-xs font-semibold ${
                  el.state === 'edited'
                    ? 'border border-indigo-600 bg-indigo-600 text-white'
                    : 'border border-indigo-300 text-indigo-600 hover:bg-indigo-50'
                }`}
              >
                {el.state === 'edited' ? '✎ Corrected' : '✎ Correct'}
              </button>
              <button
                type="button"
                onClick={() => onDecide(el.id, { type: 'reject' })}
                className={`rounded px-2 py-1 text-xs font-semibold ${
                  el.state === 'rejected'
                    ? 'border border-rose-600 bg-rose-600 text-white'
                    : 'border border-rose-300 text-rose-600 hover:bg-rose-50'
                }`}
              >
                {el.state === 'rejected' ? '✕ Rejected' : '✕ Reject'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
