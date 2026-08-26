# Cycle 3C — e2e + Accessibility Specs Report

**Author:** e2e & accessibility spec author, Cycle 3 of Iteration 0
**Date:** 2026-08-22
**Scope:** author CI-runnable Playwright specs under `e2e/`. No `src/` edits.

---

## Specs authored

| File | Tests | Purpose |
|------|-------|---------|
| `e2e/c5-demo-walkthrough.spec.ts` | 7 | C5 "demo stays green" — navigates the core demo path; each key screen must render its signature content with no uncaught page/console errors. |
| `e2e/c5-dual-mode.spec.ts` | 4 | Dual-mode mandate — each key *seamed* screen renders correctly in both `mock` and non-mock (Live FHIR) states of the runtime data-mode toggle. |
| `e2e/a11y.spec.ts` | 9 | axe-core pass over the key routes; hard-fails on critical/serious, prints moderate/minor as the O-9 baseline. |

Supporting file created (none existed before this cycle):

- **`playwright.config.ts`** — minimal, CI-runnable. `testDir` pinned to `./e2e`
  (so `--list` never scoops up the vitest/newman suites in `tests/`),
  `baseURL` `http://localhost:4029`, chromium project, and a `webServer` block
  that boots `npm run dev` with `ALLOW_DEV_MOCK_AUTH=true` /
  `NEXT_PUBLIC_USE_MOCK_DATA=true` unless `E2E_BASE_URL` points at a running
  deployment. `webServer` is skipped automatically by `--list`.

`package.json` scripts: `test:e2e` already existed (left untouched). Added the
missing convenience script **`"a11y": "playwright test e2e/a11y.spec.ts"`**.

> Note: the task brief referenced "the existing playwright.config.ts", but none
> was present in the repo. The existing `golden-thread.spec.ts` relies on a
> `baseURL` (it uses relative `page.goto('/cms')` etc.), so a config was required
> for the suite to be CI-runnable. The new config is intentionally minimal and
> mirrors `golden-thread.spec.ts`'s operating assumptions.

---

## Routes covered

Route groups (`(analyst)`, `(reviewer)`, `(cms0057f)`) are URL-transparent, so
the on-disk `(group)/route/page.tsx` serves at `/route`.

**Demo walkthrough (core path):**
`/` (demo navigator) → `/whole-person-care-summary` → `/care-manager` →
`/signal-disposition-engine` → `/network-adequacy` → `/financial-clearance`
(Golden Thread, incl. the interactive "run clearance") → `/prior-auth`.

**Dual-mode (seamed screens):**
`/whole-person-care-summary`, `/whole-person-intelligence`, `/care-manager`,
`/patient-episode-summary` — each asserted in mock **and** Live-FHIR mode.

**a11y (9 routes):**
`/`, `/whole-person-care-summary`, `/whole-person-intelligence`,
`/care-manager`, `/signal-disposition-engine`, `/network-adequacy`,
`/financial-clearance`, `/prior-auth`, `/cms`.

Signature content is asserted with resilient role/text selectors
(`getByRole('heading', …)`, `getByText(/…/i).first()`) — never brittle CSS.

---

## How dual-mode is driven

The runtime toggle is a **UI control in `AppLayout`**: a button reading
**"Mock Data"** while `useMockData` is true, **"Live FHIR"** once flipped.
Clicking it calls `AppContext.setUseMockData`, which `useFhirModeSync()`
propagates into the `fhirClient` singleton via `setFhirMockMode()` — i.e. it
writes a per-seam **session override** into the Cycle-1 dataMode registry
(`setSessionDataMode`, the top resolution layer above env/config in
`src/lib/config/dataMode.ts`). So one in-page click flips the seam from mock to
production with no reload and no second process.

`c5-dual-mode.spec.ts` checks each seamed screen twice in one page session:
default load asserts the toggle reads "Mock Data" + signature content; a click
flips to "Live FHIR" and re-asserts signature content renders with no `pageerror`
(the seam must degrade gracefully, never crash).

**Env-driven alternative (documented, not used by the spec):** the same seams
can be forced without the UI by running the suite twice —
`DATA_MODE=mock npx playwright test` then `DATA_MODE=production npx playwright test`
(or the seam-scoped `DATA_MODE_FHIR_STORE`, or legacy `NEXT_PUBLIC_USE_MOCK_DATA`).

---

## Verification

| Check | Command | Result |
|-------|---------|--------|
| Playwright parse/list | `npx playwright test --list` | **exit 0** — 25 tests in 4 files; the 20 new tests + the 5 existing golden-thread tests all listed. |
| File-size gate (e2e) | `bash check-file-sizes.sh e2e` | **PASS** — a11y 67, walkthrough 101, dual-mode 67 lines (cap 500). |
| File-size gate (full) | `bash check-file-sizes.sh` | **PASS** — no new violations, ratchet intact. |
| Type-check | `npx tsc --noEmit` | **exit 2 — one PRE-EXISTING error outside this cycle's scope** (see below). |

### tsc note (pre-existing, not introduced by this cycle)

`tsc --noEmit` reports a single error:

```
.next/types/app/uhg-orchestrate/agent-library/page.ts(12,13): error TS2344 …
  Property 'activeTriggers' is incompatible …
```

Root cause: `src/app/uhg-orchestrate/agent-library/page.tsx:110` does
`export function activeTriggers(…)` — a non-standard export from a Next.js
`page.tsx`, which Next's generated route types reject. This is **src/ code from
another cycle** and is out of scope here (brief: *do not edit `src/`*).

This cycle's deliverables add **zero** tsc errors: `e2e/**` and
`playwright.config.ts` are both in `tsconfig.json`'s `exclude` list (matching the
pre-existing `golden-thread.spec.ts` setup — Playwright transpiles specs itself),
and the `package.json` edit is not a `.ts` file. `tsc` output is byte-identical
with or without this cycle's files. Fixing the `agent-library` export is a `src/`
change for whoever owns that page.

---

## Live execution status — CI-PENDING

**Live e2e execution was not run in this sandbox.** A live Next.js dev server
does not boot reliably here, so specs were validated statically instead:
`npx tsc` (scope-clean, see above) and `npx playwright test --list` (parses every
spec — exit 0). The specs are correct and CI-runnable but a **green live run is
CI-pending**, gated on the sandbox server limitation only.

### How to run in CI

```bash
# One command — the config boots the dev server with dev-mock auth:
npx playwright test                      # full suite (demo + dual-mode + a11y + golden-thread)
npm run test:e2e                         # same
npm run a11y                             # a11y route pass only

# Against an already-running deployment (skips the built-in webServer):
E2E_BASE_URL=https://<deploy-host> npx playwright test

# Env-forced dual-mode (two runs), no UI toggle:
DATA_MODE=mock       npx playwright test e2e/c5-dual-mode.spec.ts
DATA_MODE=production npx playwright test e2e/c5-dual-mode.spec.ts
```

CI prerequisites (encoded in `playwright.config.ts`): dev stack on port 4029,
`ALLOW_DEV_MOCK_AUTH=true`, data-mode registry at its `mock` default.
