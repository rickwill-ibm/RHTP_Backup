# ITER9 — Wave C (Data-lifecycle, B2) Report

Framework v1.2. Role: Data-lifecycle specialist, disjoint tree. Working tree
`/home/claude/baseline`, live.

## Scope delivered

Owned trees only: `src/lib/lifecycle/`, `tests/lifecycle/`,
`docs/runbooks/deployment-runbook.md`. Did **not** touch `substrate/` (A),
`deploy/` (B), or the evidence-ledger store internals — right-to-delete uses the
ledger's PUBLIC surface (`get` / `save` / `readLedger`) only.

### 1. Retention / policy-driven purge over the MUTABLE stores — YES

- `src/lib/lifecycle/policy.ts` — pure, deterministic `selectByPolicy` /
  `selectByPolicies`. A `RetentionPolicy` is an AND of criteria:
  **age** (`maxAgeMs`), **category** (`categories`), **consent-withdrawal**
  (`consentWithdrawn`), plus optional store `target`.
- **Safety:** a criteria-less policy is refused (`EmptyRetentionPolicyError`) and
  `itemMatchesPolicy` returns false for it — a mis-authored policy can never
  sweep a whole store. `selectByPolicies` de-dupes by `(store,id)`, first policy
  wins, so each purge has exactly one recorded reason.
- `src/lib/lifecycle/purge.ts` — `planPurge` (pure) splits selected items into
  `purge` vs `heldBack`; `executePurge` removes only `purge` items and emits one
  PHI-safe audit event each; `runPurge` is the end-to-end job entry point.
- `src/lib/lifecycle/adapters/fhirPurgeSource.ts` — concrete adapter over a
  MUTABLE store (the FHIR store) using its public API (`storeSearch` /
  `storeDelete`); projects resources to PHI-safe `PurgeableItem`s. Consent state
  is injected (`consentWithdrawnFor`) so Wave B owns consent.

### 2. Right-to-delete over the APPEND-ONLY evidence ledger, done correctly — YES (immutability-safe)

- `src/lib/lifecycle/rightToDelete.ts` — `executeRightToDelete` never deletes a
  row. Erasure is a **governed tombstone APPEND**: a new record version whose
  entries are reduced to a single PHI-safe tombstone note (`TOMBSTONE_MARKER`,
  policy, legal basis, actor, erased-entry count).
  - Latest snapshot (`get`) no longer surfaces the erased entries (segmentation).
  - **Every prior version stays readable via `readLedger`** — immutability +
    auditability preserved. Proven against the REAL pg-mem evidence ledger:
    version count goes 1 → 2, `after[0].record.entries === ['e1','e2']` intact.
  - Idempotent (`already-tombstoned` → no second append); `not-found` → no
    append. The append-only DB trigger (migration 002) is never bypassed.

### 3. Legal-hold blocks purge/delete (E9) — YES

- `src/lib/lifecycle/legalHold.ts` — `LegalHoldRegistry` (place / release /
  isHeld / active / history), idempotent place, append-only hold history.
- Purge: a held subject is routed to `heldBack` and **never passed to `remove`**.
- Right-to-delete: the legal-hold check runs **before any append**; a hold on the
  record id OR the member yields `blocked-legal-hold` with **no new ledger
  version**. Releasing the hold lets the next attempt proceed. This is the E9
  guarantee: a purge/delete cannot silently break ledger immutability or bypass a
  hold.

### 4. Deployment runbook — YES

`docs/runbooks/deployment-runbook.md`: ordered **migrate → preflight → deploy →
rollback**, each with an explicit gate. Grounded in the real scripts
(`npm run check:types|check:sizes|check:all|build`) and the append-only
posture (never a schema-level row delete; preserve holds across rollback;
no purge until the hold registry is confirmed loaded).

## Files

Production (`src/lib/lifecycle/`, all ≤ 400 lines):
`types.ts` (151), `audit.ts` (113), `policy.ts` (108), `legalHold.ts` (94),
`purge.ts` (107), `rightToDelete.ts` (138), `index.ts` (67),
`adapters/fhirPurgeSource.ts` (86).

Tests (`tests/lifecycle/`, all ≤ 500 lines) — **25 new tests across 5 files,
all green**: `policy.test.ts` (9), `rightToDelete.test.ts` (5),
`purge.test.ts` (4), `legalHold.test.ts` (4), `fhirPurgeSource.test.ts` (3).

## Verification (in `/home/claude/baseline`)

- `npx tsc --noEmit` → **0 errors**
- `npx vitest run tests/lifecycle` → **5 files, 25 passed**
- `bash check-file-sizes.sh` → **PASS** (no new violations; ratchet intact)

Key proofs: retention selects by age/category/consent; right-to-delete tombstones
by appending without breaking ledger immutability (prior versions still readable);
legal-hold blocks both purge and right-to-delete (E9).
