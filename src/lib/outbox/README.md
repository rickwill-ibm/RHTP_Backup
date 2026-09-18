# Outbox-intent propagation (`src/lib/outbox`)

The single mechanism by which a domain event is born. Implements ADR-006 as
amended by amendment-001 §2. **Dual-write is banned**: no code writes to the FHIR
store and publishes an event independently. Every change begins as a transactional
intent row; the event is published only after the FHIR write is confirmed.

Iteration 2's graph projector (and the SDE intake, and metric projections) consume
the C2 events this library emits. Build it clean; everything downstream depends on
its ordering guarantees.

## The five steps (amendment §2)

1. **Intent commit** — `OutboxWriter.enqueue` commits a `pending` intent row to the
   application Postgres transactionally (unique on `idempotencyKey`, so a re-submit
   is a no-op). Full C2 payload, deterministic FHIR id, actor, correlationId.
2. **Idempotent FHIR apply** — `pump` PUTs the resource to its deterministic id over
   the REST seam (`FhirApplier`). Safe to retry any number of times. No event yet.
3. **Confirm + sequence + publish** — on a confirmed FHIR commit, the intent is
   claimed and sequenced in ONE atomic data-layer compare-and-set
   (`OutboxStore.claimForConfirm`): a single `UPDATE ... WHERE status='pending'
RETURNING` flips exactly one row `pending -> confirmed` and stamps its next
   **per-member sequence** server-side. Whoever loses the race (the live writer vs
   the sweep, or a second instance) gets `null` and publishes **nothing**. The C2
   event is then published to the backbone (`EventPublisher`) and marked
   `published`. Events emit **only** after confirm; sequence order = confirm order
   = publish order per member.

   **Exactly-once (multi-writer hardening).** The `MemberLock` is a partition-affine
   single writer _within one process_; it cannot serialize two instances or the
   writer racing the sweep. Two data-layer guarantees close that gap:
   `claimForConfirm`'s CAS (only one worker can move a row off `pending`), and a
   `UNIQUE (member_id, sequence)` constraint that rejects any duplicate per-member
   sequence slot as a backstop (the claim retries on collision, re-reading MAX).
   Sequence is assigned **server-side inside the claim**, never app-side `MAX+1`.

4. **Per-member FIFO** — a later intent never enters step 2 before every earlier
   intent for that member is confirmed or terminally failed. A transient failure
   halts that member's drain (other members proceed); this makes the S4 inversion
   class structurally impossible.
5. **Reconciliation sweep** — `OutboxSweeper.sweep` visits `pending` intents older
   than a threshold (default 5 min), queries the FHIR store at the deterministic id,
   and either confirms (write landed, crash before confirm) or retries; intents that
   exhaust the retry budget move to `failed` with an alarm plus a quarantine item.

## Seams

| Seam         | Interface        | Mock                      | Real                                     |
| ------------ | ---------------- | ------------------------- | ---------------------------------------- |
| intent table | `OutboxStore`    | `createMemoryOutboxStore` | `createPgOutboxStore` (pg / pg-mem)      |
| FHIR write   | `FhirApplier`    | test fake                 | REST PUT to HAPI (wired later)           |
| backbone     | `EventPublisher` | test fake                 | Kafka-API relay (`SEAM: event-backbone`) |

`SEAM: cdc-relay` — a Debezium-class reader over the same `outbox_intent` table
could replace the writer/relay without touching producers or consumers.

## Ordering / retention

- Ordering is per member only (`partitionKey = memberId`); cross-member order is
  never promised (C10.2). The `MemberLock` is the partition-affine single writer.
- The `outbox_intent` table is append-mostly and retained per the audit policy
  (amendment §3): it is the **sanctioned per-member ordered event history**, read by
  `memberId + sequence` for targeted projector rebuilds — never a topic scan.

## Determinism

Clock and rng are injected via `OutboxDeps.now` / `OutboxDeps.rng` (bind to
`src/lib/clock.ts`). Event ids are rng-derived, so the whole path is testable
without mocking globals. C2 envelopes are validated at the publish boundary
(`validateEnvelope`) against the contracts.md C2 schema.

## Tests

- `tests/outbox/*.test.ts` — pg-mem-backed: intent commit -> confirm -> event order,
  idempotent retry, per-member FIFO, orphan sweep. The store contract suite runs
  against BOTH the memory and pg-mem stores.
- `tests/integration/outbox.testcontainers.test.ts` — the same flow against real
  Postgres, plus the `UNIQUE(member_id, sequence)` rejection and a writer-racing-
  the-sweep **exactly-once** assertion; skips with a clear reason when Docker is
  absent (for the owner's CI).
