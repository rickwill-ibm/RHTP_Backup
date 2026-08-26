# Iteration 8A-ii, Wave D - convergence (DRY) + E9 fail-open sweep + red-team panel

Role: convergence engineer (B3) + red-team panel host. Framework v1.2. Working tree
`/home/claude/baseline` (live). Reconciles the three parallel build waves (A: real
validate + $expand + version/retired + UCUM; B: $translate + HCC classification;
C: pipeline binding + value-set currency) into one DRY surface, sweeps the terminology
path for fail-open shapes, runs the mandatory red-team panel, fixes every Unacceptable,
and updates the register.

## 1. Convergence to DRY - yes

The three waves appended ONLY clearly-commented blocks to the pre-declared shared
partitions. Reconciliation result:

- **Seam (seamDispositions.ts):** ONE `terminology` seam entry (disposition
  `fail-closed-stub`, `TerminologyServiceNotConfiguredError`). No second seam was
  minted for $translate / classify / currency - they extend the SAME seam
  programmatically (verified: single `terminology:` key, single dataMode entry).
- **dataMode.ts:** ONE `terminology` seam id in the union (no duplicate).
- **terminology/index.ts:** append-only Wave A / B / C blocks, no duplicate or
  divergent exports (tsc 0 proves no clashing identifiers). Currency is exported from
  its single source module (`registry/currency.ts`); reachable via both
  `@/lib/terminology` and `@/lib/terminology/registry` but from one source (no drift).
- **registry/index.ts / types.ts:** append-only, consistent.
- **validateCode is CALLED, not duplicated:** the pipeline transform binding
  (`pipeline/semanticBinding.ts`) reuses `selectSemanticValidator()` (the gate built
  from `validateCodeVersioned` + UCUM); the seed service `validateCode` delegates to
  `validateCodeVersioned`; classify/translate do not re-implement it. A spy-gate test
  proves the verdict flows from the gate, not a re-derivation.
- **Determinism:** the only `new Date()` in the terminology tree is the registry's
  injectable default clock (`opts.now ?? () => new Date()`); the seed service injects
  `@/lib/clock`, currency/classify take an injected `asOf`, the pipeline binding takes
  `deps.now`. No un-injected wall-clock in logic.
- **Per-wave test partitions all run:** tests/terminology 92, tests/pipeline +
  tests/governance green; full suite green (below).

### One DRY violation found and FIXED

The ICD-10-CM -> CMS-HCC crosswalk content was DUPLICATED: `data/terminology-seed.json`
(`hccClassification`, read by `seedTerminologyService.classify`) AND
`classify/data/hcc-crosswalk.json` (read by Wave B `hccClassify`) both carried the same
3 mappings - and had already drifted (N18.6 label: "stage 5, or ESRD" vs "...or
end-stage renal disease"). Consolidated to the SINGLE Wave B source: the legacy seed
service now sources `classify/data/hcc-crosswalk.json`'s `map`, the duplicate
`hccClassification` block was deleted from the seed JSON, the SeedShape type was
trimmed, and the README pointer updated. Behavior preserved (all classify tests green);
one source of truth going forward.

## 2. E9 fail-open sweep (terminology path) - clean

`rg` of the fail-open shapes (`return true`, `valid: true`, `matched: true`,
`classified: true`, `|| true`, `?? true`, `catch`, `ok: true`) across
`src/lib/terminology/**` + `pipeline/semanticBinding.ts` returned 8 hits - every one
justified, zero fail-closed code changes required:

| hit | verdict |
|---|---|
| semanticValidator `catch (err)` | fail-CLOSED: a `TerminologyServiceNotConfiguredError` becomes a `semantic-terminology-unavailable` quarantine; any other error rethrows |
| validateCode `valid: true` | gated on `currentMembers(system).includes(code)` after the retired check |
| ucum `valid: true` (applicable:false) | non-quantitative LOINC: no unit expectation applies (the gate only acts on `applicable && !valid`) |
| ucum `valid: true` (in allowed) | gated on the LOINC's allowed-unit list |
| crosswalkTranslate `matched: true` | gated on a found target; unmapped -> no-map, never a fabricated target |
| hccClassify / seed classify `classified: true` | gated on a found map entry; unmapped -> `group: null` |
| valueSetRegistry `return true` | pure in-window predicate |

Composed end-to-end the path is fail-closed: an unverifiable code (production server
throws) quarantines; a RETIRED code is invalid (`semantic-retired-code`); an
untranslatable code returns no-map; a stale / superseded / expired value-set version
quarantines under the production `enforce` posture (`semantic-valueset-*`); the
production terminology server stays fail-closed. **E9 result: clean (fixed-0).**

## 3. Red-team panel (every persona produced findings)

Full findings + failure scenarios are in the register's "Iteration 8A-ii" section.

- **R1 Domain-Fidelity (terminology / semantic interoperability): 7 findings.**
  $validate-code is genuine member-of-value-set (+ residual: exact-key only, no SNOMED
  subsumption / ICD-10 rollup); $translate is a real ConceptMap with asset+version
  provenance and no fabrication (+ residual: no reverse/transitive); retirement per
  FHIR (+ residual: flat list, no replacedBy); HCC is one of four families, data-driven
  (+ residual: only CMS-HCC has content, V28 numbers illustrative); UCUM analyte-correct
  (+ residual: 13-atom allowlist, no grammar/conversion); thin Gravity/Z-code SDOH
  coverage; CVX ungoverned though immunizations is code-carrying.
- **R2 Negative-Space: 8-item missing-list.** Expansion cache/invalidation; per-binding
  version pinning through the validate surface; SNOMED post-coordination; reverse +
  transitive translate; bulk/batch validate; a persisted terminology audit trail; UCUM
  canonicalization/conversion; CVX governance.
- **R3 Stub-Legitimacy: 6 graded, all Acceptable, 0 Unacceptable open.** membership+ucum
  seed, crosswalks.json, hcc-crosswalk+risk-families, currency posture, the extended
  seam - all fail closed with named errors and honest `stub:true` / `_comment` labels.
  The one **Risky** grade (the duplicate ICD->HCC map) was FIXED this wave; the legacy
  flat-conceptMap translate coexisting with Wave B's crosswalk is an Acceptable residual
  (unconsumed by the pipeline, returns null, never fabricates) routed forward.

## 4. Unacceptable - 0 left open

No finding graded Unacceptable. The duplicate ICD->HCC map (R3 Risky, a convergence /
drift defect) was fixed proactively this wave. No fail-open shape required a
fail-closed change.

## 5. Register updated - yes

`verification/GAP_AND_STUB_RISK_REGISTER.md` gains an "Iteration 8A-ii" section: the I4
terminology stub advanced to real logic (member-of-bound-version validate, $expand,
version/retired, UCUM, provenance $translate, data-driven HCC one-of-four, transform
binding, currency enforcement); residuals routed forward (LIVE terminology / crosswalk /
HCC-grouping / Gravity server fail-closed and CI-pending, full licensed maps, CVX
governance, single-translate-surface consolidation, SNOMED subsumption + UCUM
grammar/conversion); convergence, E9, and the full red-team disposition recorded.

## Verification (in /home/claude/baseline)

- `npx tsc --noEmit` -> **0**.
- `npx vitest run` (full) -> **1267 passed, 1 expected fail, 91 skipped, 0 failures**.
- `npx vitest run tests/terminology tests/pipeline tests/governance` -> green
  (terminology 92, governance 33; namespace/seam arbiter green).
- `bash check-file-sizes.sh` -> **PASS** (ratchet intact; my edits only shrank files /
  touched exempt `*/data/*.json`).
- Style: no em dash followed by a space; no double spaces in authored content.

## DoD (composite gate v1.2)

tsc 0; full suite green (orchestrator re-runs authoritatively); size/ratchet PASS; no
fail-open shapes (E9 clean); the `terminology` seam declared fail-closed (E1); convergence
DRY (1 duplicate fixed); every red-team persona produced findings (R1 7 / R2 8 / R3 6);
zero new Unacceptable left open; register updated.
