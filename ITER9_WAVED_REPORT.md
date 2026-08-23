# Iteration 9 — Wave D (Convergence engineer B3 + red-team host) — Report

Framework v1.2. Role: convergence engineer + red-team panel host over the
Iteration 9 deployment/operability substrate. Working tree `/home/claude/baseline`,
live. Converged Waves A (substrate) + B (deploy) + C (data-lifecycle); ran the E9
fail-open sweep and the mandatory three-persona red-team.

## 1. Convergence to DRY — the preflight now consults the substrate's single entry

Before this wave the deploy schema (B) declared FOUR phantom per-seam connection
keys — `EVIDENCE_LEDGER_URL`, `IDEMPOTENCY_STORE_URL`, `DEAD_LETTER_STORE_URL`,
`CROSS_REFERENCE_STORE_URL` — that **no resolver in the codebase reads**. The real
persistence config is the substrate's single `DATABASE_URL` entry (Wave A
`substrateConnectionString`; evidence/deadLetter composition roots read
`EVIDENCE_DATABASE_URL`/`DEAD_LETTER_DATABASE_URL` `|| DATABASE_URL`;
idempotency/crossReference are wired by the substrate-registered pg factory). Two
divergent config schemas for the same persistence.

Converged (`src/lib/deploy/schema.ts`, `src/lib/deploy/preflight.ts`):
- The four substrate-backed seams (`SUBSTRATE_BACKED_SEAMS`) map to `DATABASE_URL`.
- `preflight.ts` consults Wave A's own `substrateConnectionString()` for them
  (single source of truth for "is persistence configured"), so the preflight can
  never report ready while `bootstrapSubstrate()` would throw
  `SubstrateNotConfiguredError` at boot — **B consults A's fail-closed disposition.**
- The migration ledger + `bootstrapSubstrate` remain the single substrate entry;
  no config schema is duplicated.
- Shared partitions stayed single: Wave A touched neither `seamDispositions.ts`
  nor `env.ts`; Wave B's `env.ts` deployment-keys block is additive; no seam
  disposition changed. The remaining 10 endpoint-contract seams keep their keys
  (overclaim corrected — see §3 R3).

**Convergence DRY: YES.**

## 2. E9 fail-open sweep (deployment) — fixed-2

`rg`-ed the fail-open shapes across `substrate/ deploy/ health/ lifecycle/`. Two
Unacceptable fail-opens FIXED; every other shape justified inline.

- **E9-9-1 (Unacceptable → FIXED)** preflight passed with an unconfigured required
  seam: the four substrate seams were checked against phantom keys nothing reads,
  so `EVIDENCE_LEDGER_URL` set + `DATABASE_URL` unset → READY while
  `getEvidenceStore()` throws at first request. FIX: remap to `DATABASE_URL` +
  consult the substrate resolver (`wouldThrow: SubstrateNotConfiguredError`).
- **E9-9-2 (Unacceptable → FIXED)** blank `DATABASE_URL` treated as configured:
  `substrateConnectionString` returned `''`/whitespace as a truthy connection, so
  `bootstrapSubstrate` would open a `Pool` on garbage. FIX: trim + return `null`
  on empty, matching `deploymentValue`'s "'' is not configured" rule. New test:
  whitespace `DATABASE_URL` → not-ready.

Justified-safe (no change): readiness `catch → 503` (never 200); `ready ===
unmet.length === 0` (never default-ready); migrations CREATE-only, idempotent +
non-destructive (no DROP/DELETE/TRUNCATE/UPDATE); `ChecksumMismatchError` fails
loud; `priorVersions catch → 0` is a cosmetic audit count; legal-hold checked
before any append; `heldBack` never removed; `EmptyRetentionPolicyError` refuses a
criteria-less policy.

**E9: fixed-2.**

## 3. Red-team panel (every persona produced findings)

**R1 Domain-Fidelity (deployment/operability/data-integrity) — 7 findings:**
R1-9-1 preflight phantom-key fail-open (Unacceptable, FIXED); R1-9-2 blank-URL
fail-open (Unacceptable, FIXED); R1-9-3 pool exhaustion / no pool config / no
single-bootstrap guard (MED residual); R1-9-4 legal-hold in-memory durability — a
restart drops holds, a later purge bypasses them (HIGH residual); R1-9-5
concurrent-migration race, no advisory lock (MED residual, fail-loud not
corrupting); R1-9-6 checksum covers comments → comment edit blocks boot (LOW);
R1-9-7 unauth readiness enumerates unconfigured backends (LOW, PHI-safe).

**R2 Negative-Space — 8-item missing-list:** durable hold store; backup/restore +
PITR drill; migration advisory lock; reversible mutable-store migrations; purge
batch/rate circuit-breaker; substrate pool health; readiness DB liveness ping
(preflight checks config presence, not DB reachability); production-mode-in-
production per-seam assertion.

**R3 Stub-Legitimacy — 6 graded, 0 Unacceptable open:** pg adapters (evidence/
deadLetter/idempotency/graph/crossReference) — Acceptable, pg-mem verified,
`.pg.sql` triggers honestly skipped + Docker-guarded, fail-closed on no
`DATABASE_URL`; migration ledger — Acceptable, idempotent + non-destructive +
checksum-loud; **neo4j — N/A recorded honestly** (no neo4j code exists; the graph
is Postgres-backed + mock-only); endpoint-contract seam keys — Acceptable **after
correcting the overclaim** (presence is a declared endpoint contract for a
CI-pending live client, NOT proof the factory is wired; the seam's own
`*NotConfiguredError` is the runtime backstop); health routes — Acceptable
(readiness fails closed on any exception); right-to-delete/legal-hold — Acceptable
(append-only tombstone, hold-before-append; residual = hold durability).

## 4. Unacceptable fixed now

Both Unacceptable fail-opens fixed in-wave (E9-9-1, E9-9-2). **Zero new
Unacceptable open.**

## Files changed
- `src/lib/deploy/schema.ts` — `SUBSTRATE_BACKED_SEAMS` + `isSubstrateBackedSeam`;
  4 substrate seams remapped to `DATABASE_URL`; overclaim comment corrected (185 L).
- `src/lib/deploy/preflight.ts` — consult `substrateConnectionString()` for
  substrate seams; endpoint-contract reason reworded (226 L).
- `src/lib/deploy/index.ts` — export the two new symbols.
- `src/lib/substrate/bootstrap.ts` — `substrateConnectionString` trims + fails
  closed on blank (129 L).
- `tests/deploy/schema.test.ts`, `tests/deploy/preflight.test.ts`,
  `tests/api/routes-health.test.ts` — updated to the converged `DATABASE_URL`
  contract + a whitespace-`DATABASE_URL` E9 test.
- `verification/GAP_AND_STUB_RISK_REGISTER.md` — Iteration 9 section appended.

## Verification (in `/home/claude/baseline`)
- `npx tsc --noEmit` → **0 errors**
- `npx vitest run` (full) → **1371 passed / 1 expected-fail / 91 skipped, 0 failed**
- `bash check-file-sizes.sh` → **PASS** (ratchet intact, no new violations)

## DoD (composite v1.2)
tsc 0; full suite green; size/ratchet PASS; no fail-open (E9 fixed-2); seams
fail-closed (E1, endpoint-contract overclaim corrected to honest); convergence
DRY (four phantom keys → one substrate `DATABASE_URL` entry, preflight consults A);
every persona produced findings (R1 7 / R2 8 / R3 6); zero new Unacceptable;
register updated. Live pg/neo4j(N/A)/external remain CI-pending residuals routed
to certification.
