# Cycle 3 — Security-Lens Review (Iteration 0)

Attack surface: `src/app/api/**` (25 routes) + `src/lib/authz`, `src/lib/consent`,
`src/lib/server/smartSession`. Tests live under `tests/security/` (one file per
attack class). One small, behavior-safe hardening fix was applied to the
`$member-match` route (see below).

## Verification status

- `npx tsc --noEmit` → my files (all of `tests/security/*`, `src/app/api/match`)
  are **clean**. The only repo-wide error is one line in another lane's
  concurrently-authored `tests/scenario/corpus_C_consent.test.ts:67` (a
  `'denied'` vs `'success'|'failure'` type mismatch) — not my code, not my
  surface, and left for its owning lane.
- `bash check-file-sizes.sh` → **PASS** (no new violations; ratchet intact).
- `npx vitest run tests/security tests/api tests/authz tests/consent` →
  **195 passed + 6 expected-fail (it.fails) + 9 skipped**, all green. My scope is
  fully green.
- `npx vitest run` (whole repo) → **16 failing in `tests/scenario/corpus_coverage.test.ts`**,
  which are **outside this attack surface and pre-existing / owned by another lane**:
  a ledger asserts scenario suites (`corpus_F/G/H/I/J/M/N_*.test.ts`) exist on
  disk; those files were never authored. My edits added zero scenario files and
  removed none, so they cannot be the cause. Per conventions §13.1/§13.5 I do not
  cross into the scenario domain to author 7 unrelated suites. Flagging, not fixing.

## Tests added (`tests/security/`)

| File | Class | Coverage |
|---|---|---|
| `authz-bypass.test.ts` | 1. AuthZ bypass | 12 routes → 401 unauthenticated; guard DENY → 403 on the 3 guard-gated reads; all bodies PHI-safe |
| `consent-scoping.test.ts` | 2. Consent / Part 2 | `/api/match` now 403s an opted-out member, 200s with audited break-glass, 200s when no opt-out; **2 it.fails** documenting fhir + evidence reads that ignore the opt-out |
| `phi-error-bodies.test.ts` | 3. PHI in errors | fuzz (SQLi / XSS / 200 KB payload / unicode+NUL / missing fields / non-JSON) across 7 POST + 2 GET routes; every error body PHI-safe and stack-free |
| `input-validation.test.ts` | 4. Boundary validation | consent / dtr / network-adequacy / financial-clearance / pas reject malformed with 400; **1 it.fails** for `/api/match` mock-mode no-validation |
| `idor.test.ts` | 5. IDOR | session scoped to member A requesting member B on fhir / evidence / financial-clearance; **3 it.fails** documenting request-id-over-session trust |
| `ai-guardrail.test.ts` | 6. AI guardrail | PAS human gate (202 without approver, 200 only with one, 202 body carries no authoritative approval); CRD cards are advisory only |

`it.fails` cases assert the SAFE behavior; they pass because the unsafe behavior
makes the safe assertion fail — each is a live, executable record of an open hole.

## Findings (ranked)

### HIGH
1. **Read paths do not honor the Provider Access opt-out (consent bypass).**
   Before this cycle *no* route consulted `getProviderAccessConsentStore()`.
   `/api/fhir/[...path]` (`mockFhirGet`, `src/app/api/fhir/[...path]/route.ts:38-46`)
   returns full Patient PHI (name, birthDate, address, telecom) for any member id
   in the query params, and `/api/evidence/[id]` (`route.ts` GET) returns the
   member record — both with no opt-out check. *Fix rec:* route both through
   `isOptedOut()` (the gate now on `/api/match`) and 403 when opted out,
   break-glass excepted. (`consent-scoping.test.ts` it.fails ×2.)

2. **IDOR — request-supplied patient id trusted over the session patient.**
   `/api/fhir/[...path]` (`route.ts:39`), `/api/evidence/[id]` (id → memberId),
   and `/api/financial-clearance` (`route.ts:146` `body.patientId`) never compare
   the target to `getSessionPatient()`. A session scoped to member A reads member
   B's PHI. *Fix rec:* compare resolved target to the session patient (member
   self-access) or gate cross-member reads through `canReadMemberData` with the
   caller's real role + treatment relationship, 403 on mismatch. (`idor.test.ts`
   it.fails ×3.)

### MEDIUM
3. **AuthZ decisions use a hardcoded role, not the session principal.**
   `canReadMemberData({ role: 'pa-reviewer', purpose: 'operations' })` is passed a
   constant in `evidence/[id]/route.ts:98`, `work-queue/route.ts:32`,
   `financial-clearance/route.ts:151`. The guard therefore cannot deny based on
   *who* is calling — every authenticated caller is a reviewer. *Fix rec:* derive
   role/purpose from the session and pass them in. (`authz-bypass.test.ts` proves
   the 403 path fires when the guard is forced to deny.)

4. **`/api/consent/provider-access` write is not member/role scoped.**
   `route.ts:64-65` — any authenticated caller may `optOut`/`revoke` *any*
   `memberId`. A member could re-enable another member's Provider Access sharing.
   Writes are attributed (`recordedBy`) but not authorized. GET (`route.ts:26`)
   likewise discloses any member's consent status. *Not fixed:* a correct fix
   needs a session-principal→member binding (and must keep the legitimate CSR
   "record on behalf" flow), which is more than a minimal change. *Fix rec:* scope
   self-service writes to `getSessionPatient()`; require an ops/care-manager role
   (via `canReadMemberData`) for on-behalf writes.

5. **`/api/match` performs no body validation in dev-mock mode.**
   A malformed `$member-match` Parameters body returns a 200 default identity
   instead of 400 (`route.ts` short-circuits on `devMockEnabled()` before the
   `!parameters` check). *Fix rec:* validate the Parameters shape ahead of the mock
   branch. (`input-validation.test.ts` it.fails.)

### LOW
6. **`/api/dtr/evaluate` has no authentication check.**
   `src/app/api/dtr/evaluate/route.ts` never calls `isAuthenticated()` — an
   unauthenticated caller can drive medical-necessity evaluation. Output is
   deterministic policy (not member PHI), hence LOW, but it is the only BFF route
   with no auth gate. *Fix rec:* add the standard `isAuthenticated` 401 guard.

## Small fix made (behavior-safe hardening)

**`src/app/api/match/route.ts` — wire the Provider Access opt-out consent gate.**
CMS-0057-F requires the opt-out be honored before releasing member identity; the
gate was architected (`authz/guard.ts` `providerAccessOptedOut`, plus the consent
store) but never called by any route. The `$member-match` route now consults
`getProviderAccessConsentStore().isOptedOut(matchedMemberId)` and returns a
PHI-safe 403 when the member has opted out, with an audited `x-break-glass: true`
override (per the documented exception). Behavior-safe: the store defaults to
"not opted out", so existing match tests (PAT-0042 → 200) are unchanged; only an
explicitly opted-out member is now blocked. tsc 0, size gate PASS, existing
`routes-match-bulk.test.ts` still green.

Findings 1, 2, 4, 5, 6 are recorded (not fixed): each needs either a session
role/principal model or a cross-route change larger than a minimal, behavior-safe
edit — documented above with file:line and a one-line fix rec.
