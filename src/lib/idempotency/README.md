# idempotency — durable consumer-idempotency store (NS-04)

The outbox relay is **at-least-once**: a confirmed C2 event can be republished
(the live writer racing the reconciliation sweep, a consumer crash between
performing an effect and committing its offset, a partition rebalance). Without a
durable dedupe, a republish **double-produces** signals in the SDE intake and
**double-sends** outreach / referral effects in the agents.

The prior guard (finding **NS-04**) was a `Set` local to one function call
(`intakeSignals`): it deduped within a single in-process fold and vanished on the
next delivery. This module is the durable replacement.

## Contract

```ts
interface IdempotencyStore {
  markProcessed(consumer, eventId): Promise<{ firstProcessed: boolean }>;
  isProcessed(consumer, eventId): Promise<boolean>;
}
```

- **`markProcessed`** is the load-bearing primitive: an **atomic check-and-set**
  (insert-if-absent). The first caller to claim `(consumer, eventId)` gets
  `firstProcessed: true` and owns the effect; every later or concurrently-losing
  caller gets `false` and must **skip**. Never gate an effect on `isProcessed`
  then `markProcessed` as two steps — that is a TOCTOU race two deliveries can
  both pass. Call `markProcessed` once and branch on `firstProcessed`.
- **Per-consumer namespace**: the SDE intake and each agent dedupe independently,
  so the same `eventId` processed by `sde-intake` does not suppress the outreach
  agent's own handling of it. Consumer ids live in `IDEMPOTENCY_CONSUMERS`.

## Seam (dataMode `idempotencyStore`)

`getIdempotencyStore()` resolves the mode:

- **mock / seeded** → a **process-global** in-memory store, so a same-process
  republish is deduped across calls (the demo stays green).
- **production** → the Postgres marker table, via a **registered** factory
  (`setProductionIdempotencyStoreFactory`). Until one is registered, production
  throws `IdempotencyStoreNotConfiguredError` — the standing fail-closed safe-stub
  pattern (never a silent in-memory Map presented as durable dedupe). Declared
  `fail-closed-stub` in `seamDispositions.ts` (E1), with a governance prober.

## Durability / concurrency

The Postgres store dedupes on the composite `PRIMARY KEY (consumer, event_id)`
plus `INSERT ... ON CONFLICT DO NOTHING` — the identical insert-if-absent pattern
the outbox uses for `idempotency_key`. A real concurrent double-delivery has both
transactions attempt the same insert; the constraint lets exactly one row land,
and `RETURNING` tells the caller which won.

pg logic is verified in-process with **pg-mem** (`tests/idempotency/*`); a
**Docker-guarded** testcontainer spec (`tests/integration/idempotency.testcontainers.test.ts`)
exercises real-Postgres primary-key concurrency and skips with a clear reason when
Docker is absent. The in-memory store's single-writer atomicity is real for
same-process concurrency but does not model cross-process races — see
`FAKE_FIDELITY.md`.

## Wiring

- **SDE intake** — `intakeSignalsDurable(events, tax)` replaces the in-memory Set,
  keyed by `eventId` under consumer `sde-intake`.
- **Outreach agent** — the send effect is claimed once per `touchpointId` under
  consumer `outreach-agent`; a deduped republish returns `outcome: 'deduped'`.
- **Referral agent** — the coordination action is claimed once per `referralRef`
  under consumer `referral-coordination-agent`.
