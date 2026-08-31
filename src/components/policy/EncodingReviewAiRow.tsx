'use client';

/**
 * One AI-RECOMMENDED review row. Every AI call is a recommendation, not a pre-accepted decision: an
 * undecided row shows what the AI proposed plus Accept / Reject (and the coverage select doubles as
 * "modify"), so the maker personally dispositions it. Once decided it shows its state + Reopen.
 *
 * Layout is a fixed 3-zone flex-wrap row — [ state · descriptor (truncates, opens a research drawer) ·
 * controls (shrink-0) ] — that never scrolls sideways. A confidence/conflict "attention" flag surfaces
 * the codes least safe to trust (AI-mapped, or policy-flagged not-medically-necessary) right on the row.
 */
import { useState } from 'react';
import type { ReviewElement, ReviewAction } from '@/lib/policy/review/encodingReview';
import { reviewAttention } from '@/lib/policy/review/reviewTriage';
import type { CodeDisposition } from '@/lib/policy/crd/coverageDisposition';
import { codeDescriptor } from '@/lib/policy/review/reviewRowText';
import { stateClass } from './EncodingReviewRow';
import { DispositionSelect, CodeResearchDrawer } from './EncodingReviewCodeDrawer';

export function AiDecidedRow({
  el,
  dispValue,
  onDisposition,
  onDecide,
  onExplainCode,
}: {
  el: ReviewElement;
  dispValue?: CodeDisposition;
  onDisposition: (code: string, d: CodeDisposition) => void;
  onDecide: (id: string, action: ReviewAction) => void;
  onExplainCode?: (code: string) => void;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const drawerId = `research-${el.id}`;
  const descriptor = codeDescriptor(el);
  const canResearch = Boolean(el.code || el.source || el.sourceSection);
  const undecided = el.state === 'open';
  const attention = reviewAttention(el);
  const railTone = undecided
    ? attention.level === 'attention'
      ? 'border-l-amber-400'
      : 'border-l-slate-200'
    : el.state === 'rejected'
      ? 'border-l-rose-400'
      : el.state === 'edited'
        ? 'border-l-indigo-400'
        : 'border-l-emerald-500';

  return (
    <div className={`border-b border-l-4 border-slate-100 ${railTone}`}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-2">
        {undecided ? (
          <span className="shrink-0 rounded border border-dashed border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">
            AI rec
          </span>
        ) : (
          <span
            className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-bold ${stateClass(el.state)}`}
          >
            {el.state}
          </span>
        )}
        {canResearch ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={drawerId}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
          >
            <span aria-hidden className="shrink-0 text-slate-400">
              {open ? '▾' : '▸'}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{descriptor}</span>
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{descriptor}</span>
        )}
        {attention.level === 'attention' && (
          <span
            title={attention.reason}
            className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700"
          >
            ⚠ verify
          </span>
        )}
        {el.code && el.kind === 'procedure' && (
          <span className="shrink-0">
            <DispositionSelect
              code={el.code}
              value={dispValue ?? 'pending'}
              onChange={(d) => onDisposition(el.code as string, d)}
            />
          </span>
        )}
        {undecided ? (
          <span className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => onDecide(el.id, { type: 'accept' })}
              className="rounded border border-emerald-300 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
            >
              ✓ Accept
            </button>
            <button
              type="button"
              onClick={() => onDecide(el.id, { type: 'reject' })}
              className="rounded border border-rose-300 px-2 py-0.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
            >
              ✕ Reject
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onDecide(el.id, { type: 'reset' })}
            className="shrink-0 rounded border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
          >
            ↩ Reopen
          </button>
        )}
      </div>
      {open && canResearch && (
        <CodeResearchDrawer el={el} drawerId={drawerId} onExplainCode={onExplainCode} />
      )}
    </div>
  );
}
