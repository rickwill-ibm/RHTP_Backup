# Iteration 1 — Wave C: security fixes + adversarial convergence review

Security + convergence engineer. Scope: fix the 2 HIGH cycle-3 findings behavior-
safely with tests, then adversarially self-review waves A+B (fix small, document
large). Nothing in `src/lib/pipeline`, `src/lib/outbox`, `src/lib/evidence/store`,
or `src/lib/dataSources` needed a determinism fix — all already route through the
injected clock seam (see Convergence below).

## Part 1 — Security fixes

### Fix 1 — Consent-read bypass (HIGH), both read routes now honor the opt-out

Same gate the `$member-match` route uses: consult
`getProviderAccessConsentStore().isOptedOut(member)` before releasing PHI, PHI-safe
403 when opted out, audited `x-break-glass: true` override excepted. Behavior-safe:
the store defaults to not-opted-out, so every existing test (no opt-out) is unchanged.

| Route | file:line | Before | After |
|---|---|---|---|
| FHIR passthrough | `src/app/api/fhir/[...path]/route.ts` GET (new gate before the mock/live branch, ~L143) | Returned full Patient PHI (name/birthDate/address/telecom), and Coverage/Condition/ClaimResponse, for any member id in the query params with no opt-out check | Resolves the target member once from the query param; opted-out member → 403 PHI-safe (`fhir.read.consent-denied` audited); break-glass → 200 + `fhir.read.break-glass` audited |
| Evidence read | `src/app/api/evidence/[id]/route.ts` GET (new gate after id-validation, before the guard, ~L100) | Returned the member Evidence Record (patientName, coverage note) with no opt-out check | Derives memberId from the evidence id; opted-out member → 403 PHI-safe (`evidence.read.consent-denied` audited); break-glass → 200 + `evidence.read.break-glass` audited |

### Fix 2 — IDOR (HIGH): FHIR Patient identity read scoped to the session principal

`src/app/api/fhir/[...path]/route.ts` GET (~L173): the `Patient` demographic read is
now scoped to `getSessionPatient()`. A session scoped to member A that requests member
B's Patient resource gets a PHI-safe 403 (`fhir.read.idor-denied` audited); break-glass
excepted. Behavior-safe: the demo syncs `session.patient` on patient selection
(`/api/auth/session` POST), so self-reads stay 200; the unit-test mock scopes to
MARIA and self-reads MARIA → 200.

### IDOR on evidence + financial-clearance — DOCUMENTED, deferred (not a new defect)

These two are pa-reviewer ops surfaces whose existing contract tests assert
**legitimate** cross-member reads (a reviewer works a queue of many members:
`routes-evidence-workqueue` reads `ev-PAT-0042-…` and `routes-financial-clearance`
runs `PAT-0087` — both from a MARIA-scoped mock session, expecting 200). A behavior-
safe session-scope 403 cannot be added without distinguishing a member-scoped session
from a reviewer session, which requires the caller's **real role** from the session
(cycle-3 MEDIUM #3) rather than the hardcoded `{ role: 'pa-reviewer' }`.
`financial-clearance` already wires `targetPatientId` into `canReadMemberData`; only the
constant role blocks the deny. Left as live `it.fails` records in `idor.test.ts`.

### Tests (tests/security/)

- `consent-idor-fixes.test.ts` (new, 6 cases): opted-out → 403 on both read routes;
  **break-glass override audited** (audit sink spied — asserts the `*.break-glass`
  event is emitted, not just that the read succeeds); cross-member Patient read → 403
  `fhir.read.idor-denied`; self-scope read → 200.
- `consent-scoping.test.ts`: the two consent `it.fails` (fhir + evidence) flipped to
  positive 403 assertions + break-glass 200 overrides.
- `idor.test.ts`: the fhir `it.fails` flipped to a positive 403 assertion; evidence +
  financial-clearance `it.fails` retained with updated rationale (documented finding).

Net: 3 of the 6 cycle-3 `it.fails` are now passing assertions of fixed behavior; the
remaining 3 (idor evidence, idor financial-clearance, match no-validation) stay as
documented open records.

## Part 2 — Convergence (adversarial self-review of waves A+B)

- **Determinism — PASS, no fix needed.** `rg` for `Date.now()` / `Math.random()` /
  `new Date(` across `src/lib/pipeline`, `src/lib/outbox`, `src/lib/evidence/store`,
  `src/lib/dataSources`: every hit is `new Date(deps.now())` / `deps.rng()`, where
  `defaultPipelineDeps` and the outbox deps bind `now`/`rng` to `clock.now`/`clock.rng`.
  Time and randomness are injected. `console.(log|debug)` in `src` = **0**.
- **Outbox — dual-write absent, FIFO/idempotency correct in the tested path.** The event
  is published only inside `confirmAndPublish`, after the idempotent FHIR apply succeeds
  and the row is marked `confirmed`; the intent commit is the single source (no dual
  write). Per-member FIFO holds under pg-mem and single-process real Postgres via the
  `MemberLock` + `pendingForMember ORDER BY created_at_ms, id`. The sweep is idempotent
  in-process: it re-reads each row and skips any that a live drain already moved past
  `pending`.
- **Seam integrity — PASS.** Evidence ledger + the three dataSources loaders are selected
  via `getDataMode(seam)`; every seam defaults to `'mock'` (`DEFAULT_MODE = 'mock'`), demo
  stays green, no caller changed, and no component imports the store/outbox/pg directly
  (BFF-only intact).
- **Ratchet/convention — PASS.** `check-file-sizes.sh` PASS (75 frozen files unchanged);
  no new file over 400 (largest touched route: fhir 228, evidence 167). Inline CPT/PA
  scenario maps in the security routes pre-date this wave and mirror `devStubs` — noted,
  not a wave-C regression.

### New convergence findings (documented — larger, deferred by design)

1. **Outbox FIFO + sequence uniqueness under multi-instance real Postgres (larger).**
   `MemberLock` is an in-process promise chain; it does not serialize across app
   instances. `nextSequence` is `SELECT MAX(sequence)+1` (non-atomic under concurrency),
   and there is no `UNIQUE(member_id, sequence)` constraint, so two concurrent confirms
   on different instances for the same member could assign duplicate sequences or invert
   apply order. The partition-affine model in amendment-001 §2 requires external
   per-member single-writer routing (Kafka partition affinity / Temporal per-member task
   queue — ADR-002, an Iteration-2 concern) or a Postgres advisory lock keyed on member.
   Not fixed here: a `UNIQUE(member_id, sequence)` fail-safe risks pg-mem's NULL-uniqueness
   semantics for the normal multi-pending (`sequence NULL`) case, and the advisory-lock /
   partition-affinity choice is an architecture decision, not a minimal edit.

2. **Sweeper/writer double-publish window is shared-lock-wiring-dependent (medium).**
   `OutboxWriter` and `OutboxSweeper` each default to `new MemberLock()`. Their mutual
   exclusion for a member relies on the composition root passing ONE shared lock; nothing
   at the data layer enforces it (the store has no compare-and-set
   `UPDATE … WHERE status='pending'` returning affected rows). If wired with separate
   locks, a live drain and a concurrent sweep could both pass the `status==='pending'`
   re-read and both call `confirmAndPublish`. Recommend making the shared lock explicit in
   the public wiring, or a conditional status transition — deferred to avoid mid-iteration
   `OutboxStore` seam churn.

Both findings are latent limitations of a deployment mode not exercised here
(multi-writer real Postgres), at the Iteration-2 Kafka/Temporal boundary — not live
failures in the delivered, tested path.

## Verification

- `npx tsc --noEmit` → **0 errors**.
- `npx vitest run` → **589 passed, 0 failed**, 3 expected-fail (down from 6 — 3 flipped
  to passing), 71 skipped.
- `bash check-file-sizes.sh` → **PASS**, ratchet intact.
- `rg "console\.(log|debug)" src` → **0**.

## DRY / NOT-DRY verdict

**DRY.** 2 new convergence findings (both documented, latent, deferred by design; < 3
material defects), 0 new defects introduced by the security fixes, and every gate passes
(tsc 0, vitest fully green, size ratchet PASS, console 0).
