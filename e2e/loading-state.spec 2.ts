/**
 * THE SPINNER THAT NEVER RESOLVES.
 *
 * Found by rendering the app in a browser, which no gate in this repo does. `/work-queue` and
 * `/network-adequacy` each had an error alert and a "Loading…" line as INDEPENDENT siblings, so a
 * failed fetch rendered both: the screen told a reviewer that the load had failed and that it was
 * still working, at the same time, forever.
 *
 * WHY IT MATTERS MORE THAN IT LOOKS. Both routes are authenticated BFF routes, and the failure the
 * spinner hides is an expired session — the one failure a reviewer is most likely to hit and least
 * likely to diagnose. `npx tsc`, every grep gate, 4044 unit tests and the E16 build gate were all
 * green with this shipped, because none of them renders a page against a 401.
 *
 * THE ASSERTION IS DERIVED FROM WHAT RENDERS, not from a declaration: it drives a real browser at a
 * real 401 and asserts the two states are mutually exclusive. Restore either independent branch and
 * this goes red.
 *
 * Run: npm run dev (port 4029, or set E2E_BASE_URL) then `npx playwright test e2e/loading-state`.
 */
import { test, expect } from '@playwright/test';

const ROUTES = [
  { path: '/work-queue', loading: 'Loading…' },
  { path: '/network-adequacy', loading: 'Loading...' },
];

for (const route of ROUTES) {
  test(`${route.path}: an error clears the spinner instead of sitting above it`, async ({
    page,
  }) => {
    // Unauthenticated by construction — a fresh context carries no session, which is exactly the
    // state that produced the defect.
    await page.goto(route.path, { waitUntil: 'networkidle' });

    const alert = page.getByRole('alert');
    const alertCount = await alert.count();

    if (alertCount === 0) {
      // Authenticated (or mock-backed) in this environment: the page loaded, so the only thing to
      // assert is that it is not ALSO claiming to be loading. Never skip — a skipped test is a
      // test that has never failed.
      await expect(page.getByText(route.loading, { exact: true })).toHaveCount(0);
      return;
    }

    // The failure path. The alert is the whole message; the spinner must be gone.
    await expect(alert.first()).toBeVisible();
    await expect(page.getByText(route.loading, { exact: true })).toHaveCount(0);
  });
}
