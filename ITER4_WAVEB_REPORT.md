# Iteration 4 — Wave B report (labs/vitals + allergies through the L7 template)

Two clinical-core record domains built THROUGH the golden domain template
(`src/lib/pipeline/adapters/_TEMPLATE.md`), matching the medications worked
example. No re-architecture; the projector, `runTransform`, `runPipeline`, and the
lenses are open/closed and were not touched.

## Domains built

### 1. labs-vitals (tier T1)
- Adapter: `src/lib/pipeline/adapters/lab.ts` (`labAdapter`). Parses a synthetic
  LOINC-coded FHIR Observation bundle (fhir-json, batch). ONE feed carries both
  laboratory results and vital-sign measurements; `Observation.category` selects
  provenance: `laboratory -> lab-result-authoritative`, `vital-signs ->
  clinician-measured`. Subject anchored through `deps.resolveIdentity` (id-only,
  exactly as medication.ts), never used as the graph key.
- Mapping: `src/lib/graph/mapping/lab.ts` (`labSpec`). Node `Observation`; dated
  ASSOCIATIVE edge `(Member)-[:OBSERVED_FOR {from effectiveDateTime}]->(Observation)`.
  A LOINC result is factual, not an asserted claim, so the edge is associative; the
  measuring provenance is carried onto the Observation node (source of record).
  Exports `LAB_DOMAIN`, `OBSERVATION_KIND`, `OBSERVED_FOR`.
- Event type: `observation.recorded`. Fixture: `tests/pipeline/fixtures/lab.json`
  (2 lab + 1 vital + 1 coding-less quarantine).

### 2. allergies (tier T1)
- Adapter: `src/lib/pipeline/adapters/allergy.ts` (`allergyAdapter`). Parses a
  synthetic coded FHIR AllergyIntolerance bundle (fhir-json, batch). Patient
  anchored through the identity seam. provenance = `clinician-asserted`.
- Mapping: `src/lib/graph/mapping/allergy.ts` (`allergySpec`). Node
  `AllergyIntolerance`; dated CAUSAL edge
  `(Member)-[:ALLERGIC_TO {causal, asserter, basis}]->(AllergyIntolerance)`. An
  allergy is a clinically causal-relevant asserted claim, so DP-1 requires a causal
  edge carrying `asserter = clinician-asserted`, `basis = <code>@<allergyRef>`.
  Exports `ALLERGY_DOMAIN`, `ALLERGY_KIND`, `ALLERGIC_TO`.
- Event type: `allergy.recorded`. Fixture: `tests/pipeline/fixtures/allergy.json`
  (2 coded + 1 coding-less quarantine).

## Registries touched (exactly the two the template names, per domain)
- `src/lib/pipeline/index.ts` — exports `labAdapter` / `ObservationPayload`,
  `allergyAdapter` / `AllergyPayload`.
- `src/lib/graph/mapping/index.ts` — imports `labSpec` + `allergySpec`, appended to
  `MAPPING_SPECS`.
- `src/lib/pipeline/types.ts` — `WpcDomain` widened with `'labs-vitals'` and
  `'allergies'`. `SourceFormat` already had `'fhir-json'` (no change).

## Tests (26 new; whole suite 778 passed / 0 fail)
Per domain, matching the template's step-7 checklist:
- Adapter normalization + C9 tier + e2e `runPipeline`:
  `tests/pipeline/lab.test.ts` (3), `tests/pipeline/allergy.test.ts` (3).
- Graph projection (node kinds, edge types, causal asserter/basis, both backends
  byte-identical, idempotent replay) + a whole-person lens read that now surfaces
  the domain: `tests/graph/lab.test.ts` (5), `tests/graph/allergy.test.ts` (5).
- Namespace pinning: `tests/pipeline/domainNamespaceIntegrity.test.ts` extended with
  a `labs-vitals` block (5) and an `allergies` block (5) — pins domain id, node
  kind, edge type, module paths, registry membership, and asserts every emitted
  `eventType` is claimed by exactly its own spec.

## C9 coverage matrix (record 5/20 -> 7/20)

| Domain id | Tier | Adapter | Mapping | Node type(s) | Edge type(s) | Edge semantics | Arrival |
|---|---|---|---|---|---|---|---|
| coverage | T1 | eligibility834 | coverage | Coverage | ENROLLED_IN | associative | batch |
| encounter | T1 | adtEncounter | encounter | Encounter | HAD_ENCOUNTER | associative | stream |
| sdoh | T1 | cboSdoh | sdoh | SdohScreening, SocialNeed | SCREENED_FOR, HAS_UNMET_NEED | assoc + causal | batch |
| medications | T1 | medication | medication | Medication, MedicationDispense | PRESCRIBED_FOR, DISPENSED_UNDER | assoc + causal | batch |
| **labs-vitals** | **T1** | **lab** | **lab** | **Observation** | **OBSERVED_FOR** | **associative** | **batch** |
| **allergies** | **T1** | **allergy** | **allergy** | **AllergyIntolerance** | **ALLERGIC_TO** | **causal** | **batch** |

Record count after wave B: **7/20** (coverage, encounter, sdoh, medications from
prior waves + labs-vitals, allergies here). Procedures (wave C) intentionally NOT
built.

## Verification
- `npx tsc --noEmit` = 0.
- `npx vitest run` = 778 passed, 1 expected-fail (pre-existing), 83+5 skipped; fully
  green, nothing prior broke.
- `bash check-file-sizes.sh` = PASS (ratchet intact, 75 frozen legacy files unchanged;
  every new file well under the 400/500 caps).
- Deterministic (clock injected via `deps.now`), generic + synthetic (no hardcoded
  persona, §1.2), namespace pinning test passes for both new domains.
- L1: projection runs over the in-memory / pg-mem fakes; CI-pending real-backend
  integration count stays **0** for these pure record domains.

## Out of scope / not touched
Medications, procedures, `src/lib/pipeline/stages.ts`, `src/lib/identity` — untouched.
`resolveIdentity` used id-only exactly as `medication.ts` does today.
