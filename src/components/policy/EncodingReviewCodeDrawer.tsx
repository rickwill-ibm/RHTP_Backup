'use client';

/**
 * The per-code RESEARCH drawer + the coverage-disposition <select> — extracted from EncodingReviewPanel
 * so a reviewer can verify a code without leaving the row (and to keep the panel under the size cap).
 *
 * The drawer is READ-ONLY: it shows the full descriptor, the byte-anchored source excerpt (provenance),
 * where in the document the code was harvested from (which is WHY it defaulted to Covered·PA), the
 * code system + confidence, and an "Explain in the assistant" button that seeds the Encoding Assistant
 * with this code. It never mutates review state, so it can never affect the submit gate.
 */
import type { ReviewElement } from '@/lib/policy/review/encodingReview';
import type { CodeDisposition } from '@/lib/policy/crd/coverageDisposition';
import { ORIGIN_TEXT } from '@/lib/policy/review/reviewRowText';

export const DISPOSITION_LABEL: Record<CodeDisposition, string> = {
  'covered-pa': 'Covered · PA required',
  'not-covered': 'Not covered',
  investigational: 'Investigational',
  pending: 'Pending review',
};
export const DISPOSITION_ORDER: CodeDisposition[] = [
  'covered-pa',
  'not-covered',
  'investigational',
  'pending',
];

/** The coverage-disposition control. Controlled by the parent (value + onChange) so it keeps driving the
 *  generated CRD; `shrink-0` at the call site keeps it visible without pushing the row past the panel. */
export function DispositionSelect({
  code,
  value,
  onChange,
}: {
  code: string;
  value: CodeDisposition;
  onChange: (d: CodeDisposition) => void;
}): React.ReactElement {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as CodeDisposition)}
      aria-label={`Coverage disposition for ${code}`}
      className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-slate-700"
    >
      {DISPOSITION_ORDER.map((d) => (
        <option key={d} value={d}>
          {DISPOSITION_LABEL[d]}
        </option>
      ))}
    </select>
  );
}

export function CodeResearchDrawer({
  el,
  drawerId,
  onExplainCode,
}: {
  el: ReviewElement;
  drawerId: string;
  onExplainCode?: (code: string) => void;
}): React.ReactElement {
  // Show the descriptor without the leading "<code> — " the label carries, so it isn't repeated.
  const descriptor =
    el.code && el.label.startsWith(`${el.code} — `) ? el.label.slice(el.code.length + 3) : el.label;
  return (
    <div
      id={drawerId}
      role="region"
      aria-label={`Research for ${el.code ?? el.label}`}
      className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 text-xs text-slate-600"
    >
      <dl className="space-y-2">
        <div>
          <dt className="font-semibold uppercase tracking-wide text-slate-400">Descriptor</dt>
          <dd className="mt-0.5 break-words text-slate-700">{descriptor}</dd>
        </div>
        {el.source && (
          <div>
            <dt className="font-semibold uppercase tracking-wide text-slate-400">
              Source excerpt (from the policy)
            </dt>
            <dd className="mt-0.5 break-words border-l-2 border-slate-200 bg-white px-2.5 py-1.5 italic">
              “{el.source}”
            </dd>
          </div>
        )}
        {el.sourceSection && (
          <div>
            <dt className="font-semibold uppercase tracking-wide text-slate-400">
              Where it came from
            </dt>
            <dd className="mt-0.5 text-slate-700">{ORIGIN_TEXT[el.sourceSection]}</dd>
          </div>
        )}
        {el.code && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600">
              {el.system ?? 'code'} {el.code}
            </span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
              {el.confidence === 'explicit' ? 'explicit (in the text)' : 'AI-mapped'}
            </span>
            {onExplainCode && (
              <button
                type="button"
                onClick={() => onExplainCode(el.code as string)}
                className="ml-auto rounded border border-teal-300 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700 hover:bg-teal-100"
              >
                Explain {el.code} in the assistant →
              </button>
            )}
          </div>
        )}
      </dl>
    </div>
  );
}
