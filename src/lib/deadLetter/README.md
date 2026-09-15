# Dead-letter / held-review store (NS-01)

Closes register finding **NS-01 (CRITICAL)**: quarantine records, held-identity
records (EMPI 60-90 band), and failed-outbox intents were built as return values
then **dropped** — a held member silently disappeared. This subsystem gives all
three a durable, append-only home plus a reviewer surface, and wires them at the
call sites so nothing vanishes.

## Record kinds (register-pinned enum)

| kind            | producer                                              | reason it lands here                         |
| --------------- | ----------------------------------------------------- | -------------------------------------------- |
| `quarantine`    | pipeline stage 2 (structural) + stage 4 (profile/sem) | record failed validation, never loaded       |
| `held-identity` | pipeline stage 3 identity seam (EMPI 60-90 band)      | possible-match, held from auto-linking       |
| `failed-outbox` | outbox `failIntent` (retry budget exhausted)          | intent could not propagate; needs a decision |

Every record is **PHI-safe**: ids, codes, and references only. `memberRef` is an
anchored member id (`mem-xxxx`) or a source handle (`system:feed`); `payloadRef`
points to where the raw record lives (batch id + quarantine id, or intent id),
never the raw payload. `assertDeadLetterPhiSafe` guards the invariant.

## Store

`getDeadLetterStore()` resolves the `deadLetterStore` dataMode seam:

- **mock / seeded** → the in-memory append-only store (`defaultDeadLetterStore()`) — the demo stays green by default.
- **production** → the Postgres append-only store, via a registered factory; throws `DeadLetterStoreNotConfiguredError` until one is wired (fail-closed).

Disposition: **fail-closed-stub** (declared in `seamDispositions.ts`, matches the
evidence ledger). Append-only by construction: append + resolve both write a new
immutable version; `get` returns the latest snapshot, `list(byKind,byStatus)`
the latest per record. There is no update/delete method. The pg store runs on
real `pg` and in-process `pg-mem` alike; a `.pg.sql` immutability trigger
(real-Postgres-only) makes the append-only posture defense-in-depth.

## Call-site wiring (the fix)

- **pipeline** — `runPipeline` calls `persistPipelineDeadLetters(store, quarantined)`; `quarantined` already includes the held-for-review subset, so each record is persisted once with its kind derived from status.
- **outbox** — `failIntent` persists the exhausted intent via the injected `QuarantineSink`, or (when none is wired) `deadLetterQuarantineSink(getDeadLetterStore())`, so a failed intent is never dropped.

## Reviewer surface (`review/`)

A **distinct** surface from the clinical work queue — a reliability/ops queue, not
a second clinical inbox.

- `listOpenItems(store, {kind?,status?})` — open items by kind.
- `inspectItem(store, id)` — one item.
- `reviewAction(store, {id, action, actor}, router)` — `resolve` / `dismiss` (status transition) or `retry` (re-submit through the kind's lane, marked `retried` only when the lane accepts). Each action returns a PHI-safe audit descriptor.

Retry lanes are registered by the composition root via `setDeadLetterRetryLane`;
until a lane is registered for a kind, retry over it fails closed
(`retry-lane-not-configured`).

## BFF

- `GET /api/ops/dead-letter?kind=&status=` — list.
- `POST /api/ops/dead-letter/[id]` `{ action }` — resolve / retry / dismiss.

Ops-scoped authz via `isOpsPrincipal` (payer-ops or admin, **not** pa-reviewer).
BFF-only, PHI-safe bodies.
