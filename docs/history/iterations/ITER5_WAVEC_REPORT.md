# Iteration 5 — Wave C: convergence + red-team panel

Convergence of Wave A (dead-letter/held-review, NS-01) and Wave B (durable
idempotency NS-04 + session-secret R5), then the mandatory three-persona red-team
panel routed to the register. Live tree: `/home/claude/baseline`.

## PART 1 — CONVERGENCE

**Shared seams clean, no merge artifact.** Both `deadLetterStore` and
`idempotencyStore` are declared once in `config/dataMode.ts` (`DATA_MODE_SEAMS`)
AND in `config/seamDispositions.ts` (`SEAM_DISPOSITIONS`), both `fail-closed-stub`.
The governance prober (`tests/governance/seamFailClosed.test.ts`) covers both — the
E1 completeness / proof-coverage / fail-closed suite is **31 passed**.

**Determinism / hygiene.** `rg Date.now|Math.random|new Date` in
`src/lib/deadLetter` + `src/lib/idempotency`: the only hit is the pg idempotency
store's injected clock default (`opts.now ?? (() => Date.now())`) — the seam, not a
raw clock; deadLetter uses `@/lib/clock`. `console.*` = **0**. `check-file-sizes.sh`
**PASS** (ratchet intact; every new subsystem file well under 400 — largest is
deadLetter `types.ts` ~180). No new file >400 (the >400 list is all pre-existing
frozen pages/components). BFF-only: the ops surface is a Next route
(`/api/ops/dead-letter`) behind `isOpsPrincipal`.

**NS-01 real closure (verified, not claimed).** A held-identity record produced by
`runPipeline` PERSISTS — `pipeline.ts` calls `persistPipelineDeadLetters(store,
quarantined)` (awaited); tests drive a real producer path and retrieve the record
via the store and the ops route. A quarantine record and a failed-outbox intent
likewise: outbox `failIntent` persists via `deadLetterQuarantineSink
(getDeadLetterStore())` and awaits `drain()`. No producer path still drops on the
happy path.

**NS-01 fault-drop found + FIXED (I5C-1, Unacceptable class).** The default
`failIntent` seam path built the sink, `drain()`ed, but never inspected
`sink.errors` — a dead-letter store WRITE failure was captured out-of-band and
SWALLOWED, silently dropping the failed-outbox record (the NS-01 defect,
re-introduced under fault). Fixed: the default path now rethrows `sink.errors[0]`
(fail-closed). New test `tests/outbox/failIntent-failclosed.test.ts` (2 cases).
The explicitly-injected `deps.quarantine` path keeps its own posture.

**NS-04 real closure.** SDE `intakeSignalsDurable` replaces the per-call `Set` with
`markProcessed('sde-intake', eventId)` — a republished stream produces no new
signals (verified `tests/sde/intakeDurable.test.ts`). Outreach + referral agents
claim-once-before-effect (`markProcessed`, consumers `outreach-agent` /
`referral-coordination-agent`), returning `outcome:'deduped'` on republish
(`tests/agents/idempotency.test.ts`, with a load-bearing control case). No
double-produce / double-send.

**R5 real closure.** `requireSessionSecret()` throws
`SessionSecretNotConfiguredError` in production without `SESSION_SECRET`; dev secret
only under the U1 double-gate; `smartSession.key()` derives the cookie key through
it (fail-closed at seal/open); static scan bans a public default.

**No second inbox.** The ops dead-letter surface is genuinely distinct from the
clinical work queue: `review/index.ts` documents it as the reliability/ops review
of records that fell OUT of the pipeline; `isOpsPrincipal` = payer-ops/admin and
DELIBERATELY excludes pa-reviewer. Justified and enforced by the route authz.

## PART 2 — RED-TEAM PANEL (all findings routed to the register)

Full detail + owners in `verification/GAP_AND_STUB_RISK_REGISTER.md` (Iteration-5
section). Counts:

- **R1 Domain-Fidelity — 5 findings.** 2 HIGH: held-identity records are NOT
  adjudicable (no candidate set, no merge/link/create-new action — `reviewAction`
  is resolve/dismiss/retry only, so an item "resolves" with no identity decision);
  producer replay is NOT idempotent (deterministic id but `append` re-pushes an
  `open` version, silently re-opening resolved items on a batch replay — the NS-04
  primitive was not applied to the NS-01 producer). 2 MED: poison-record loop
  unbounded (no retry-count/ceiling/park); no reconciliation to batch counts. 1
  Unacceptable→FIXED (the failIntent fault-drop).
- **R2 Negative-Space — 10-item missing-list.** DLQ retention/purge/TTL,
  idempotency-marker TTL, DLQ depth metrics, alerting/SLA on depth, operator
  notification, bulk resolve/retry, audit export, ops-role provisioning +
  separation-of-duties, producer replay idempotency, retry-lane production binding.
  None blocks the demo; all block a real payer/HIE data operation. Owners I6/I8/I9.
- **R3 Stub-Legitimacy — 2 Acceptable + 1 Risky.** deadLetterStore **Acceptable**,
  idempotencyStore **Acceptable** (MED fidelity caveat: mock default dedupes
  per-process only — already in FAKE_FIDELITY). retry-lane registry **Risky**:
  mechanism built + unit-tested but NO production lane wired and NOT under the
  seamDispositions gate, so retry is silently non-functional in production.
  **Bootstrapping question resolved:** because producers route through
  `getDeadLetterStore()`, an unconfigured production store makes the producer THROW
  and the operation fail LOUD *before producing the record* — records go nowhere,
  not silently dropped. No bootstrapping hole; but the dead-letter store is now a
  HARD production dependency of pipeline+outbox — a deploy-ordering constraint for
  the runbook (MED, doc-only).

**Unacceptable fixed this wave: 1** (I5C-1 / R1-DL5). No new CRITICAL.

## VERIFICATION

- `npx tsc --noEmit` → **0**
- `npx vitest run` → **975 passed**, 1 expected-fail, 91 skipped (fully green; +2 vs Wave A/B from the new fail-closed test)
- `bash check-file-sizes.sh` → **PASS** (ratchet intact)
- `npx vitest run tests/governance` → **31 passed** (both new seams covered)

## DRY / NOT-DRY verdict

**DRY.** The convergence confirmed the two waves did not duplicate machinery: both
seams reuse the ONE fail-closed-stub pattern (`getDataMode` selector + registered
production factory + `*NotConfiguredError`), the ONE governance gate, and the ONE
`@/lib/clock` determinism seam. The outbox `failIntent` reuses its existing
`QuarantineSink` seam rather than inventing a parallel path. The one place DRY was
at risk — the dead-letter producer NOT reusing the NS-04 idempotency primitive
(R1-DL2) — is documented as a HIGH finding for I6, not papered over.
