# Cycle 2A Report — Property-Test Author (Iteration 0)

Property-style tests over generated inputs, driven by a seeded mulberry32 PRNG
(`tests/property/_prng.ts` — fixed literal seeds, fully reproducible, no new packages).
One file per target engine under `tests/property/`. **29 new tests** (27 green +
2 documented failing expectations via `it.fails`), ~3,000 generated cases total.

## Files

| File | Tests | Engine |
|---|---|---|
| `tests/property/_prng.ts` | – | shared seeded PRNG + generator helpers |
| `tests/property/matchEngine.property.test.ts` | 8 (2 `it.fails`) | `src/lib/identity/matchEngine.ts` (+ `findBestMatch` from `resolveIdentity.ts`) |
| `tests/property/policyEngine.property.test.ts` | 7 | `src/lib/policy/policyEngine.ts`, `policyLibrary.ts`, `criteria.ts` |
| `tests/property/networkAdequacy.property.test.ts` | 5 | `src/lib/networkAdequacy/adequacyEngine.ts` |
| `tests/property/goldenThread.property.test.ts` | 5 | `src/lib/goldenThread/financialClearanceMachine.ts` |
| `tests/property/consentOptOut.property.test.ts` | 4 | `src/lib/consent/providerAccessOptOut.ts` |

## Properties per engine

### Identity match engine
- **Monotonicity** (400 cases): making any scored field (name/dob/sex/zip/phone) agree never lowers the probabilistic score.
- **Deterministic short-circuit** (200): each of the 3 deterministic rules fires when forced (incl. case/whitespace on medicaidId), and `findBestMatch` reports tier `deterministic` at confidence exactly 100.
- **Symmetry** (400): score(a,b) === score(b,a); deterministic hit is symmetric.
- **Tier boundaries**: exact at 90 (`probabilistic-auto`) and 60 (`possible-match`); 89.999/59.999 fall below; 300-case sweep vs spec; `deterministicHit=true` always wins.
- **No crash on missing/empty fields** (300): sparse/blank traits never throw; score always in [0,100].
- **Similarity bounded** (300): every rule-hit weight stays within its cap (Levenshtein similarity scaled into [0,1] × weight).

### Policy engine (17-policy corpus)
- Corpus **loads and indexes**: exactly 17 policies; every governed code round-trips through `findByCode`.
- **Determinism** (150): same member×order evaluated twice → byte-identical determination.
- **Every policy × enforced code evaluates without throwing** (~800 cases: up to 20 sampled codes × 3 members per policy): outcome in enum, propensity in [0,100], never `no-policy-found` for a governed code. ("other/related" buckets excluded — `classifyMatch` intentionally ignores them.)
- **Fail closed** (300): any policy match ⇒ `requiresPA === true`, never `no-pa-required`; unknown criteria (`criteriaMet === null`) stay in PA review; `criteriaMet === false` always surfaces a deficiency.
- **Unknown predicate kinds fail closed** (200): a fabricated criteria kind evaluates `false`, never approves, never throws; `all([])`/`any([])` identities hold.
- **SME gate** (100): the unreviewed 0520 criteria set always reports `smeReviewed: false`.
- **Ungoverned codes** (200): out-of-space codes → `no-policy-found`, no PA, no throw.

### Network adequacy engine
- **Monotonicity** (300): adding a matching accepting provider never lowers `adequacyPct`, never reduces provider count, never increases nearest distance.
- **Non-negativity** (300 + 100): haversine ≥ 0 and finite on random globe coords; self-distance is exactly 0; every metric's ratio/distance/adequacy fields non-negative and bounded.
- **Gap/threshold consistency** (200): `gapStatus === adequacyPct < targetPct`; `computeGaps` returns exactly the gapped cells; severity matches the 50/70/85 bands; shortfall/affected-population non-negative; sort order (severity, then population) verified.
- **Validation conjunction** (150): `validateCell.compliant` equals AND of its 5 checks.

### Golden Thread financial-clearance machine
- **Totality** (500): every state × generated event either transitions or rejects cleanly (`error` set, state and context untouched by reference) — never throws, never leaves the state set.
- **Exact legality matrix**: precisely the documented (state, event-type) pairs accepted; all others rejected (3 sweeps × 35 pairs).
- **Terminal absorption** (200): Cleared/Blocked reject every event.
- **No path skips a human gate** (400 biased random walks): reaching `Cleared` requires explicit eligibility-active + med-nec + estimation events, and, when `requiresPA=true`, an explicit `pa-complete: approved` — non-vacuity asserted (walks provably reach Cleared incl. the PA-gated route).
- **`more-info` loop** (100): stays in PriorAuth without granting stage completion.

### Provider Access opt-out consent
- **Attribution** (200): every change carries `recordedBy` + pinned-clock `recordedAt`; empty actor throws (`/attributed/`) for both optOut and revokeOptOut and leaves no trace.
- **Round-trip** (200): opt-out → opt-in restores not-opted-out; a random flip sequence ends in exactly the last operation's state.
- **Unknown members** (200): weird/unicode/empty/fresh ids never throw; `getStatus` null, `isOptedOut` false.
- **Seam**: default data mode resolves to the mock store.

## FINDINGS (real invariant violations, captured as `it.fails` — not weakened)

1. **matchEngine — blank names deterministically match on DOB alone.**
   `runDeterministicRules` normalizes names with `trim().toLowerCase()`, so two records with
   empty/whitespace first+last names and the same `dob` satisfy `name+dob-exact` and are
   declared a CERTAIN (100-confidence) match with zero name evidence.
   (`tests/property/matchEngine.property.test.ts`, seed 0xf1d01.)

2. **matchEngine — empty-vs-empty names earn full similarity weight.**
   `stringSimilarity('','')` returns 1, so two records that both lack names collect the full
   30+20 name points; with only a shared zip they cross the 60-point `possible-match`
   threshold on no identity evidence. Missing fields should contribute 0.
   (`tests/property/matchEngine.property.test.ts`, seed 0xf1d02.)

No invariant violations found in the policy engine, network-adequacy engine, financial-clearance
machine, or consent store under the generated spreads.

## Verification

- `npx tsc --noEmit` → 0 errors.
- `npx vitest run` → 50 files, **364 passed | 2 expected fail (the findings) | 9 skipped** — fully green.
- `bash check-file-sizes.sh` → **PASS** (all new files ≤ 209 lines, well under the 500-line test cap; ratchet intact).

## Cycle 2 convergence

### Fix (src/lib/identity/matchEngine.ts — minimal, principled)

1. **Finding 1 — blank-field deterministic matches.** Added one guard,
   `bothPresentAndEqual(a, b)`: true only when both values are non-empty after
   `normalize()` (trim + lowercase) AND equal. Every deterministic exact-match
   comparison now routes through it — an exact-match rule never fires on
   empty/absent values.
2. **Finding 2 — absence counted as agreement.** `stringSimilarity` now returns 0
   when either side is empty post-normalization (previously `('','') → 1`). Two
   records both missing a name earn zero name weight; one empty vs non-empty is
   also 0 (unchanged).

### Rules audited (all three deterministic rules + probabilistic exact traits)

- `name+dob-exact` — was the reported defect (blank first+last + shared DOB fired
  at confidence 100). Now requires non-empty first, last, AND dob.
- `medicaidId-exact` — had the same pathology in whitespace form: `'   '` vs `' '`
  are truthy, both normalize to `''`, rule fired. Now guarded.
- `ssnLast4+dob-exact` — dob leg compared raw (`a.dob === b.dob`), so matching
  ssnLast4 plus two blank/absent DOBs fired. Now both legs guarded.
- Probabilistic exact traits (`dob-exact`, `zip-match`, `phone-match`) carried the
  identical defect one tier down (two whitespace-only zips normalized to `''` and
  earned the full 10 points); routed through the same guard. `sex-match` is
  enum-typed and already excludes `'unknown'` — no change needed.

### Tests flipped / added

- Flipped both `it.fails` in `tests/property/matchEngine.property.test.ts` to
  normal passing assertions of the corrected behavior (seeds 0xf1d01 / 0xf1d02
  unchanged; comments updated to cite the fix).
- Added 3 regression tests in `tests/identity/matchEngine.test.ts` (new
  "blank-field guards" describe block): blank-name permutations vs `name+dob-exact`
  (both-blank and one-field-blank); whitespace medicaidId + blank-DOB ssnLast4
  permutations; probabilistic all-blank records score exactly 0 with zero rule
  hits, and empty-vs-non-empty names earn no similarity weight.
- No existing test enshrined the buggy behavior — none needed changing
  (`tests/identity/*.test.ts` all pass unmodified).

### CYCLE2B F1–F9 review

Read and reviewed. F3 (consent-blind sharing) already received its small safe
guard in the 2B pass itself; F9 is verified fixed. F1/F2/F4–F8 are architectural
or data-externalization items (input-shape change, effect-timing move, financial
constant extraction, coded value sets) — none admits an equally-small safe fix
without behavior change, so all remain documented for the named follow-ons.
Nothing from 2B was changed this pass.

### Verdict: **DRY**

One additional material defect family found while fixing (the same blank-field
pathology reproduced in the probabilistic exact-trait comparisons — zip/phone/dob);
fewer than 3 new material defects ⇒ DRY.

### Verification

- `npx tsc --noEmit` → exit 0.
- `npx vitest run` → **55 files passed; 416 passed | 9 skipped — fully green,
  zero `it.fails` remaining** (grep-verified across tests/).
- `bash check-file-sizes.sh` → **PASS** (ratchet intact; `matchEngine.ts` is
  139 lines, well under 400).
