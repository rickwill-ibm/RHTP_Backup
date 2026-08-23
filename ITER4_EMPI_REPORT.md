# Iteration 4 — EMPI-backed identity resolution (the litmus test)

The pipeline's identity seam now resolves inbound records to the right person via
the REAL match engine (EMPI/MPI deterministic rules + probabilistic scoring),
not the djb2 hash stub — and a possible-match is HELD for review, never silently
auto-linked. This is the trust guarantee behind the whole-person record.

## What changed (files)

| File | Change |
|---|---|
| `src/lib/identity/empiResolver.ts` | **NEW.** EMPI resolver: match engine -> anchored member id, held, or mint. |
| `src/lib/pipeline/heldIdentity.ts` | **NEW.** `HeldIdentityError` + `HeldIdentitySignal` (shared, cycle-free). |
| `src/lib/pipeline/types.ts` | `DemographicTraits`, `ResolveIdentityTraits`; `IdentityResolver` carries demographics; `QuarantineRecord` gains `held-for-review` + `identityHold`. |
| `src/lib/pipeline/transform.ts` | `runTransform` catches `HeldIdentityError` -> `buildHeldRecord` (held lane). |
| `src/lib/pipeline/stages.ts` | `selectIdentityResolver()` picks EMPI vs stub by `getDataMode('identity')`. |
| `src/lib/pipeline/pipeline.ts` | `PipelineRunResult.heldForReview` surfaces the hold lane. |
| `src/lib/config/dataMode.ts` | registered the `identity` seam. |
| `src/lib/pipeline/adapters/eligibility834.ts` | passes subscriber demographics (NM1 name, DMG dob/sex). |
| `src/lib/pipeline/adapters/adtEncounter.ts` | passes patient demographics (PID name/dob/sex). |
| `src/lib/pipeline/adapters/_TEMPLATE.md` | step 2 note: pass `demographics` when the source carries them. |

Not touched (owned by parallel agents): `adapters/{lab,allergy,procedure}` and their
graph mappings. Their existing `resolveIdentity(id, { feed })` calls stay valid
under the widened seam (id-only, deterministic path) with no edit.

## The EMPI resolver (`empiResolver.ts`)

`resolveEmpi(sourceId, traits, source)` is pure and directly testable; it reuses
`findBestMatch` (-> `runDeterministicRules` + `scoreProbabilisticMatch` +
`tierForScore`) over candidates from the `IdentitySource` seam. **Scoring is not
reimplemented.** Decision per subject:

- deterministic rule hit **OR** score >= `autoLinkMin` (90) -> **LINKED** to a
  stable anchored id derived from the matched person's strongest trait
  (`canonicalPersonKey`: medicaidId > ssnLast4+dob > name+dob), so every source
  record for one person collapses to one enterprise identity.
- score in `[60, 90)` -> **HELD** (`memberId: ''`, reason `identity-possible-match`).
- no demographics, or score < `possibleMatchMin` (60) -> **MINT** a new anchored
  id, deterministic per `(feed, sourceId)` so replays are idempotent, provenance
  `empi-minted-new`.

`createEmpiResolver(source)` adapts this to the `IdentityResolver` seam: LINKED/
MINT return the id; HELD throws `HeldIdentityError`.

## The demographics-carrying seam (backward-compatible)

`IdentityResolver` traits went from `Record<string, unknown>` to a typed
`ResolveIdentityTraits { feed?; demographics? }`. `{ feed }`-only calls still
compile and resolve (id-only, deterministic) — so medication, cboSdoh, and the
untouched lab/allergy/procedure adapters need no change. eligibility834 and
adtEncounter now parse and pass demographics where they already read them. Traits
are seam-only: used for matching, never written to a record or a quarantine record
(PHI-minimal).

## The possible-match HELD path (answers the litmus test)

Identity resolves inside `normalize`. On a possible match the resolver throws
`HeldIdentityError`; `runTransform` catches it and emits a `QuarantineRecord` with
`status: 'held-for-review'`, `reasonCodes: ['identity-possible-match']`, and a
PHI-safe `identityHold { matchTier, confidence }` — **no NormalizedRecord is
produced, so the record never attaches to a member.** It flows to the existing
quarantine lane and is surfaced distinctly as `PipelineRunResult.heldForReview`.
Reconciliation still balances (a held record counts as rejected, not lost).

## Production vs mock selection

`defaultPipelineDeps` calls `selectIdentityResolver()`, which reads the new
`identity` dataMode seam: `production` -> `empiResolver`; `mock`/`seeded` -> the
deterministic stub. Default is `mock`, so the demo keeps identical ids run to run.
A config change (`DATA_MODE_IDENTITY=production`, global `DATA_MODE`, or the
session toggle), never a code change.

## Tests (+14, tests/identity + tests/pipeline)

`tests/identity/empiResolver.test.ts` (8): deterministic -> member; consolidation
(two records -> one id); probabilistic >= 90 auto-links; **60-90 HELD** (resolveEmpi
+ resolver throws); no-match mints with provenance (idempotent); id-only via the
seam; bare-id call.
`tests/pipeline/empiIdentity.test.ts` (6): seam selection mock vs production;
held routing through `batchStep` (not normalized, status `held-for-review`, band
60-90, balanced, PHI-safe); existing 834 adapter still resolves under EMPI; id-only
seam still works.

## Honest status: real vs still-seam

- **REAL now:** match-engine-backed resolution — deterministic rules and
  probabilistic scoring (the actual `matchEngine.ts`/`findBestMatch`), the
  autoLink-90 / possibleMatch-60 thresholds, the held-not-auto-linked decision,
  and idempotent minting. No hash stub in production mode.
- **Still seam:** the candidate registry is the `IdentitySource` **mock standalone**
  registry; a real HCA MPI adapter is a joint business decision (Dev Plan A5), not
  wired. The anchored-id crosswalk is DERIVED (`canonicalPersonKey`), not a
  persisted enterprise master index. And US Core `$validate` at conform/load is
  still the default in-process profile validator — real `$validate` needs HAPI
  (unchanged this iteration; CI-pending real-backend integration count stays 0 for
  this identity-wiring work).

## Verification

- `npx tsc --noEmit` -> **0**
- `npx vitest run` -> **792 passed**, 1 expected fail (pre-existing), 83 skipped;
  113 test files passed (+2). Baseline was 778 -> +14 new, nothing prior broken.
- `bash check-file-sizes.sh` -> **PASS** (no new violations; ratchet intact).
