# Unacceptable-Stub Fixes — Report (U1–U4)

Each of the four "Unacceptable" findings in `STUB_LEGITIMACY_FINDINGS.md` was a
place the platform's safe-stub pattern (`getDataMode(seam)==='production'` → throw
a named `*NotConfiguredError`, caller fails closed) had been skipped or inverted.
Every fix applies that existing pattern. Mock/seeded (demo) behavior is unchanged
and byte-identical; only production-mode behavior now fails closed / fails loud.

Verification: `npx tsc --noEmit` → 0 · `npx vitest run` → 873 passed, 1 expected
fail (pre-existing `test.fails` marker), 83 skipped · `bash check-file-sizes.sh`
→ PASS (no new violations).

---

## U1 — dev-mock auth failed OPEN in production

**Before.** `allowDevMockAuth` defaulted to `'true'` (`server/env.ts:49`,
`runtimeConfig.ts:81`). `devMockEnabled()` gated on that flag ALONE:
```ts
export function devMockEnabled(): boolean {
  return serverEnv().allowDevMockAuth === true;
}
```
A production deploy with WSO2 wired (`tokenUrl` set) but `ALLOW_DEV_MOCK_AUTH`
left unset would authenticate real users yet `POST /api/pas/submit` returned
`devClaimResponseApproved` — a canned "Prior authorization approved (dev demo)"
ClaimResponse — and `/api/cds`, `/api/match` returned canned data.

**After.** The flag defaults **OFF**, and `devMockEnabled()` is double-gated
exactly like the session path (`smartSession.ts` 145/178/233/244):
```ts
export function devMockEnabled(): boolean {
  const env = serverEnv();
  return !env.tokenUrl && env.allowDevMockAuth === true;   // impossible once real auth is configured
}
```
- `server/env.ts:49` and `runtimeConfig.ts:81` default `ALLOW_DEV_MOCK_AUTH` to `'false'`.
- With real auth configured (`tokenUrl` set) the dev stubs are **impossible**,
  regardless of the flag.

**Fail-closed proof.** `tests/security/dev-mock-auth-fail-closed.test.ts`:
default (flag unset) → `devMockEnabled()===false`; flag ON **+** `WSO2_TOKEN_URL`
set → `false`; `POST /api/pas/submit` with real auth wired returns the live
adjudication, **never** an id `dev-cr-approved-*` / "dev demo" disposition.
Demo: explicit mock mode (flag ON, no tokenUrl) still returns the canned approval.
`tests/api/_helpers.ts::resetRouteEnv()` now opts in explicitly
(`ALLOW_DEV_MOCK_AUTH='true'`, no tokenUrl) — mirroring `playwright.config.ts`.

---

## U2 — profile validator masqueraded as the US Core `$validate` gate and failed OPEN

**Before.** `defaultProfileValidator` (id `structural-profile-validator`,
`pipeline/load.ts:29`) was the ONLY profile validator, run in mock AND production
as "Gate 1: structural profile validity." It checks only that 4 fields are
non-empty. A production record violating US Core (cardinality, must-support,
references, required bindings) passed the gate and was committed.

**After.** New `src/lib/pipeline/profileValidator.ts` follows the terminology
semantic gate's production-fail-closed pattern exactly, selected by a new
`profileValidation` dataMode seam:
- `structuralProfileValidator` — the structural pre-flight, id renamed to
  `structural-preflight-not-us-core-validate` so it cannot be mistaken for real
  profile conformance. Kept for mock/seeded (demo green).
- `productionProfileValidationService` throws `ProfileValidatorNotConfiguredError`
  (fail loud) when called directly; `productionProfileValidator` catches it and
  **quarantines every record** with `profile-validation-unavailable` (fail closed),
  mirroring `semantic-terminology-unavailable`.
- `conformAndLoad` now defaults to `selectProfileValidator()` (mode-selected)
  instead of the structural stub.

**Fail-closed proof.** `tests/pipeline/profileValidator.test.ts`: in production a
structurally-complete record is quarantined with `profile-validation-unavailable`,
never admitted; the underlying service throws `ProfileValidatorNotConfiguredError`;
mock/seeded keeps the structural check (empty payload still rejected; complete
record passes). Validator id is asserted to be un-mistakable for `$validate`.

---

## U3 — empiResolver scored against the 3-record demo registry in production

**Before.** `empiResolver = createEmpiResolver()` bound to `mockIdentitySource`
(3 hard-coded Maria Redhawk records). In production (`identity=production`) the
REAL match engine scored real inbound members against the demo fixture — silently
minting `empi-minted-no-match` ids or holding real members against fake data.

**After.** `src/lib/identity/identitySource.ts` adds the candidate-source seam:
```ts
export function getIdentitySource(): IdentitySource {
  if (getDataMode('identity') === 'production') {
    if (!productionIdentitySource) throw new EmpiCandidateSourceNotConfiguredError();
    return productionIdentitySource;
  }
  return mockIdentitySource;
}
```
`createEmpiResolver()` resolves its source **lazily per invocation** via
`getIdentitySource()` (import-time stays safe; the mock demo stays green). A
`setProductionIdentitySource()` registration hook lets a real cross-source client
be wired without a code change. The internal match engine is unchanged; only the
candidate SOURCE is now real-or-absent-with-a-loud-error in production.

**Fail-loud proof.** `tests/identity/empiCandidateSource.test.ts`: production with
no source throws `EmpiCandidateSourceNotConfiguredError` (even for id-only
records); mock/seeded returns the demo registry; a registered source is used when
present; an explicit source still bypasses the selector.
`tests/pipeline/empiIdentity.test.ts` updated: the 834 adapter now throws in
production with no source wired, and resolves anchored `mem-` ids only once a
source IS registered.

---

## U4 — evidence production ledger was dead wiring

**Before.** `getEvidenceStore()` (the documented flip point to the append-only pg
ledger) was **never called**: `api/evidence/[id]`, `api/financial-clearance`, and
`api/work-queue` all used `defaultEvidenceStore()` directly (a process-local
`Map`). `DATA_MODE_EVIDENCE=production` was a no-op; Evidence Records were lost on
restart and the immutability trigger never ran.

**After.**
- All three route callers now use `getEvidenceStore()` (imports switched from
  `@/lib/evidence/evidenceStore` → `@/lib/evidence/store`). In mock mode it returns
  the same in-memory singleton as before (demo byte-identical, cross-route sharing
  preserved).
- New `src/lib/evidence/store/composition.ts` is the composition root:
  `registerProductionEvidenceStore()` registers a **lazy** factory
  `() => createPgEvidenceLedger(pool)` whose `pg` pool is built from
  `EVIDENCE_DATABASE_URL`/`DATABASE_URL`; a missing connection throws
  `EvidenceLedgerConnectionNotConfiguredError` when the factory is invoked in
  production — never a silent in-memory fallback.
- New `src/instrumentation.ts` (Next.js `register()` hook) wires it at startup,
  guarded to the nodejs runtime and `evidence=production` (mock/edge untouched).
- `index.ts` doc corrected (callers now route through the seam); `pg` is kept out
  of the selector's import path.

**Fail-loud proof.** `tests/evidence/store/composition.test.ts`: production +
registered factory + no connection string throws
`EvidenceLedgerConnectionNotConfiguredError`; production + connection string
selects the pg append-only ledger (`readLedger` present); mock returns the
in-memory default. The existing seam-selector suite
(`tests/evidence/store/pgEvidenceLedger.test.ts`) stays green.

---

## Tests

| Fix | Test file | Tests |
|-----|-----------|-------|
| U1 | `tests/security/dev-mock-auth-fail-closed.test.ts` (new) | 5 |
| U2 | `tests/pipeline/profileValidator.test.ts` (new) | 6 |
| U3 | `tests/identity/empiCandidateSource.test.ts` (new) | 8 |
| U4 | `tests/evidence/store/composition.test.ts` (new) | 3 |
| U3 | `tests/pipeline/empiIdentity.test.ts` (updated) | +1 (1 rewritten) |
| U1 | `tests/api/_helpers.ts::resetRouteEnv()` (updated) | shared helper |

**22 new tests** across 4 new files + **1 added / 1 rewritten** in the updated
EMPI suite. All green.
