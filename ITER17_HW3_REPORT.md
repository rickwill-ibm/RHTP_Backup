# Iteration 17 — HW3: CRUD lifecycle + correction/void + re-processing (core: content-hash idempotency)

Phase 2 · program-spine contract **C-LIFE** · framework v1.5 · constraints #1–#3.

## Definition of Ready
- NFR manifest: a true resend must dedupe, a CORRECTION (same key, changed content) must RE-project
  (RP-01); entered-in-error must void/retract, never hard-delete (CRUD-02); tenant-scoped + audited;
  demo-safe (in-memory, zero backend); production fail-closed.
- Lens-coverage: reprocessing (owning), CRUD-correctness, negative-space (a key-only idempotency
  store silently drops corrections), stub-legitimacy (durable-or-throw).
- Consumes: C-DEMO, C-TEN, C-STORE, C-AUD. Freezes for downstream: **C-LIFE** (`RecordLifecycleStore`,
  `contentHash`, `classify`) — HW-FIN diagnosis void/retract and HW4 corrections build on it.

## What landed (all real, WIRED, gated)
- `src/lib/lifecycle/recordLifecycle.ts` — content-hash classifier: `new` / `unchanged` (dedupe) /
  `correction` (re-project, RP-01) / `void` / `revoid`; SHA-256 order-independent `contentHash`;
  in-memory store + fail-closed durable factory; entered-in-error lifecycle (CRUD-02).
- **Real entry point** — `src/app/api/records/[type]/[id]/route.ts`: `PUT` (correction/amend,
  content-hash classified) + `DELETE` (entered-in-error/void, never a hard delete). Tenant-scoped
  (C-TEN), reviewer/ops authz, audited to the tamper-evident ledger (C-AUD).
- `src/lib/lifecycle/index.ts` — C-LIFE surface exported.
- Tests: `tests/lifecycle/recordLifecycle.test.ts` (6) — hash stability, all 5 dispositions, and the
  RP-01 scenario (resend dedupes, correction re-projects).

## Proof of wiring (ratchet shrank again)
E14: entries **228→229** (records route), reachable **554→564 (+10)**, lib orphans **130→122** — the
CRUD route pulled `recordLifecycle` AND 8 previously-orphaned lifecycle modules (purge, right-to-delete,
legal-hold, adapters, policy, audit) into a wired path. `wiring-baseline.json` re-frozen at **122**.
Across HW1+HW-AI+HW3 the unwired backlog has now burned down **134 → 122**.

## Gate results
tsc 0 · lifecycle tests 6 pass · E14 122/122 (orphans −8, reachable +10) · demo-preservation 26 pass.

## Scope honesty — remaining HW3 breadth (follow-on)
Delivered the reprocessing keystone (content-hash idempotency + void). Remaining HW3 items — consent-
directive CRUD store (CRUD-01), care-plan versioning/status lifecycle (CRUD-04), EMPI merge/unmerge +
held-identity adjudication surface (CRUD-05), raw-payload retention for dead-letter re-drive (RP-02),
effective-time/bitemporal projection (RP-03), replay-from-log wiring (RP-04/05), 834 reconciliation
(REC-06) — are scheduled follow-on. The durable pg lifecycle store is the NS-05 live-infra step.
