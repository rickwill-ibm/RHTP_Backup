# Iteration 15 — HW2: Audit + disclosure integrity (core: tamper-evident ledger + real actor)

Phase 1 · program-spine contract **C-AUD** · framework v1.5 · constraints #1–#3.

## Definition of Ready
- NFR/regulatory manifest: the audit trail must be TAMPER-EVIDENT (modification/deletion/insertion
  detectable + located), attributable to a REAL actor (not a constant), PHI-safe, never break a
  request flow, config-switched (in-memory demo vs durable production), fail-closed.
- Lens-coverage: audit/compliance (owning), security (integrity), stub-legitimacy (durable-or-throw),
  negative-space (a plain JSONL sink is silently editable).
- Consumes: C-DEMO, C-TEN, C-STORE. Freezes for downstream: **C-AUD** (`AuditLedger`, `verifyChain`)
  — HW3/HW-FIN/HW4 mutating actions record through the same tamper-evident spine.

## What landed (all real, WIRED, gated)
- `src/lib/server/auditLedger.ts` — hash-chained tamper-evident ledger:
  `hash = SHA-256(canonical(event) || prevHash)` (node:crypto), `verifyChain()` detects and LOCATES
  the first break, in-memory default + fail-closed durable factory (`AuditLedgerNotConfiguredError`).
- `src/lib/server/audit.ts` — `audit()` now appends every PHI-safe event to the chain alongside the
  JSONL sink; never throws (a mis-configured durable ledger raises the existing fallback, not a fake).
- **Real entry point** — `src/app/api/ops/audit/verify/route.ts` (GET, ops/auditor authz, audited):
  recomputes the chain and returns intact/broken(+location). The operable tamper-evidence surface.
- **AUD-02 fixed** — `src/app/api/fhir/[...path]/route.ts` now audits with the resolved session
  principal (`getPrincipal(...).userId`), replacing 4 hardcoded `'session-user'` actors.
- Tests: `tests/server/auditLedger.test.ts` (4) — intact chain, modification detected+located,
  deletion detected, hash determinism + prev-dependence.

## Proof of wiring
E14: entries **226→227** (audit-verify route), reachable **544→546** (ledger reached via `audit()`
and the verify route). 134/134 orphans, PASS. Demo-preservation 26 pass; FHIR passthrough 7 pass.

## Gate results
tsc 0 · audit-ledger tests 4 pass · audit-suite 35 pass (no regression) · E14 134/134 (reachable +2) ·
demo 26 pass.

## Scope honesty — remaining HW2 breadth (follow-on)
Delivered the compliance blocker (tamper-evident ledger + real actor). Remaining HW2 items — persist +
time-box Part 2/break-glass audit (R1-I7-2/3), before-after on every mutating/admin/EMPI/purge/PA
action (AUD-07/08/09), accounting-of-disclosures + read-audit + RADV/OCR export (AUD-10), retention
enforcement — are scheduled follow-on. The durable pg ledger (append-only + immutability trigger, like
the evidence ledger) is the NS-05 live-infra step; the chain logic is production-real now.
