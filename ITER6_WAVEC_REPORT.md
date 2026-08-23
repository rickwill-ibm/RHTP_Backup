# Iteration 6 — Wave C report (register fold-in fixes + convergence + red-team)

Wave C closes two carried register findings, converges Waves A/B (four new
care-coordination domains, record now **11/20**), and runs the mandatory
three-persona red-team against the four domains + the two fixes.

## PART 1 — register fold-in fixes

### 1.1 — dead-letter retry/replay idempotency (HIGH, register R1-DL2 / NS-04-producer)

The dead-letter producers did not reuse the I5 idempotency primitive, so a
double-clicked or replayed `retry` could double-inject a record back into the
pipeline/outbox. Fixed in `src/lib/deadLetter/review/index.ts`:

- **Terminal short-circuit** (no store needed): a record already
  `resolved | dismissed | retried` is never re-submitted through a lane — a
  sequential replay of `retry` on a closed record returns `reason:'deduped'` and
  fires no lane. Defence-in-depth that holds even if no idempotency store is wired.
- **Durable claim-once guard** (NS-04 primitive reused): `reviewAction` gained an
  optional `idempotency?: IdempotencyStore` param. When supplied, it CLAIMS
  `(record-id + action)` in the new consumer namespace
  `IDEMPOTENCY_CONSUMERS.deadLetterReview = 'dead-letter-review'` **before any
  effect**; a concurrent or replayed duplicate is deduped before the lane fires.
- **Route wiring**: `src/app/api/ops/dead-letter/[id]/route.ts` passes
  `getIdempotencyStore()` — so the production path is guarded by the pg marker store.
- Tests (`tests/deadLetter/review.test.ts`, +4): double-click retry (lane fires
  ONCE), concurrent retries (single winner), replayed resolve (terminal
  short-circuit, one resolution version), already-retried never re-injected.

### 1.2 — 834 INS-3 maintenance-type fix (CRITICAL, register F1)

`src/lib/pipeline/adapters/eligibility834.ts` ignored INS-3 and hardcoded
`status: 'active'`, so a termination re-enrolled instead of disenrolling. Fixed:

- Parse INS-3: **021 add**, **001 change** → `active` (`coverage.enrolled` /
  `coverage.changed`); **024 termination**, **030 cancellation** → `terminated`,
  `disenrolled:true` (`coverage.terminated` / `coverage.cancelled`).
- Parse **DTP*349** (coverage end) for terminations; **DTP*348** (begin) for
  adds/changes. Validation requires the right date per action.
- **Fail-closed**: an UNKNOWN INS-3 quarantines `unknown-maintenance-type` — never
  silently active. `normalize` additionally throws a fail-closed-loud invariant if
  ever reached with an unknown code (the prior latent `?? '021'` fail-open default
  was removed; `transform.ts` rethrows non-held errors).
- **Graph**: `mapping/coverage.ts` closes the `HAS_COVERAGE` edge validity at
  `periodEnd` for a termination, so an asOf query after the end date sees the member
  DISENROLLED (`periodEnd || null` keeps add-only events byte-identical).
- Fixture `tests/pipeline/fixtures/eligibility834-termination.json` + test
  `tests/pipeline/eligibility834Termination.test.ts` (add→active, term→disenrolled
  with `periodEnd`, unknown→fail-closed, reconciliation).
- **Honest deferral**: full 834 code-set fidelity (025 reinstatement, 002
  audit-compare, retro-term span/gap, COB/secondary) is out of scope — those
  quarantine (fail-closed) rather than being mis-processed. The add-vs-term
  distinction — the load-bearing one — works.

## PART 2 — convergence verdict

- **Namespace split coherent**: frozen `domainNamespaceIntegrity.test.ts` carries
  NOTE pointers to `.waveA` (care-team, goals-tasks) and `.waveB` (referrals,
  immunizations) companion suites. All four domains pinned; no gap.
- **`WpcDomain` union = 11 domains** (complete).
- **Determinism**: only `new Date(deps.now())` (injected-clock pattern) in new
  adapters/mappings; no raw `Date.now`/`new Date`/`Math.random`. `console.*` = 0.
- **Ratchet/sizes** PASS; every new/edited src file < 400.
- **Care-team lens (I2) GREEN** after the mapping extension (10 tests).
- **Referral provider refs** kept raw + `providerResolution:'deferred-I8A'`; no
  invented NPI.

## PART 3 — red-team panel (every persona produced findings; routed to register)

- **R1 Domain-Fidelity — 5**: 2 HIGH (R1-I6-1 referral loop-closure/`ServiceRequest.status`
  lifecycle absent; R1-I6-2 goal status/achievement transitions absent), 3 MED
  (care-team `participant.period`/churn thin; immunization CVX-display + ACIP
  forecasting absent; 834 add-vs-term only — no reinstatement/retro-term/COB).
- **R2 Negative-Space — 7-item missing-list**: referral loop-closure state machine,
  care-team membership effective dates + churn, goal achievement/target, immunization
  dedup across sources, unknown-CVX handling, performer NPPES resolution, 834
  reinstatement/retro-term/COB + retry-after-reject ergonomics.
- **R3 Stub-Legitimacy — 3 Acceptable, 0 Risky, 0 Unacceptable** (1 MED caveat: the
  `idempotency` param is optional — sole production caller passes it; recommend a
  governance pin). Fail-open sweep clean; the one latent fail-open (834
  unknown-as-active default) was found in self-review and FIXED before merge.

**Unacceptable fixed this iteration: 1** (834 latent fail-open default →
fail-closed-loud). No new CRITICAL.

## Verification

- `npx tsc --noEmit` = **0**.
- `npx vitest run` = **fully green**: 1038 passed, 1 expected-fail (pre-existing
  xfail), 91 skipped (152 files). +8 new tests this wave (834 term 4, review
  idempotency 4).
- `bash check-file-sizes.sh` = **PASS** (ratchet intact).
- `npx vitest run tests/governance` = **31 passed**.

## Register

`verification/GAP_AND_STUB_RISK_REGISTER.md` updated: Iteration-6 section appended —
F1 CLOSED (add-vs-term), R1-DL2 idempotency HIGH CLOSED, convergence verdict, and
all R1/R2/R3 findings with severity + owning iteration.

## DRY verdict

**DRY.** The idempotency fix REUSES the existing NS-04 primitive (`IdempotencyStore`,
`markProcessed`, `IDEMPOTENCY_CONSUMERS`) rather than re-implementing dedupe — the
same claim-once-before-effect pattern the two agents and the SDE intake already use.
The 834 fix EXTENDS the existing adapter + coverage mapping in place (no parallel
adapter); the maintenance-type map is a single source of truth for status/event/
disenrollment. No duplicated logic introduced.
