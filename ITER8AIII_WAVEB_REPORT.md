# Iteration 8A-iii Wave B — Value-Set Governance Console (Frontend, B2)

Role: Frontend/console specialist, disjoint tree. Framework v1.2.
Scope owned: `src/app/admin-console/value-set-governance/` + `tests/app/valueSetGovernanceConsole.test.tsx`.
Shared file touched (append only): `src/components/AppLayout.nav.ts` (one nav entry block).

## What shipped

A dual-mode admin/UI governance console for versioned value sets, built feature-first on the
existing admin-console layout and shared components (StatusBadge, AppIcon), reusing the
role/permission idiom of the sibling admin pages.

Files (all well under the 400-line cap):

- `governanceApi.ts` (279) — the read-model + gate adapter the console binds to. Types mirror the
  Wave-A lifecycle (`draft → proposed → approved → active → superseded → retired`), plus the read
  API (`listValueSetVersions`, `getVersionHistory`, `diffVersions`, `replayBinding`), the
  role→mode derivation (`governanceModeForRole`), and the maker-checker gate evaluator
  (`evaluateApprovalGate`).
- `components/Console.tsx` (99) — composition + tabs (Versions / Diff / History / Replay), derives
  mode from the principal role, renders the workflow gates only in admin mode.
- `components/VersionList.tsx` (51) — version list with lifecycle state badge + a current/active badge.
- `components/DiffView.tsx` (75) — added/removed/changed members between two chosen versions.
- `components/WorkflowGates.tsx` (120) — submit/approve/reject controls gated by role AND the
  maker-checker rule; the reason a control is disabled is always shown.
- `components/HistoryTimeline.tsx` (43) — immutable version-history / audit timeline.
- `components/ReplayPanel.tsx` (86) — pick a version, enter a sample code, show the historical
  binding result. Read API is injectable for testing.
- `page.tsx` (62) — AppLayout wrapper, principal selector (drives admin vs viewer mode), renders the console.
- `tests/app/valueSetGovernanceConsole.test.tsx` (118) — 5 component/render tests.

Nav: appended `nav-ac-vsgov` → `/admin-console/value-set-governance` in the Admin Console group.

## Dual mode + gating (DoD proof)

- Mode is derived from the principal role, no new auth. Admin mode (maker/checker-capable roles:
  platform_admin, data_engineer, security_compliance) sees the full workflow controls; viewer mode
  (auditor, support_analyst) sees history + replay only, with the submit/approve/reject controls not
  rendered at all.
- Maker-checker (E9): the approve/reject controls are DISABLED (not merely hidden) for a checker
  acting on a version they themselves submitted, with an inline explanation. The handlers RE-EVALUATE
  the gate before acting, so a forbidden approval can never be performed by the UI even if the
  disabled attribute were bypassed. A disabled/absent control is never a false-enable.
- Replay panel is present in both modes and calls the read API with the entered code; the historical
  binding result renders.

## Wave-A backend integration (parallel wave)

Wave A's governance module (`src/lib/terminology/governance`) landed during this work. Its real read
surface is `activeVersion / listVersions / history / replayAgainstVersion` with a
`GovernancePrincipal { userId, role }` (roles include `value-set-reviewer`) and maker-checker
enforced via `MakerCheckerViolationError('self-approval')`. Per the disjoint-tree isolation rule and
because the backend arrived mid-flight, the console binds to a single local read-model adapter
(`governanceApi.ts`) rather than importing the backend directly, so this wave stays green independent
of the parallel wave's in-flight compile state. The adapter does NOT implement the lifecycle state
machine (Wave A owns it); it is a read/view model + gate evaluator whose maker-checker semantics match
Wave A's. The integration seam is documented in `governanceApi.ts`: swapping the seed reads for
re-exports of the Wave-A read API + gate is mechanical and keeps the exported names the console binds to.

## Test-infra note (owned-scope fix)

The repo had no prior React render tests and the root `tsconfig.json` sets `jsx: preserve` (required
by Next.js), which the vitest/vite transform does not process. Resolved entirely within owned scope:
scoped `tsconfig.json` files (jsx: react-jsx) in the owned console dir and `tests/app/`, plus mocking
the two shared jsx:preserve UI leaves (StatusBadge, AppIcon) in the test. Root tsconfig, vitest.config,
and shared components were not modified.

## Verification (in /home/claude/baseline)

- `npx tsc --noEmit` → 0 errors.
- `npx vitest run tests/app` → 5 passed.
- `npx vitest run tests/governance` (Wave-A regression check) → 34 passed, no regression.
- `bash check-file-sizes.sh` → PASS (no new violations; every new file well under the 400/500 cap).
