'use client';

/**
 * Policy Encoding Review panel (policy-coding-specialist facing).
 *
 * Renders the coded criteria for review: procedure codes (explicit) + criteria from extraction, and
 * mapped diagnoses / roles / defect flags from the coding-map layer. Attention is routed to what is
 * risky; clean explicit codes are one-click bulk-accepted; sign-off is gated on defects being
 * resolved. ALL behavior lives in the tested pure module `@/lib/policy/review/encodingReview` — this
 * component is a thin renderer, so the risky logic is under test, not in React. The per-row renderer
 * lives in `./EncodingReviewRow`.
 *
 * When embedded in the staged workbench it reports progress up (`onProgressChange`) and delegates the
 * maker submit to the parent (`onSubmit`). With neither prop it behaves standalone, so nothing
 * regresses. Layout: a sticky header (progress bar + counter) over a TWO-TAB body — "To process"
 * (the shrinking work queue) and "Finalized" (everything decided, reopenable). Decided rows leave the
 * queue and land in the Finalized tab one click away — they never scroll off the bottom, and the tab
 * counts + progress bar give the reviewer continuous "I'm making progress" feedback.
 */
import { useEffect, useMemo, useState } from 'react';
import type { PolicyReview } from '@/lib/policy/policyReview';
import {
  buildEncodingReview,
  bulkAcceptCleanExplicit,
  collectCorrections,
  decide,
  reviewProgress,
  type ReviewElement,
  type ReviewProgress,
  type ReviewSection,
} from '@/lib/policy/review/encodingReview';
import {
  reviewElementsFromPolicy,
  type CodingMapContribution,
} from '@/lib/policy/review/fromPolicyReview';
import { deterministicCodingMap } from '@/lib/policy/review/codingMap';
import {
  routeGuidelineCodes,
  ROUTING_ORDER,
  type RoutingBucket,
} from '@/lib/policy/review/codeRouting';
import { ElementRow, stateClass } from './EncodingReviewRow';

// The generic "Assign coverage role …" flag is stated ONCE per routing group, not repeated on every
// identical row — so we strip it from the row's own display while leaving it on the element in state
// (it keeps the code out of bulk-accept and blocks sign-off until a human assigns a role). Real
// defect/ambiguous flags are never stripped.
function isGenericAssignFlag(el: ReviewElement): boolean {
  return el.flag?.severity === 'verify' && el.flag.message.startsWith('Assign coverage role');
}
function stripAssignFlag(el: ReviewElement): ReviewElement {
  return isGenericAssignFlag(el) ? { ...el, flag: undefined } : el;
}
const BUCKET_TONE: Record<RoutingBucket, string> = {
  excluded: 'border-l-4 border-l-amber-400 bg-amber-50/50 text-amber-900',
  assign: 'border-l-4 border-l-slate-300 bg-slate-50 text-slate-600',
};

export function EncodingReviewPanel({
  review,
  codingMap,
  onSubmit,
  onProgressChange,
}: {
  review: PolicyReview;
  codingMap?: CodingMapContribution;
  /** When provided, the footer "Submit for approval" delegates to the parent (staged workflow). */
  onSubmit?: () => void;
  /** Reports review progress up so the parent can gate the workflow stepper. */
  onProgressChange?: (progress: ReviewProgress) => void;
}): React.ReactElement {
  const base = useMemo(() => {
    const contrib = codingMap ?? deterministicCodingMap.propose(review);
    // Attach deterministic ROUTING (where each code's evidence sits) if the caller didn't supply it.
    // Routing never sets a coverage role — it only groups the queue so it isn't a wall of identical
    // rows. See codeRouting.ts.
    const withRouting = { ...contrib, routing: contrib.routing ?? routeGuidelineCodes(review) };
    return buildEncodingReview(reviewElementsFromPolicy(review, withRouting));
  }, [review, codingMap]);
  const [sections, setSections] = useState<ReviewSection[]>(base);
  const [tab, setTab] = useState<'queue' | 'finalized'>('queue');

  // Reset the decision state whenever the underlying policy/coding-map changes (no stale rows).
  useEffect(() => setSections(base), [base]);

  const onDecide = (id: string, action: Parameters<typeof decide>[2]): void =>
    setSections((s) => decide(s, id, action));
  const reopen = (id: string): void => onDecide(id, { type: 'reset' });
  const progress = reviewProgress(sections);
  const corrections = collectCorrections(sections).length;

  // Worklist split: the WORK QUEUE holds only OPEN elements (it shrinks as decisions are made);
  // everything decided moves into the FINALIZED tab, reopenable until sign-off — one click away, so a
  // finalized row never scrolls off the bottom of the queue.
  const openBySection = sections
    .map((section) => ({ section, open: section.elements.filter((el) => el.state === 'open') }))
    .filter((x) => x.open.length > 0);
  const openCount = openBySection.reduce((n, x) => n + x.open.length, 0);
  const finalized = sections.flatMap((section) =>
    section.elements.filter((el) => el.state !== 'open').map((el) => ({ el, section }))
  );
  const finalTone = (s: ReviewElement['state']): string =>
    s === 'rejected'
      ? 'border-l-rose-400'
      : s === 'edited'
        ? 'border-l-indigo-400'
        : 'border-l-emerald-500';
  const pct = progress.total > 0 ? Math.round((progress.decided / progress.total) * 100) : 0;

  // Report progress up (staged workflow gate). Depend on primitives to avoid a render loop.
  useEffect(() => {
    onProgressChange?.(progress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress.total, progress.decided, progress.openDefects, progress.canSubmit]);

  const tabClass = (active: boolean): string =>
    `flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors ${
      active
        ? 'border-indigo-600 text-indigo-700'
        : 'border-transparent text-slate-500 hover:text-slate-700'
    }`;

  return (
    <section className="rounded-lg border border-slate-300">
      {/* Sticky header: title, live counter, progress bar — always visible as rows leave the queue. */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Policy Encoding Review</h3>
          <span className="text-xs font-medium text-slate-500">
            {progress.decided} of {progress.total} decided · {pct}%
          </span>
          {progress.openDefects > 0 && (
            <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">
              {progress.openDefects} defect{progress.openDefects > 1 ? 's' : ''}
            </span>
          )}
          {corrections > 0 && (
            <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">
              {corrections} correction{corrections > 1 ? 's' : ''} → engine
            </span>
          )}
          <button
            type="button"
            onClick={() => setSections((s) => bulkAcceptCleanExplicit(s).sections)}
            className="ml-auto rounded border border-emerald-500 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"
          >
            ✓ Accept clean explicit
          </button>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Tabs: work queue vs finalized. Counts live on the tabs, so a decision visibly moves the
          numbers (queue down, finalized up) — the "I'm making progress" signal. */}
      <div className="flex items-center border-b border-slate-200 bg-white">
        <button type="button" onClick={() => setTab('queue')} className={tabClass(tab === 'queue')}>
          To process
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
            {openCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setTab('finalized')}
          className={tabClass(tab === 'finalized')}
        >
          Finalized
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
            {finalized.length}
          </span>
        </button>
      </div>

      {tab === 'queue' &&
        (openCount === 0 ? (
          <div className="flex items-center gap-2 bg-emerald-50 px-4 py-6 text-sm font-semibold text-emerald-800">
            ✓ All {progress.total} items processed — see the Finalized tab, then sign off below.
          </div>
        ) : (
          openBySection.map(({ section, open }) => (
            <div key={section.key}>
              <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700">
                {section.title}
                <span className="ml-auto font-normal text-slate-400">{open.length} to process</span>
              </div>
              {section.key !== 'procedure'
                ? open.map((el) => (
                    <ElementRow key={el.id} el={el} gated={section.gated} onDecide={onDecide} />
                  ))
                : // Procedure rows grouped by ROUTING (where the code's evidence sits) so the queue
                  // isn't a wall of identical rows; the "assign role" instruction is stated once per
                  // group, not on every line. Routing decides no coverage — a human still assigns each.
                  ROUTING_ORDER.map((bucket) => {
                    const rows = open.filter((el) => (el.routing?.bucket ?? 'assign') === bucket);
                    if (rows.length === 0) return null;
                    const evidence = rows.find((el) => el.routing?.provenance)?.routing?.provenance;
                    return (
                      <div key={bucket}>
                        <div
                          className={`flex items-start gap-2 border-b border-slate-100 px-4 py-2 text-xs ${BUCKET_TONE[bucket]}`}
                        >
                          <span className="font-semibold">
                            {bucket === 'excluded'
                              ? 'Named in a not-medically-necessary / investigational statement'
                              : 'Assign coverage role (covered / not-covered / investigational)'}
                          </span>
                          <span className="ml-auto font-normal opacity-70">{rows.length}</span>
                        </div>
                        {bucket === 'excluded' && evidence && (
                          <div className="border-b border-slate-100 bg-amber-50/30 px-4 py-1.5 text-[11px] italic text-amber-800">
                            “{evidence.excerpt}”
                          </div>
                        )}
                        {rows.map((el) => (
                          <ElementRow
                            key={el.id}
                            el={stripAssignFlag(el)}
                            gated={section.gated}
                            onDecide={onDecide}
                          />
                        ))}
                      </div>
                    );
                  })}
            </div>
          ))
        ))}

      {tab === 'finalized' &&
        (finalized.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-slate-400">
            Nothing finalized yet. Items you accept, correct, or reject move here — one click away,
            so you can always see what you&apos;ve worked and reopen anything.
          </div>
        ) : (
          finalized.map(({ el }) => (
            <div
              key={el.id}
              className={`flex items-center gap-2 border-b border-l-4 border-slate-100 px-4 py-2 ${finalTone(
                el.state
              )}`}
            >
              <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${stateClass(el.state)}`}>
                {el.state}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-600">
                {el.code ? `${el.code} — ` : ''}
                {el.label}
              </span>
              <button
                type="button"
                onClick={() => reopen(el.id)}
                className="rounded border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
              >
                ↩ Reopen
              </button>
            </div>
          ))
        ))}

      <div className="flex items-center gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
        <span className="text-xs text-slate-500">
          {progress.openDefects > 0
            ? `Resolve ${progress.openDefects} defect${progress.openDefects > 1 ? 's' : ''} to submit`
            : 'Ready for maker sign-off'}
        </span>
        <button
          type="button"
          disabled={!progress.canSubmit}
          onClick={() => onSubmit?.()}
          className={`ml-auto rounded px-4 py-2 text-sm font-bold ${
            progress.canSubmit
              ? 'bg-indigo-600 text-white'
              : 'cursor-not-allowed bg-slate-200 text-slate-500'
          }`}
        >
          {onSubmit ? 'Submit for sign-off →' : 'Submit for approval'}
        </button>
      </div>
    </section>
  );
}
