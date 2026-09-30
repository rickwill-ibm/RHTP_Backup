'use client';
/**
 * A clock reading that is SAFE TO RENDER — null during SSR, the instant after hydration.
 *
 * THE DEFECT THIS FIXES. Three client pages did:
 *
 *   const [asOf] = useState<string>(() => clock.nowIso());
 *
 * and then rendered it as text. A lazy `useState` initializer runs TWICE — once on the server while
 * the HTML is produced, once on the client during hydration — so the two readings differ whenever a
 * minute boundary falls between them. React then reports a text mismatch (minified error #418) and
 * discards the server HTML for that subtree. Found by rendering the production build in a browser;
 * `tsc`, every grep gate and 4044 unit tests were green, because none of them hydrates a page.
 *
 * WHY MINUTE PRECISION MADE IT WORSE, NOT BETTER. The rendered value is truncated to
 * `YYYY-MM-DD HH:MM`, so the mismatch only fires when SSR and hydration straddle a minute — rare
 * enough to survive every casual check, frequent enough to appear during a demo. An intermittent
 * defect that passes review is worse than a constant one.
 *
 * WHAT THIS DOES NOT CHANGE. The page's COMPUTATION still uses its own `asOf` instant, so every row,
 * KPI and affordance still resolves against one consistent reading — that invariant is the reason
 * those pages hold the instant in state at all, and it is untouched. Only the DISPLAYED string waits
 * for the client, because only the displayed string is what React diffs.
 */
import { useEffect, useState } from 'react';
import * as clock from '@/lib/clock';

/**
 * Returns `null` on the server and on the first client render, then the ISO instant captured after
 * mount. Render it as `instant ?? '—'` (or omit the line) so the server and client agree.
 */
export function useMountedInstant(): string | null {
  const [instant, setInstant] = useState<string | null>(null);
  useEffect(() => {
    setInstant(clock.nowIso());
  }, []);
  return instant;
}

/** `2026-09-28 12:40 UTC`, or a stable placeholder before hydration. */
export function formatInstantUtc(instant: string | null): string {
  return instant === null ? '—' : `${instant.replace('T', ' ').slice(0, 16)} UTC`;
}
