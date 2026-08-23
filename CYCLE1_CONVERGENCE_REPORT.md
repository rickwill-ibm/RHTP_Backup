# Cycle 1 Convergence Report (re-sweep)

Date: 2026-08-22. Tree: /home/claude/baseline. Governing rules: AI-CODING-CONVENTIONS_v2; ratchet per quality-baseline.json. This pass re-swept the four wave-1 defect classes plus an adversarial review of the wave-2 dataMode registry.

## Findings count per sweep (new vs wave 1)

| Sweep | New findings | Fixed here | Left (documented) |
|---|---|---|---|
| 1. Persona-in-logic | 0 new defects (all hits were persona data/display or wave-1's own follow-up list) | 8 logic files moved off the hardcoded demo id (wave-1 follow-up #1) | 5 items, reasons below |
| 2. Determinism | 4 lib files wave 1 missed (10 call sites) | all 10 routed through the clock seam | 3 wave-1 exclusions unchanged |
| 3. Logging | 11 residual log/debug console hits (wave 1 targeted only plain log calls) | all 11 resolved; grep is now zero | none |
| 4. dataMode review | 3 defects (1 material, 2 hardening) | all 3 fixed, 2 tests added | 1 architectural limitation documented |
| 5. Report style | 0 (all three CYCLE1 reports already clean of "em dash + space") | n/a | n/a |

## Sweep 1: Persona-in-logic

New module `src/lib/config/demoDefaults.ts` exports `DEMO_MEMBER_ID` (env-configurable via `NEXT_PUBLIC_DEMO_MEMBER_ID`, fallback `MARIA_SD_001`). The persona-keyed default became a configured default in:

- src/lib/appContext.tsx (default activePatientId)
- src/lib/patientContext.tsx (initial-state selection)
- src/lib/server/smartSession.ts (startDevSession default patient)
- src/lib/pa/dtrService.ts (mock-result selection)
- src/lib/careTeam/visitPlan.ts (graph-backed plan selection)
- src/lib/careTeam/graph/resources.ts (graph-backed needs selection; `mariaNeeds()` renamed `graphNeeds()`)
- src/lib/runtimeConfig.ts (postmanPatientId default)
- src/lib/cms0057fEndpoints.ts (DEFAULT_PATIENT_ID)

Deliberately left, one line why each:

1. src/lib/services/holisticContextEngine.ts: returns a hardcoded Maria payload; the fix is a data-module migration (wave-1 follow-up #2), not small/safe in a re-sweep.
2. src/lib/networkAdequacy/assistant.ts: the query parser recognizes the demo persona by design (demo assistant feature).
3. src/lib/careTeam/identity.ts: an id alias map (data), not a persona-keyed default.
4. src/lib/server/devStubs.*: dev-mode stub payloads are that persona's data.
5. src/app/md-smart-launch.backup tree: dead backup dir (wave-1 follow-up #3 still open; delete-or-fix belongs to a cleanup PR).

Persona names remaining in data/seed/display modules are the demo content itself and stay.

## Sweep 2: Determinism

Wave 1 missed 4 lib files that mint state timestamps (not display-only): src/lib/patientContext.fhirObs.tsx (6 sites), src/lib/patientContext.tsx (1), src/lib/workflowMachine.tsx (4 reducer branches sharing 4 sites), src/lib/appContext.tsx (1). All now use `clock.nowIso()` / `clock.nowDate()` via the wave-1 seam. Unchanged wave-1 exclusions: mockData.data2.ts (frozen data portions), smartFhirMockData.ts, devStubs.pas.ts (demo stubs), and log.ts's wall-clock log timestamp (intentional, commented).

## Sweep 3: Logging

`rg "console\.(log|debug)" src` is now zero:

- src/lib/services/fhirClient.ts: 5 mock-trace debug calls deleted.
- src/lib/patientContext.fhirObs.tsx: 1 fire-and-forget debug callback deleted.
- src/lib/hooks/useFhirModeSync.ts: 1 debug call deleted (and the hook fixed, see sweep 4).
- src/lib/server/log.ts: the logger's debug sink now emits via console.info; the JSON line still carries level:'debug', so no information is lost and the gate is unambiguous.
- src/app/md-smart-launch/components/MdSmartSummaryScreen.tsx.broken deleted: dead file (unbuildable extension, referenced nowhere), carried 3 console.log calls including care-plan payload dumps.

## Sweep 4: dataMode registry review (wave-2 adversarial pass)

Resolution order (session > per-seam env > global env > legacy > default) is correct and was already well tested. Modes are not secrets; nothing sensitive leaks client-side. Three defects found, all fixed in place:

1. MATERIAL: src/lib/hooks/useFhirModeSync.ts wrote a session override unconditionally on mount, so the client-side default stomped any env-configured fhirStore mode before the user ever touched the toggle (env config silently dead on the client, and a server on `production` could pair with a client claiming and serving mock). Fixed: the hook writes an override only when the UI state diverges from the registry's resolved mode.
2. `setSessionDataMode()` accepted any runtime value unvalidated; a bad caller could silently corrupt resolution. Fixed: throws TypeError on an invalid mode (fail-loud per conventions §6). Test added.
3. Env values were case-sensitive; `DATA_MODE=Production` was silently ignored and fell back to mock. Fixed: case-insensitive parse. Test added.

Documented limitation (left): `DATA_MODE_*` vars are server-only and `readEnv` uses dynamic `process.env[name]` access, which Next.js does not inline into client bundles, so client code can only see the registry default, session overrides, and the statically-inlined legacy `NEXT_PUBLIC_USE_MOCK_DATA` (via appContext). Making the browser's mode claim reflect server env config needs a small /api/config exposure; out of scope for a re-sweep.

## Sweep 5: Report style

Zero "em dash followed by a space" occurrences in CYCLE1A_REPORT.md, CYCLE1B_REPORT.md, and CYCLE1_WAVE2_REPORT.md; nothing to fix.

## Verification (final state)

- `npx tsc --noEmit`: exit 0, no diagnostics.
- `npx vitest run`: Test Files 45 passed (45); Tests 337 passed | 9 skipped (346). The 9 skips are the tests/api cases owned by the concurrent route-test cycle (unchanged from wave 1). This pass added 2 tests to tests/config/dataMode.test.ts.
- `bash check-file-sizes.sh`: PASS, no new violations, ratchet intact (75 frozen legacy files unchanged or smaller; none touched by this pass).

## Verdict: NOT-DRY

This re-sweep found 5 new material defects missed by wave 1 or introduced by wave 2 (4 determinism-straggler lib files plus the mount-time session-override stomp in the dataMode wiring), which is at or above the 3-defect DRY threshold even though all gates pass. One more convergence pass is warranted; its expected scope is small: the 5 documented persona leave-items, the client-side mode-claim exposure, and re-running the four greps.

## Second pass (2026-08-22)

Narrow re-sweep of the four greps plus a correctness review of the first pass's edits (demoDefaults wiring across the 8 files, the useFhirModeSync guard, dataMode fixes). The 6 documented leave-outs were treated as settled and are not re-counted.

New findings: 2 (1 material, 1 minor).

1. MATERIAL: src/lib/mockData.data2.ts — the sweep-2 exclusion covered the file's frozen data portions, but its runtime mutation methods also mint state time/randomness: `closeGap()` stamped `metric.lastUpdated`, `lastActionDate`, and gainshare `closureDate` with `new Date()`, and `resetDemo()` re-minted 5 metric timestamps and rolled `daysOpen` with `Math.random()`. Same defect class as the workflowMachine reducers fixed in the first pass. Fixed: all sites (module-init data literals included, since routing them costs nothing) now use `clock.nowIso()` / `clock.rng()` via the existing seam. One import line added; file is 447 lines against its 450-line frozen baseline, ratchet intact.
2. MINOR: src/lib/patientContext.tsx line 58 kept a stale hardcoded `'patient-maria'` alias in the initial-state selection after the first pass's DEMO_MEMBER_ID edit. The condition was dead (the line-59 fallback returns the same state, and no such id exists — the FHIR id is `patient-maria-001`). Fixed: literal removed; behavior unchanged.

No new defects found in the first pass's own edits: all 8 DEMO_MEMBER_ID imports resolve (demoDefaults imports nothing, so no cycle is possible), the useFhirModeSync compare-before-write guard is correct, and the dataMode validation/case-insensitivity fixes hold with their tests. The determinism grep now returns only the named leave-outs (smartFhirMockData.ts, devStubs.pas.ts, log.ts); the console log/debug grep returns zero; the persona grep's remaining hits are demo data/seed/comments or documented leave-outs.

Verification (final state): `npx tsc --noEmit` exit 0; `npx vitest run` Test Files 45 passed (45), Tests 337 passed | 9 skipped (346, skips unchanged, owned by the route-test cycle); `bash check-file-sizes.sh` PASS, 75 frozen legacy files unchanged or smaller.

### Final verdict: DRY

1 new material defect (< 3 threshold). Cycle 1 converges here. Open follow-ups carried forward, none blocking: holisticContextEngine data-module migration, md-smart-launch.backup deletion, and the /api/config exposure for the client-side mode claim.
