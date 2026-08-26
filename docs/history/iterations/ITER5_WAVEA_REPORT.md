# Iteration 5 — Wave A report: dead-letter / held-review subsystem (NS-01 CRITICAL)

Closes register finding **NS-01 (CRITICAL)**: quarantine records, held-identity
records (EMPI 60-90 band), and failed-outbox intents were built as return values
then **dropped** — a held member silently disappeared. They now have a durable
append-only home, are persisted at the call sites, and have a reviewer surface +
ops BFF.

## 1. The store — `src/lib/deadLetter/`

An append-only store over three register-pinned kinds (`quarantine` |
`held-identity` | `failed-outbox`), each an immutable append with
`{ id, kind, status (open|resolved|dismissed|retried), memberRef (PHI-safe),
reasonCode, sourceRef, payloadRef (PHI-safe, no raw PHI), createdAt, resolvedAt,
resolvedBy, resolutionAction }`. Operations: `append`, `list(byKind, byStatus)`,
`get`, `resolve(action, actor)`. Resolve is a new immutable version (never a
mutation), so full history is preserved; `list`/`get` return the latest snapshot.

- `types.ts` — enums, `DeadLetterRecord`, `DeadLetterStore`, `PgLike`, type guards, deterministic id.
- `memoryDeadLetterStore.ts` — in-memory append-only reference (mock/seeded default).
- `pgDeadLetterStore.ts` — pg-backed store (runs on real `pg` and `pg-mem`); version derived atomically from a subselect, unique `(record_id, record_version)`.
- `schema.ts` + `migrations/001_create_dead_letter.sql` + `002_dead_letter_immutability_trigger.pg.sql` (real-Postgres-only UPDATE/DELETE-refusing trigger).
- `index.ts` — seam selector `getDeadLetterStore()`, `DeadLetterStoreNotConfiguredError`, factory setter.
- `composition.ts` — lazy production pg pool wiring (`registerProductionDeadLetterStore`).
- `persist.ts` — the call-site mappers + PHI-safety guard.

Deterministic via `clock.ts` (createdAt/resolvedAt). All files ≤176 lines.

## 2. Call-site wiring — what used to drop, now persists

- **Pipeline (`src/lib/pipeline/pipeline.ts`)** — `runPipeline` now calls `persistPipelineDeadLetters(store, quarantined)`. `quarantined` already contains the held-for-review subset, so each record is persisted **once**, its kind derived from status (`held-for-review` → `held-identity`, else `quarantine`). Previously these were only returned in `PipelineRunResult` and dropped by callers. Behavior preserved: the result still carries `quarantined`/`heldForReview`. A `deadLetterStore?` param overrides the seam (tests/composition); `null` opts out.
- **Outbox (`src/lib/outbox/sequencing.ts` `failIntent`)** — an exhausted intent is persisted via the injected `QuarantineSink` when one is wired, otherwise via `deadLetterQuarantineSink(getDeadLetterStore())` (kind `failed-outbox`). Previously the record went to an **optional sink that was never wired** and vanished. The dead-letter append is awaited so the failure is durable before the drain proceeds.

## 3. Reviewer surface + routes

- **`src/lib/deadLetter/review/`** — `listOpenItems`, `inspectItem`, `reviewAction` (resolve/dismiss = status transition; retry = re-submit through the kind's lane, marked `retried` **only** when the lane accepts, fail-closed otherwise). Each action returns a PHI-safe audit descriptor. `lanes.ts` is the retry-lane registry the composition root populates.
- **`src/app/api/ops/dead-letter/route.ts`** (GET list) + **`.../[id]/route.ts`** (POST resolve/retry/dismiss). Ops-scoped authz via `isOpsPrincipal` (payer-ops or admin, **not** pa-reviewer — a distinct surface from the clinical work queue, no second inbox). BFF-only, PHI-safe bodies.

Ops role model: `isOpsPrincipal` was added to `src/lib/authz/principal` reusing the
existing `payer-ops`/`admin` roles — no new role introduced, pa-reviewer
deliberately excluded (noted in code).

## 4. Seam disposition (E1)

`deadLetterStore` registered in `dataMode.ts` **and** declared in
`seamDispositions.ts` as **`fail-closed-stub`** (production throws
`DeadLetterStoreNotConfiguredError` until pg is wired; mock/seeded serve the
in-memory store). Matches how the evidence ledger did it. A governance prober was
added to `tests/governance/seamFailClosed.test.ts`, so the E1 completeness +
proof-coverage + fail-closed tests all cover the new seam and pass.

## 5. Tests

New: `tests/deadLetter/{store,review,persist,store.integration}.test.ts` and
`tests/api/routes-dead-letter.test.ts`, plus the governance prober.

- Store contract run against **both** memory and pg-mem (append / list byKind+byStatus / get / resolve / append-only / idempotent resolve / concurrency).
- Producers now persist: a **held-identity record lands via `runPipeline` and is retrievable, not dropped** (real producer path with an inline holding adapter); quarantine + failed-outbox likewise.
- Reviewer list / resolve / retry / dismiss, including retry fail-closed when no lane.
- Ops authz (non-ops principal denied 403), PHI-safety of payloads, pg-mem round-trip.
- Docker-guarded testcontainer spec (skip-with-reason) for real-Postgres uniqueness + the immutability trigger.

New dead-letter-specific tests: **44 passing + 5 skipped** (the guarded
testcontainer specs) across the five files, plus the governance prober.

## 6. Fidelity ledger note (L1)

The pg store's concurrency + append-only immutability are verified at two
fidelities: `pg-mem` for logic/round-trip (unit), and a Docker-guarded
testcontainer spec for real-Postgres BIGINT identity + the UPDATE/DELETE-refusing
trigger (skipped-with-reason in the sandbox, authored for CI). The in-memory
store does not model row-level concurrency — that gap is covered by the pg tests,
consistent with the evidence-ledger fidelity posture. The outbox
`deadLetterQuarantineSink` bridges a **synchronous** `QuarantineSink` over the
**async** store: the sink's `add` is fire-and-forget with a `drain()`/`errors`
surface so an append error is captured out-of-band rather than blocking the
outbox drain; in the default `failIntent` path the single append is awaited.

## Verification

- `npx tsc --noEmit` → **0**.
- `npx vitest run` → **fully green** (973 passed, 1 expected-fail, 91 skipped).
- `bash check-file-sizes.sh` → **PASS** (ratchet intact; every new file ≤176 lines).
