# Iteration 8A-ii - Wave A (framework B2): real validate + $expand + version/retired + UCUM

Terminology specialist, disjoint tree, framework v1.2. Makes `validateCode` REAL
over the seeded value sets (member-of-bound-version, not a flat allowlist), adds
`$expand`, version/retirement awareness, and UCUM unit validation for LOINC
quantitative results. Production posture unchanged (fail-closed). Deterministic
via an injected clock.

## Scope delivered

### 1. validateCode REAL over the bound value-set version
`src/lib/terminology/validateCode/validateCode.ts` (`validateCodeVersioned`).
A governed coding is valid ONLY if it is a member of the value-set VERSION the
registry currently binds for that system. Outcomes:
- ungoverned system -> `unsupported-system` (no binding)
- governed non-member -> `unknown-code` (with binding)
- member of the bound version -> `valid` (with binding + display)
- retired in the bound version -> `retired` (invalid) [E9]

Every answer carries the `CodeAssetBinding` (assetId, version, current). The
current-version members are the keys of `codeSystems[system].codes` in
`terminology-seed.json` (single source of truth, DRY); membership deltas live in
the new `membership` block. `seedTerminologyService.validateCode` now delegates
here; `createSeedTerminologyService({ now })` injects a fixed clock so the "current
version at check time" is deterministic (default singleton reads `@/lib/clock`).

### 2. $expand (value-set membership enumeration)
`src/lib/terminology/expand/expand.ts` (`expandValueSet`). Enumerates the bounded,
PHI-free membership of a governed value-set version (defaults to the registry's
bound version; a modeled prior version enumerates differently). Unknown version or
ungoverned system -> undefined. Capped (`max`, default 1000) with a `truncated`
flag. This is what makes membership a real enumeration rather than an opaque list.

### 3. Version + retirement
Seed `membership` block records, per system, `currentVersion`, `retiredInCurrent`
(codes removed as of the bound version), and `priorVersions` deltas. A code valid
in an older version but retired in the current bound version returns `retired`
(invalid for admission) with the bound version noted (e.g. ICD-10-CM `R51` retired
in FY2026 yet a member of FY2025; CMS-HCC `HCC58` retired in V28, member of V24).
Determinism: the bound version resolves through the registry's injected clock, so
before FY2026 is effective no active version binds - proving check-time resolution.

### 4. UCUM
`src/lib/terminology/validateCode/ucum.ts` (`validateUcumForLoinc`). For a LOINC
quantitative result the unit must be a well-formed UCUM unit AND appropriate for
that LOINC (seeded `ucum.validUnits` allowlist + per-LOINC `ucum.loincUnits`). A
bad unit is a semantic finding: `ucum-invalid-unit` (not well-formed) or
`ucum-unit-not-allowed-for-loinc` (valid UCUM, wrong for the LOINC). A LOINC not in
`loincUnits` is non-quantitative (no check). Wired into the stage-4 gate:
`extractLoincQuantities` pairs a LOINC coding with its co-located unit and the gate
emits `semantic-ucum-invalid-unit` / `semantic-ucum-unit-not-allowed`.

### 5. Production posture unchanged
`productionTerminologyService.validateCode` still throws
`TerminologyServiceNotConfiguredError`; the gate turns the throw into a
fail-closed `semantic-terminology-unavailable` quarantine. UCUM checks are skipped
when the server is unavailable (the record already fails closed). Verified.

### 6. Gate retirement wiring
`semanticValidator.ts` maps `retired` -> `semantic-retired-code`; a retired code
quarantines PHI-safe (reason + field path only), never admitted (E9).

## Files

Owned / new:
- `src/lib/terminology/validateCode/{validateCode,membership,ucum,index}.ts`
- `src/lib/terminology/expand/{expand,index}.ts`
- `src/lib/terminology/seedTerminologyService.ts` (validateCode delegates; clock factory)
- `src/lib/terminology/semanticValidator.ts` (retired mapping + UCUM gate + `extractLoincQuantities`)
- `src/lib/terminology/data/terminology-seed.json` (`membership` + `ucum` blocks)
- `src/lib/terminology/types.ts` (added `retired` to `CodeValidationStatus`, Wave A)
- Shared `src/lib/terminology/index.ts`: appended a clearly-commented Wave A block only.

Tests (new): `tests/terminology/{validateCode,expand,version,ucum}.test.ts` - 29 tests.

Every new file <=400 lines. No em dash followed by a space; no prose double spaces.

## Verification (in /home/claude/baseline)
- `npx tsc --noEmit`: 0 errors.
- `npx vitest run tests/terminology`: green (my 4 files = 29 tests; suite incl. concurrent Wave B files: 92 tests / 10 files).
- `npx vitest run tests/pipeline tests/governance`: 192 tests green (no regression from the gate/type/seed changes).
- `bash check-file-sizes.sh`: PASS (ratchet intact).

## DoD / E9
- Member-of-bound-version validity: proven (validateCode.test).
- Retired-code rejection with bound version: proven (version.test) - a retired code never passes as valid.
- $expand enumerates a version, prior vs current differ: proven (expand.test).
- UCUM good/bad unit + gate findings: proven (ucum.test).
- Production fails closed: proven (validateCode.test + existing semanticGate.test).
