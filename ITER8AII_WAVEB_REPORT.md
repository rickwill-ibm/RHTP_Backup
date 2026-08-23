# Iteration 8A-ii Wave B - $translate + classification (B2, terminology specialist)

Framework v1.2. Working tree `/home/claude/baseline` (live, parallel with waves A/C).
Role: terminology/classification specialist. Disjoint tree owned; shared files
append-only.

## Scope delivered

Real `$translate` cross-map over seeded crosswalks + data-driven, versioned HCC
classification with the risk-family taxonomy exposed as data. Live crosswalk /
grouping server stays fail-closed via the SAME `terminology` seam (no second seam
minted).

## Files authored (all < 400 lines; data JSON exempt under `*/data/*.json`)

Owned tree:
- `src/lib/terminology/translate/types.ts` (65) - CrosswalkTranslation with
  provenance (crosswalk assetId + version), CrosswalkTarget, CrosswalkTranslator.
- `src/lib/terminology/translate/crosswalkTranslate.ts` (120) - seeded ConceptMap
  `$translate` engine + `liveCrosswalkTranslator` (throws) + `selectCrosswalkTranslator()`.
- `src/lib/terminology/translate/index.ts` (20) - barrel.
- `src/lib/terminology/translate/data/crosswalks.json` - seeded crosswalks:
  ICD-10-CM <-> CMS-HCC (V28) and SNOMED-CT <-> ICD-10-CM, each declaring assetId + version.
- `src/lib/terminology/translate/README.md` - provenance (synthetic/sample, not the
  full licensed map; no-fabrication + fail-closed invariants).
- `src/lib/terminology/classify/types.ts` (67) - HccClassification (model ref +
  registry binding), RiskFamily, HccClassifier.
- `src/lib/terminology/classify/hccClassify.ts` (119) - data-driven diagnosis->HCC
  classifier stamping model asset/version + registry currency; `liveHccClassifier`
  (throws); `selectHccClassifier()`; `riskFamilyTaxonomy()`.
- `src/lib/terminology/classify/index.ts` (16) - barrel.
- `src/lib/terminology/classify/data/hcc-crosswalk.json` - ICD-10 -> CMS-HCC V28
  seed under a versioned `model`.
- `src/lib/terminology/classify/data/risk-families.json` - CMS-HCC / RxHCC /
  HHS-HCC / CDPS as data (HCC is one of several).
- `src/lib/terminology/classify/README.md` - provenance.

Owned tests:
- `tests/terminology/translate.test.ts` (8 tests)
- `tests/terminology/classify.test.ts` (8 tests)

Shared file (append-only, my clearly-commented block; Wave A's concurrent block
left untouched):
- `src/lib/terminology/index.ts` - appended Wave B translate + classify exports.

Not touched (per partition): seamDispositions.ts, dataMode.ts (the `terminology`
seam already exists and is fully declared; I reuse it programmatically, minting no
second seam), registry/currency.ts, pipeline, semanticValidator/seedTerminologyService/
validateCode/expand, registry/index.ts, types.ts.

## DoD evidence

- **translate-real**: `seedCrosswalkTranslator.translate('ICD-10-CM','E11.9','HCC')`
  returns `[{system:'HCC',code:'HCC38',...}]` with `crosswalk:{assetId:'cms-hcc-v28',
  version:'V28'}`; SNOMED-CT '44054006' -> ICD-10-CM 'E11.9' with asset
  `snomed-ct-us-20260301`/`US20260301`. Data-driven (custom crosswalk set honored).
- **no-fabricated-map (E9)**: an untranslatable code returns NO-MAP (`targets:[]`,
  `noMap:true`) - the consulted crosswalk is named for audit but no target is
  invented; a system pair with no crosswalk returns `crosswalk:null`. Tested.
- **hcc-classify-data-driven**: `classify('E11.9')` -> `HCC38` carrying
  `model{family:'CMS-HCC',assetId:'cms-hcc-v28',version:'V28'}` + registry
  `binding{version:'V28',current:true}` (deterministic via injected `asOf`); an
  unmapped diagnosis -> `group:null` (no fabrication); a V24-bound classification is
  flagged `current:false`. Tested.
- **risk-families-as-data**: `riskFamilyTaxonomy()` enumerates CMS-HCC, RxHCC,
  HHS-HCC, CDPS from JSON; each carries program + active model asset id. HCC is one
  member, not the whole taxonomy. Tested.
- **fail-closed live path**: `selectCrosswalkTranslator()` / `selectHccClassifier()`
  read `getDataMode('terminology')`; production returns the live service which throws
  `TerminologyServiceNotConfiguredError` ($translate / HCC grouping). Tested.

## Verification (in /home/claude/baseline)

- `npx tsc --noEmit`: 0 errors.
- `npx vitest run tests/terminology`: 49 passed (5 files). With tests/governance:
  90 passed (8 files) - shared-partition append did not break the namespace/seam gate.
- `bash check-file-sizes.sh`: PASS (no new violations, ratchet intact).
- Deterministic (currency via injected `asOf`; no wall-clock in logic). Style: no em
  dash followed by a space, no double spaces in authored files.

New tests added: 16 (translate 8 + classify 8).
