# Iteration 5 — Summary

Two operability subsystems + one security fix, delivered across three waves
(A: dead-letter/held-review, B: durable idempotency + session-secret, C:
convergence + red-team). All register-driven: NS-01, NS-04, R5 closed.

## Subsystems delivered

1. **Dead-letter / held-review store (NS-01)** — `src/lib/deadLetter/`. An
   append-only, PHI-safe, immutable-versioned store for the three record kinds the
   pipeline used to build then DROP: `quarantine`, `held-identity` (EMPI 60-90
   band), `failed-outbox`. Memory reference + pg store (pg-mem verified, real-PG
   immutability trigger, Docker-guarded testcontainer). Producers now PERSIST
   (pipeline `persistPipelineDeadLetters`, outbox `failIntent` sink). Reviewer
   surface (`listOpenItems`/`inspectItem`/`reviewAction`) + ops BFF
   (`/api/ops/dead-letter`, `isOpsPrincipal`), a DISTINCT ops surface from the
   clinical work queue (pa-reviewer excluded — no second inbox).

2. **Durable consumer idempotency (NS-04)** — `src/lib/idempotency/`. Per-consumer
   `markProcessed(consumer, eventId)` check-and-set (memory + pg PRIMARY KEY).
   Replaces the SDE intake per-call `Set` (`intakeSignalsDurable`) and guards both
   agents' send-effects — an at-least-once outbox republish no longer
   double-produces signals or double-sends outreach (`outcome:'deduped'`).

3. **Session-secret fail-closed (R5)** — `requireSessionSecret()` throws in
   production without `SESSION_SECRET`; dev secret only under the U1 double-gate;
   static scan bans a public default. Cookie forgery under a baked-in constant is
   now impossible once real auth is configured.

Both new seams are `fail-closed-stub` in `dataMode.ts` + `seamDispositions.ts`,
each with a governance prober.

## Register items closed

| id | sev | status |
|---|---|---|
| NS-01 | CRITICAL | CLOSED — durable store + operator surface; producers persist, verified end-to-end |
| NS-04 | HIGH | CLOSED — durable idempotency; SDE + both agents deduped on republish |
| R5 | HIGH | CLOSED — session secret fails closed in production |

## Red-team findings + dispositions (Wave C)

- **R1 Domain-Fidelity (5):** HIGH — held-identity not adjudicable (no candidate
  set / merge-link action); HIGH — producer replay not idempotent (re-opens
  resolved items). MED — poison-loop unbounded; MED — no batch reconciliation.
  Unacceptable→**FIXED** — `failIntent` swallowed dead-letter write failures
  (silent drop under fault). Owners I6/I8A/I9.
- **R2 Negative-Space (10):** DLQ retention/purge/TTL, idempotency-marker TTL, DLQ
  depth metrics, alerting/SLA, notification, bulk resolve/retry, audit export,
  ops-role provisioning + separation-of-duties, producer replay idempotency,
  retry-lane production binding. Owners I6/I8/I9.
- **R3 Stub-Legitimacy (3):** deadLetterStore **Acceptable**, idempotencyStore
  **Acceptable** (per-process fidelity caveat, already documented), retry-lane
  registry **Risky** (built + tested but unwired and ungoverned). Bootstrapping
  question resolved: producers fail LOUD before producing when the store is
  unconfigured — no silent drop, but a documented hard production dependency.

**Unacceptable fixed: 1** (I5C-1). No new CRITICAL.

## Real vs fake (honest ledger)

- **Real:** the dead-letter and idempotency STORE LOGIC (append-only versioning,
  check-and-set, per-consumer namespacing) runs for real against pg-mem; the
  producer wiring is real (records genuinely persist and are retrievable via the
  ops route); the fail-closed throws are real; the session-secret fix is real.
- **Fake / deferred (documented, fail-closed):** no production pg pool is wired for
  either store (both throw `*NotConfiguredError` in production until a factory is
  registered — the safe-stub pattern, not a masquerade); real-Postgres concurrency
  + the immutability trigger are proven only by Docker-guarded testcontainer specs
  (skip-with-reason in the sandbox); the retry LANE mechanism is built + unit-tested
  with a fake lane but has NO production binding, so retry is fail-closed-unusable
  in production; the held-identity review is a status-transition surface, NOT yet a
  real EMPI merge/link adjudication (R1-DL1, owned by I8A). The mock idempotency
  default dedupes per-process only (FAKE_FIDELITY).

## Verification

- `npx tsc --noEmit` → 0
- `npx vitest run` → 975 passed, 1 expected-fail, 91 skipped (green)
- `bash check-file-sizes.sh` → PASS
- `npx vitest run tests/governance` → 31 passed

## DRY / NOT-DRY verdict

**DRY.** Both seams reuse the single fail-closed-stub pattern, the single
governance gate, and the single clock seam; the outbox reuses its existing
`QuarantineSink` seam. The one DRY risk — the NS-01 producer not reusing the NS-04
idempotency primitive — is logged as HIGH (R1-DL2) for I6, not hidden.
