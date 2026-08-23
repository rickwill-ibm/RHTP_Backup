# Iteration 11 — Wave C (Care-coordination lifecycle) Report

Role: Care-coordination lifecycle specialist (B2), disjoint tree. Framework v1.2.
Scope owned: `referral.ts` lifecycle + `goalTask.ts` lifecycle + `survivorship/rules.ts` (winnerForField) tiebreak, and the three tests
`tests/pipeline/referralLifecycle.test.ts`, `tests/pipeline/goalStatus.test.ts`, `tests/identity/survivorshipTiebreak.test.ts`.

## 1. Referral loop-closure (`src/lib/graph/mapping/referral.ts`) — DONE

- **ServiceRequest.status lifecycle** `active -> on-hold -> completed | revoked | entered-in-error`, exported as `REFERRAL_STATUSES`.
  Captured as a **dated trail** (`statusTrail: string[]` of `status@date`) from an optional `statusHistory`, not a snapshot, so the
  transitions are inspectable. A derived `statusTerminal` boolean marks the three terminal states.
- **Closed-loop signal** `scheduled | seen | declined | dropped`, exported as `LOOP_SIGNALS`. Stamped on the ServiceRequest node as
  `loopStatus` plus two derived booleans that make the **closed-loop rate computable off the node alone**:
  - `loopClosed` — a terminal signal landed (`seen`/`declined`/`dropped`); `scheduled` is in-progress, not closed.
  - `loopReached` — the reached close (`seen` only) — the numerator of the closed-loop (seen) rate.
- **Linkage preserved**: `REFERRED_VIA` (member, associative order link) and `REFERRED_TO` (performer) still project unchanged.
- **E9**: default status is `active` (open) and default loop signal is `''` (unknown). A missing status/signal can never silently
  complete or close a referral. Proven by an explicit E9 test.

## 2. Goal achievement (`src/lib/graph/mapping/goalTask.ts`) — DONE

- `lifecycleStatus` `proposed -> active -> completed | cancelled` (`GOAL_LIFECYCLE_STATUSES`), `achievementStatus`
  `in-progress | achieved | not-achieved` (`GOAL_ACHIEVEMENT_STATUSES`), and a `target` field added to the Goal node.
- A goal is **MET** via `isGoalMet` / node prop `met` — true only when `lifecycleStatus === 'completed'` AND
  `achievementStatus === 'achieved'`. `completed + not-achieved` and `active + in-progress` are correctly not met.
- **Task.focus -> Goal linkage** kept: a task with `goalRef` attaches `HAS_TASK` from its Goal; a free-standing task from the Member.
- **E9**: defaults are the OPEN states (`active` / `in-progress`), so `met` is derived, never defaulted true.

## 3. Survivorship source-order tiebreak (`survivorship/goldenRecord.ts` + `types.ts`) — DONE

- The declared `tiebreak` was validated but **ignored** — `winnerForField` always used most-recent. Added `resolveTie`, threaded the
  ruleset's `tiebreak` into both the within-rank pick and the recency-fallback branch:
  - `most-recent` (default, unchanged): newest `asOf` wins.
  - `source-order`: the fact the source **declared first** (input order) wins, regardless of timestamp — deterministic, does not chase recency.
- **Provenance-labeled**: `FieldProvenance.tiebreak` now records which tiebreak decided each field.
- Higher-ranked source still outranks the tiebreak (tiebreak only breaks ties within a rank). Facts are never mutated; derivation reproducible.

## Verification (in `/home/claude/baseline`)

- `npx tsc --noEmit`: **my owned files are clean.** The only 6 errors are Wave B's in-progress new-domain adapters
  (`conditions.ts`, `diagnosticReports.ts`, `familyHistory.ts`) reporting `Type '"..."' is not assignable to type 'WpcDomain'` —
  they belong to the parallel Wave B disjoint tree and require the `WpcDomain` union edit I am explicitly forbidden to make. None
  reference my files. Wave B must extend `WpcDomain` to clear them.
- `npx vitest run tests/pipeline tests/identity`: **300 passed (38 files)**, including the 23 new tests below.
- Regression check `npx vitest run tests/graph tests/carePlan`: **179 passed (25 files)** — property additions did not break shape assertions.
- `bash check-file-sizes.sh`: **PASS** (ratchet intact, no new violations).

New tests (23):
- `tests/pipeline/referralLifecycle.test.ts` — 9 (dated status trail, terminal states, four loop signals, rate computability, E9, linkage)
- `tests/pipeline/goalStatus.test.ts` — 7 (met / not-met matrix, isGoalMet, vocab, E9, Task.focus linkage)
- `tests/identity/survivorshipTiebreak.test.ts` — 7 (most-recent vs source-order disagree, fallback branch, determinism, rank outranks tiebreak)
