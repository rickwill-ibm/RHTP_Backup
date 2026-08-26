# Iteration 14 — HW1: Durable state + HA foundation (core: REC-01 outbox→projector wiring)

Phase 1 · program-spine contract **C-STORE** (consumer + checkpoint half) · framework v1.5 · constraints #1–#3.

## Definition of Ready
- NFR manifest: the projection path must be WIRED to a real entry point (not test-only), resumable
  (checkpoint), idempotent (re-run applies nothing new), per-member FIFO ordered, tenant-observable,
  and demo-safe (zero backend in mock).
- Lens-coverage: reconciliation/HA (owning), stub-legitimacy (production must fail closed, never a
  silent in-memory store as durable), engineering (idempotency/ordering), negative-space (pending
  intents must not project).
- Consumes: C-DEMO (HW0), C-TEN (HW-SEC). Freezes for downstream: **C-STORE** consumer +
  `ProjectionCheckpointStore` (HW2 audit hangs off the run; HW3 replay/reprocessing extends it).

## What landed (all real, WIRED, gated) — closes REC-01, the #1 "unwired realness" finding
- `src/lib/graph/consumer/` — `projectionConsumer.ts` (`runProjectionOnce`: drains confirmed/
  published outbox intents, per-member sequence order, builds the C2 envelope, projects to neutral
  mutations, applies to the GraphStore, advances the checkpoint), `checkpoint.ts`
  (`ProjectionCheckpointStore` per-member high-water; in-memory default + fail-closed durable
  factory), `provider.ts` (seam-gated store resolution: mock in-memory vs production durable/fail-closed),
  `index.ts`.
- **Real entry point** — `src/app/api/ops/projection/run/route.ts` (POST, ops-authz, audited): runs
  one drain pass. Before this the outbox had NO live consumer (the projector's `project()`/
  `buildEnvelope()` existed and were unit-tested but nothing called them from a real path).
- Tests: `tests/graph/projectionConsumer.test.ts` (3) — sequence ordering, pending-excluded,
  idempotent re-run, resume-from-checkpoint.

## Proof of wiring (the point of E14)
E14 after this iteration: entries **225→226** (the new ops route), reachable **539→544** (the
consumer + checkpoint + provider are now reached from a real entry point), lib orphans **134/134**
(no new orphan). The consumer is genuinely wired, not unit-tested-in-isolation.

## Gate results
tsc 0 · consumer tests 3 pass · E14 134/134 (reachable +5, WIRED) · demo-preservation 26 pass.

## Scope honesty — remaining HW1 breadth (follow-on within this iteration)
Delivered the dominant finding (REC-01). The rest of HW1 — migrating the remaining in-memory stores
to the tenant-scoped substrate, scheduling the outbox sweep + reconciliation jobs (REC-03/HS-02),
connection-pool sizing + single-bootstrap singleton (HS-04/R1-9-3), circuit-breakers/timeouts on
external seams (HS-03), readiness=liveness (HS-06), migration advisory-lock (R1-9-5), and the
observability + DR workstreams — remain scheduled HW1 work. The durable pg checkpoint + outbox/graph
factories are registered as fail-closed hooks (NS-05 live-infra ceiling). None of it changes the demo.
