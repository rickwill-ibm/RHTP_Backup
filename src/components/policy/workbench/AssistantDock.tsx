'use client';

/**
 * The Encoding Assistant dock — extracted from the workbench shell for the file-size cap.
 *
 * On lg+ it is the sticky right rail; below lg it is a floating, toggleable dock (bottom-LEFT, to clear
 * the global Demo Navigator at bottom-right) so the assistant is reachable WHILE reviewing at any width.
 *
 * Two panel instances exist (rail + dock), so a seed ("Explain <code>") must reach ONLY the VISIBLE one —
 * otherwise it double-POSTs to the assistant API and, at narrow widths, lands in the hidden rail. We route
 * the seed by the current breakpoint and auto-open the dock when a seed arrives on a narrow screen.
 */
import { useEffect, useState } from 'react';
import type { PolicyReview } from '@/lib/policy/policyReview';
import { EncodingAssistantPanel } from '@/components/policy/EncodingAssistantPanel';

/** True on lg+ (matchMedia). Desktop-first default avoids a hydration flash; corrected on mount. */
function useIsLg(): boolean {
  const [isLg, setIsLg] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = (): void => setIsLg(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return isLg;
}

export function AssistantDock({
  review,
  seededQuestion,
}: {
  review: PolicyReview | null;
  seededQuestion?: { code: string; nonce: number };
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const isLg = useIsLg();

  // Auto-open the narrow dock when a new seed arrives, so the answer is visible where the user is.
  useEffect(() => {
    if (!isLg && seededQuestion) setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seededQuestion?.nonce, isLg]);

  return (
    <>
      {/* Wide screens (lg+): sticky right rail. Only this instance consumes the seed on lg. */}
      <div className="hidden lg:block lg:sticky lg:top-4 lg:self-start">
        <div className="lg:h-[calc(100vh-6rem)]">
          <EncodingAssistantPanel
            review={review}
            seededQuestion={isLg ? seededQuestion : undefined}
          />
        </div>
      </div>

      {/* Narrow screens (< lg): a floating, toggleable dock so the assistant is never buried. */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-emerald-700"
        >
          {open ? '✕ Close assistant' : '💬 Assistant'}
        </button>
        {open && (
          <div className="fixed inset-x-2 bottom-20 top-16 z-40 sm:inset-x-auto sm:left-4 sm:w-[360px]">
            <div className="h-full overflow-hidden rounded-lg shadow-2xl">
              <EncodingAssistantPanel
                review={review}
                seededQuestion={!isLg ? seededQuestion : undefined}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
