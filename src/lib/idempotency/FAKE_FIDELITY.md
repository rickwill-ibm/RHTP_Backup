# Fake-fidelity ledger — in-memory IdempotencyStore vs real Postgres (L1)

The idempotency seam is verified in CI against the **pg-mem** in-process Postgres
and the **in-memory** store, because real Postgres needs a running server and this
sandbox has no Docker. Per the L1 rule (fake-fidelity ledger required where a fake
hides concurrency), this file names EXACTLY what the fakes do NOT model, so no
reader mistakes a green unit suite for production-durable dedupe. The gap has a
matching Docker-guarded assertion in
[`tests/integration/idempotency.testcontainers.test.ts`](../../../tests/integration/idempotency.testcontainers.test.ts),
which skips-with-reason until a Postgres/Docker environment runs it in CI.

Both fakes are faithful to the store CONTRACT (`markProcessed` check-and-set,
`isProcessed`, per-consumer namespace, first-writer-wins). The distinction:

| # | Property | Real Postgres | The fakes | Risk if confused |
|---|---|---|---|---|
| 1 | **Cross-process concurrency** | `PRIMARY KEY (consumer, event_id)` + `INSERT ... ON CONFLICT DO NOTHING` serialize two SEPARATE database connections/processes racing the same pair; exactly one row lands. | The **in-memory** store's atomicity is the JS single-writer model — real only for same-process overlap. **pg-mem** runs in one Node process and does not model true multi-connection contention. | A two-replica deploy is assumed deduped by the in-memory store, which each replica holds privately — double-send returns. Only the pg store (shared table) is safe. |
| 2 | **Durability across restart** | Markers persist in the table; a consumer restart still sees `firstProcessed: false` for an already-processed event. | The in-memory store's `Set` is lost on restart; the process-global default resets. | A republish just after a restart double-produces. The pg store is the durable path. |
| 3 | **Constraint-enforced uniqueness** | The composite primary key is enforced by the engine even under partial failures / retried transactions. | pg-mem approximates ON CONFLICT; the in-memory store enforces it only within its own `Set`. | A path that bypasses `markProcessed` (raw insert) would be caught by real PG, not the fakes. |

## What the fakes DO guarantee (and the integration spec re-checks)

- A second `markProcessed` of the same `(consumer, eventId)` returns
  `firstProcessed: false` (the republish no-op).
- Concurrent overlapping claims for one pair yield exactly one winner
  (same-process for the in-memory store; the testcontainer spec proves it across
  real connections).
- Per-consumer namespace isolation: the same eventId is an independent marker for
  each consumer.

## Production wiring

`getIdempotencyStore()` returns the in-memory store ONLY in mock/seeded mode. In
production it throws `IdempotencyStoreNotConfiguredError` until a pg factory is
registered (`setProductionIdempotencyStoreFactory`), so the low-fidelity fake can
never silently back a production deploy. Declared `fail-closed-stub` in
`seamDispositions.ts`.

## How to run the real spec

```
DOCKER_HOST=... npx vitest run tests/integration/idempotency.testcontainers.test.ts
```
