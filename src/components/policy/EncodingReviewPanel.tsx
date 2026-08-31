'use client';

/**
 * Policy Encoding Review panel (policy-coding-specialist facing).
 *
 * TWO LISTS, not one wall of 45 rows. The engine + coding-map split every element into what a human
 * MUST decide and what the AI RECOMMENDS:
 *   • "Needs your review" — genuine exceptions (defect/ambiguous flags), coverage decisions on codes
 *     the policy text flags as not-medically-necessary / investigational, and human-gated documentation.
 *   • "AI-recommended" — everything else the AI proposed. Each is a RECOMMENDATION the maker accepts,
 *     changes (via the coverage select), or rejects — NOT pre-accepted. An explicit bulk-accept clears
 *     only the clean, high-confidence remainder; AI-mapped and policy-flagged codes are left for
 *     individual decisions and float to the top of the list (confidence + conflict triage).
 * The submit gate is "every item personally decided" — nothing generates CRD/DTR on the AI's say-so,
 * and there is no single acknowledgement checkbox to rubber-stamp.
 *
 * All behavior lives in the tested pure module `@/lib/policy/review/encodingReview`; this is a thin
 * renderer. The per-row renderer lives in `./EncodingReviewRow`.
 */
import { useEffect, useMemo, useState } from 'react';
import type { PolicyReview } from '@/lib/policy/policyReview';
import {
  buildEncodingReview,
  bulkAcceptRecommended,
  collectCorrections,
  decide,
  reviewBucket,
  reviewProgress,
  submitReadiness,
  type ReviewElement,
  type ReviewProgress,
  type ReviewSection,
} from '@/lib/policy/review/encodingReview';
import { compareAttention } from '@/lib/policy/review/reviewTriage';
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
import type { CodeDisposition } from '@/lib/policy/crd/coverageDisposition';
import { ElementRow } from './EncodingReviewRow';
import { DispositionSelect } from './EncodingReviewCodeDrawer';
import { AiDecidedRow } from './EncodingReviewAiRow';

// The generic "Assign coverage role …" flag is stated ONCE per routing group, not on every row — so we
// strip it from the row's display while leaving it on the element in state.
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
  dispositions,
  onDispositionsChange,
  onExplainCode,
  onSubmit,
  onProgressChange,
}: {
  review: PolicyReview;
  codingMap?: CodingMapContribution;
  /** The per-code coverage decisions (seeded from section-inferred defaults). The maker overrides these
   *  here; the decisions flow to the Generate stage so the published CRD reflects them. */
  dispositions?: Record<string, CodeDisposition>;
  onDispositionsChange?: (d: Record<string, CodeDisposition>) => void;
  /** Seed the Encoding Assistant with a code (from a row's research drawer). */
  onExplainCode?: (code: string) => void;
  onSubmit?: () => void;
  onProgressChange?: (progress: ReviewProgress) => void;
}): React.ReactElement {
  const base = useMemo(() => {
    const contrib = codingMap ?? deterministicCodingMap.propose(review);
    const withRouting = {
      ...contrib,
      routing: contrib.routing ?? routeGuidelineCodes(review),
    };
    // Every AI call is a RECOMMENDATION, not a pre-accepted decision — elements start `open` so the
    // maker personally dispositions each (accept / modify / reject). Nothing ships on the AI's say-so.
    return buildEncodingReview(reviewElementsFromPolicy(review, withRouting));
  }, [review, codingMap]);
  const [sections, setSections] = useState<ReviewSection[]>(base);
  const [showAi, setShowAi] = useState(true);

  useEffect(() => {
    setSections(base);
    setShowAi(true);
  }, [base]);

  const onDecide = (id: string, action: Parameters<typeof decide>[2]): void =>
    setSections((s) => decide(s, id, action));
  const acceptSafe = (): void => setSections((s) => bulkAcceptRecommended(s).sections);
  const safeRemaining = bulkAcceptRecommended(sections).count;

  // Coverage disposition per code (controlled by the parent, seeded from section-inferred defaults).
  // Changing it here flows to the Generate stage so the published CRD reflects the maker's decision.
  const disp = dispositions ?? {};
  const setDisposition = (code: string, d: CodeDisposition): void =>
    onDispositionsChange?.({ ...disp, [code]: d });

  const readiness = submitReadiness(sections);
  const corrections = collectCorrections(sections).length;
  const canSubmit = readiness.everyItemDecided;

  // Partition every element into the two lists (preserving section grouping).
  const bucketed = (want: 'needs-review' | 'ai-decided') =>
    sections
      .map((section) => ({
        section,
        els: section.elements.filter((el) => reviewBucket(el, section.gated) === want),
      }))
      .filter((x) => x.els.length > 0);
  const needsReview = bucketed('needs-review');
  const aiDecided = bucketed('ai-decided');

  // Report progress up so the parent workflow gate is unchanged.
  const progress = reviewProgress(sections);
  useEffect(() => {
    onProgressChange?.(progress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress.total, progress.decided, progress.openDefects, readiness.exceptionsCleared]);

  // Render a section's elements; procedure codes are grouped by routing so the list isn't a wall of
  // identical rows and the "assign role" instruction is stated once per group.
  const renderEls = (section: ReviewSection, els: ReviewElement[]): React.ReactNode => {
    if (section.key !== 'procedure') {
      return els.map((el) => (
        <ElementRow
          key={el.id}
          el={el}
          gated={section.gated}
          onDecide={onDecide}
          onExplainCode={onExplainCode}
        />
      ));
    }
    return ROUTING_ORDER.map((bucket) => {
      const rows = els.filter((el) => (el.routing?.bucket ?? 'assign') === bucket);
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
                : 'Coverage role — AI proposes prior-auth-required'}
            </span>
            <span className="ml-auto font-normal opacity-70">{rows.length}</span>
          </div>
          {bucket === 'excluded' && evidence && (
            <div className="border-b border-slate-100 bg-amber-50/30 px-4 py-1.5 text-[11px] italic text-amber-800">
              “{evidence.excerpt}”
            </div>
          )}
          {rows.map((el) => (
            <div key={el.id}>
              <ElementRow
                el={stripAssignFlag(el)}
                gated={section.gated}
                onDecide={onDecide}
                onExplainCode={onExplainCode}
              />
              {el.code && (
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-1.5 text-[11px]">
                  <span className="shrink-0 font-semibold uppercase tracking-wide text-slate-400">
                    Coverage
                  </span>
                  <DispositionSelect
                    code={el.code}
                    value={disp[el.code] ?? 'pending'}
                    onChange={(d) => setDisposition(el.code as string, d)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      );
    });
  };

  return (
    <section className="rounded-lg border border-slate-300">
      {/* Sticky header: what needs the human vs what the AI handled. */}
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">Policy Encoding Review</h3>
          <span className="text-xs font-medium text-slate-500">
            {readiness.needsReviewOpen > 0
              ? `${readiness.needsReviewOpen} need your review`
              : 'No open exceptions'}{' '}
            · {readiness.aiDecidedTotal} AI-recommended
          </span>
          {readiness.openDefects > 0 && (
            <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-800">
              {readiness.openDefects} defect
              {readiness.openDefects > 1 ? 's' : ''}
            </span>
          )}
          {corrections > 0 && (
            <span className="rounded bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">
              {corrections} correction{corrections > 1 ? 's' : ''} → engine
            </span>
          )}
        </div>
      </div>

      {/* LIST 1 — Needs your review. */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-600">
        Needs your review
        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
          {readiness.needsReviewOpen}
        </span>
      </div>
      {readiness.needsReviewTotal === 0 ? (
        <div className="bg-emerald-50 px-4 py-5 text-sm text-emerald-800">
          ✓ No exceptions the AI couldn&rsquo;t resolve. It still made {readiness.aiDecidedTotal}{' '}
          recommendations below — accept, change, or reject each (or bulk-accept the safe ones)
          before you submit.
        </div>
      ) : (
        needsReview.map(({ section, els }) => (
          <div key={`nr-${section.key}`}>
            <div className="flex items-center gap-2 border-b border-slate-100 bg-white px-4 py-1.5 text-xs font-semibold text-slate-500">
              {section.title}
            </div>
            {renderEls(section, els)}
          </div>
        ))
      )}

      {/* LIST 2 — AI-recommended. Each is a recommendation the maker accepts / changes / rejects; the
          attention-worthy ones (AI-mapped, policy-flagged) float to the top and are never bulk-accepted. */}
      <div className="flex w-full flex-wrap items-center gap-2 border-y border-slate-200 bg-slate-50 px-4 py-2">
        <button
          type="button"
          onClick={() => setShowAi((v) => !v)}
          className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600"
          aria-expanded={showAi}
        >
          <span aria-hidden>{showAi ? '▾' : '▸'}</span>
          AI-recommended
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700">
            {readiness.aiDecidedTotal}
          </span>
        </button>
        {readiness.aiDecidedOpen > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
            {readiness.aiDecidedOpen} to confirm
          </span>
        )}
        {safeRemaining > 0 && (
          <button
            type="button"
            onClick={acceptSafe}
            className="ml-auto rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
          >
            ✓ Accept {safeRemaining} safe{' '}
            {safeRemaining === 1 ? 'recommendation' : 'recommendations'}
          </button>
        )}
      </div>
      {showAi &&
        aiDecided.map(({ section, els }) => (
          <div key={`ai-${section.key}`}>
            <div className="flex items-center gap-2 border-b border-slate-100 bg-white px-4 py-1.5 text-xs font-semibold text-slate-500">
              {section.title}
            </div>
            {[...els].sort(compareAttention).map((el) => (
              <AiDecidedRow
                key={el.id}
                el={el}
                dispValue={el.code ? disp[el.code] : undefined}
                onDisposition={setDisposition}
                onDecide={onDecide}
                onExplainCode={onExplainCode}
              />
            ))}
          </div>
        ))}
      {/* Sticky action bar — the gate is "every item personally decided," not a single checkbox. It
          shows exactly what is left, offers the safe bulk-accept, and unlocks Submit only when nothing
          is undecided. Nothing generates CRD/DTR on the AI's say-so. */}
      <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-slate-600">
            {readiness.everyItemDecided ? (
              <span className="font-semibold text-emerald-700">
                ✓ Every item decided — ready for maker sign-off
              </span>
            ) : (
              <>
                {readiness.openTotal} item{readiness.openTotal !== 1 ? 's' : ''} left to decide
                {readiness.needsReviewOpen > 0 && (
                  <span className="text-rose-600">
                    {' '}
                    · {readiness.needsReviewOpen} exception
                    {readiness.needsReviewOpen > 1 ? 's' : ''}
                  </span>
                )}
                {readiness.openDefects > 0 && (
                  <span className="text-rose-600">
                    {' '}
                    · {readiness.openDefects} defect
                    {readiness.openDefects > 1 ? 's' : ''}
                  </span>
                )}
              </>
            )}
          </span>
          {safeRemaining > 0 && (
            <button
              type="button"
              onClick={acceptSafe}
              className="rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              ✓ Accept {safeRemaining} safe
            </button>
          )}
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => onSubmit?.()}
            className={`ml-auto rounded px-4 py-2 text-sm font-bold ${
              canSubmit
                ? 'bg-indigo-600 text-white'
                : 'cursor-not-allowed bg-slate-200 text-slate-500'
            }`}
          >
            {onSubmit ? 'Submit for sign-off →' : 'Submit for approval'}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">
          Every AI recommendation needs your accept, change, or reject. Low-confidence (AI-mapped)
          and policy-flagged codes must be decided individually — the bulk accept clears only clean,
          high-confidence codes.
        </p>
      </div>
    </section>
  );
}
