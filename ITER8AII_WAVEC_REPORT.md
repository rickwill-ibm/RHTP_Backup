# Iteration 8A-ii, Wave C - Pipeline semantic binding + value-set currency enforcement

Role: Pipeline / terminology-integration specialist (B2), disjoint tree. Framework v1.2.
Scope inherited from `inputs/iteration8aii_context.md` (Wave C).

## What was delivered

### 1. Pipeline binding at transform (stage-4 gate bound deeper)
The stage-4 semantic gate already ran at conform+load (`load.ts`). Wave C binds it
DEEPER: the code-carrying domains (medications, labs/vitals, behavioral-health,
procedures, immunizations) now run their governed codings through the SAME gate at
TRANSFORM, so an unverified / unrecognized / retired code is quarantined PHI-safe
before it is ever admitted into the normalized record set - and, because the wiring
is inside `runTransform` (the single choke point both lanes call), batch and stream
cannot diverge on semantic admission.

- New file `src/lib/pipeline/semanticBinding.ts`:
  - `CODE_CARRYING_DOMAINS` + `isCodeCarryingDomain(domain)`.
  - `bindSemantics(record, opts)` - REUSES the semanticValidator via
    `selectSemanticValidator()` (default) or an injected `validator`. It does NOT
    reimplement validateCode/translate/classify (waves A/B own those); it consumes
    the gate's verdict and layers currency enforcement on top.
  - `currencyPostureFromConfig()` - resolves the currency posture (env
    `TERMINOLOGY_CURRENCY_POSTURE`, else `terminology` data mode: production ->
    enforce, else flag).
- `src/lib/pipeline/transform.ts` (`runTransform`): appended a clearly-commented
  Wave C block. After normalize+segment, for code-carrying domains only, it runs
  `bindSemantics(record, { now: deps.now })` and, on `!ok`, returns a quarantine
  built by the EXISTING `buildQuarantineRecord` (reuses the dead-letter/quarantine
  path; no new store invented). The clock is injected (`deps.now`) so the currency
  asOf is deterministic.
- Barrel exports appended (append-only, clearly-commented Wave C blocks):
  `src/lib/pipeline/index.ts`, `src/lib/terminology/index.ts`,
  `src/lib/terminology/registry/index.ts`.

Fail-closed is preserved: in production `terminology` mode the reused gate fails
closed (`semantic-terminology-unavailable`), so the transform binding quarantines a
coded record rather than admitting it unverified (verified by the existing
`semanticGate.test.ts` production case, which stays green with rejects now arising
at transform).

### 2. Value-set version currency enforcement
- New file `src/lib/terminology/registry/currency.ts`:
  - `decideAssetCurrency` / `decideSystemCurrency` / `decideBindingCurrency` turn
    the registry's own currency verdict (`checkCurrency` / `getActiveBySystem` /
    `listBindings`) into an enforcement DECISION. It reuses the registry's
    window/version/cadence math - it does not reimplement it.
  - A bound version that is expired / superseded / retired / past-cadence, or a
    system with no active in-window version, is FLAGGED. Under posture `enforce`
    (production posture) it QUARANTINES; under `flag` it is surfaced but admitted
    (demo stays green).
  - PHI-safe reason codes: `semantic-valueset-{expired,superseded,retired,stale,
    not-effective,unregistered,no-active-version}`.
  - Deterministic: every decision is a pure function of (registry, id/system,
    posture, asOf); the caller injects `asOf` (no clock read inside).

E9 (fail-open sweep) on this path: a stale value-set version does NOT silently
validate - under the enforce posture it fails closed even when the code itself
validates; an unverifiable/unregistered version fails closed.

## Tests (24 new)
- `tests/terminology/currency.test.ts` (14): reason mapping for current / superseded
  / expired / stale / not-effective / unregistered; posture flip (enforce quarantines,
  flag admits); system-level no-active-version; binding pinned to a superseded version.
- `tests/pipeline/semanticBinding.test.ts` (10): a good code passes; a bad code is
  quarantined (never admitted), PHI-safe; the binding delegates to the injected gate
  (a spy gate's verdict flows through - proof of no duplicated validation logic; a
  retired verdict fails closed); a stale bound value-set version quarantines under the
  enforce posture while the code validates, and admits under flag; the binding runs AT
  TRANSFORM (via `runTransform` on the medication adapter, bad code quarantined, good
  normalized, PHI-safe).

## Verification (in /home/claude/baseline)
- `npx tsc --noEmit` -> 0.
- `npx vitest run tests/terminology tests/pipeline` -> 261 passed (35 files).
- Full suite `npx vitest run` -> 1267 passed, 1 expected-fail, 91 skipped, 0 failures
  (my `runTransform` change is safe repo-wide).
- `bash check-file-sizes.sh` -> PASS (ratchet intact). My files: currency.ts 130,
  semanticBinding.ts 98, currency.test.ts 182, semanticBinding.test.ts 203 lines.
- Style: no em dash followed by a space, no double spaces in my files.

## DoD proof
- Pipeline binding quarantines bad/retired codes: `semanticBinding.test.ts` (bad code
  and retired-verdict cases; transform-stage quarantine case).
- Currency enforcement on stale versions: `currency.test.ts` + `semanticBinding.test.ts`
  (enforce posture quarantines a stale/expired/superseded/no-active-version binding).
- Reuse (no duplication): `bindSemantics` consumes `selectSemanticValidator()` /
  injected validator; the spy-gate test proves the semantic verdict comes from the gate,
  not re-derived. Currency reuses `ValueSetRegistry` math.

## Coordination notes (for Wave D convergence)
- I stayed strictly within my files: `registry/currency.ts`, the pipeline binding
  (`pipeline/semanticBinding.ts` + the `runTransform` Wave C block), and my two test
  files. Shared barrels got append-only, commented Wave C blocks.
- I REUSE wave A's version/retired-aware `validateCode` and UCUM (via the
  semanticValidator) and do not touch wave A/B modules. During the run wave A briefly
  had a `WpcDomain` type error in `tests/terminology/version.test.ts`; it was resolved
  by wave A and final tsc is 0.
- `immunizations` is listed as code-carrying, but CVX is not among the governed
  `TERMINOLOGY_SYSTEMS`, so its codings are not gated today (no CVX in
  `systemForUri`). If CVX governance is added later, the binding picks it up with no
  code change. Flagged for the red-team/register.
