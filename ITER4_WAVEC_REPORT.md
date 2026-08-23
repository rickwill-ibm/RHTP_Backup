# Iteration 4 Wave C — Procedures domain (record 7/20)

Built the **procedures** clinical-core record domain THROUGH the L7 domain template
(`src/lib/pipeline/adapters/_TEMPLATE.md`), matching the medications reference shape.
Tier T1, arrival mode batch, wire format FHIR-JSON. Nothing outside the pinned
`procedures` namespace was touched (medications / labs / allergies / identity /
terminology left to their owning agents).

## The procedures domain

One synthetic CPT/SNOMED-coded FHIR `Procedure` feed -> normalized `Procedure`
records -> the member's procedure subgraph.

| Step (template) | What was built |
|---|---|
| 1. Source parse | `tests/pipeline/fixtures/procedure.json` — synthetic bundle: proc-1 (CPT `45378`, references `Encounter/enc-1`, `performedDateTime`), proc-2 (SNOMED `80146002`, `performedPeriod.start`, standalone), proc-bad (no coding -> quarantine). PHI-safe `sourceRef` = resource id. |
| 2. Normalize | `src/lib/pipeline/adapters/procedure.ts` — anchors the subject through `deps.resolveIdentity(subjectSourceId, { feed })` (id-only, exactly as medication.ts); event `procedure.performed`; `idempotencyKey` `procedure:<id>`; codes+refs-only payload (`ProcedurePayload`), including `encounterRef` for the encounter link. Date from `performedDateTime` or `performedPeriod.start`. |
| 3. Tier + provenance | `tier: 'T1'`; provenance `provider-performed`. |
| 4. Segmentation | Not intrinsically sensitive: no hints; default `consent: { part2Restricted: false, segmentLabels: [] }` emitted uniformly. |
| 5. Graph mapping | `src/lib/graph/mapping/procedure.ts` — `(Member)-[:PERFORMED_ON {causal, asserter, basis}]->(Procedure)` dated from the procedure date (asserted clinical act, DP-1 causal: `asserter=provider-performed`, `basis=<code>@<procedureRef>`); and when the source references an encounter, `(Procedure)-[:PERFORMED_DURING {associative, dated}]->(Encounter)` to the EXISTING Encounter node. Standalone procedures emit no PERFORMED_DURING. |
| 6. Registries | Both touched (below). |
| 7. Tests | Adapter normalization + tier + e2e, graph projection (both backends) + lens read, namespace pinning (below). |
| 8. C9 matrix | Row added; record count 6/20 -> 7/20. |

## Registries touched (exactly the two the template names)

- **Pipeline adapter registry** `src/lib/pipeline/index.ts` — `export { procedureAdapter, type ProcedurePayload } from './adapters/procedure';`
- **Graph mapping registry** `src/lib/graph/mapping/index.ts` — imported `procedureSpec`, appended to `MAPPING_SPECS`.
- **Union widened** `src/lib/pipeline/types.ts` — `WpcDomain` gains `'procedures'` (`SourceFormat` already had `'fhir-json'`).

## Tests (14 new)

- `tests/pipeline/procedure.test.ts` (3): fixture -> normalized (T1, provenance, anchored `mem-` memberId, no PHI in payload/quarantine, encounter ref carried, both date sources), C9 tier assertion, end-to-end `runPipeline` (2 events, class `batch`, `source.tier` T1, partition key = member).
- `tests/graph/procedure.test.ts` (6): projector emits Procedure + causal PERFORMED_ON + PERFORMED_DURING; standalone procedure emits no PERFORMED_DURING; both backends (pg-mem + Neo4j fake) rebuild byte-identical nodes/edges; idempotent replay; whole-person lens surfaces the Procedure off the member on both backends.
- `tests/pipeline/domainNamespaceIntegrity.test.ts` (5 new, procedures block): pinned constants == literals; adapter/mapping agree on domain id; both registries carry the surfaces; every emitted `eventType` claimed by exactly `procedureSpec`; mapping projects the pinned node kind + causal PERFORMED_ON (+ PERFORMED_DURING when an encounter is referenced).

## C9 coverage matrix (7/20)

| # | Domain id | Tier | Adapter | Mapping node -> edge | Arrival |
|---|---|---|---|---|---|
| 1 | coverage | T1 | eligibility834 | Coverage -> HAS_COVERAGE | batch |
| 2 | encounter | T1 | adtEncounter | Encounter -> HAD_ENCOUNTER | stream |
| 3 | sdoh | T2 | cboSdoh | Screening/Need -> SCREENED_FOR/HAS_UNMET_NEED | flat-file |
| 4 | medications | T1 | medication | Medication + MedicationDispense -> PRESCRIBED_FOR (assoc) / DISPENSED_UNDER (causal) | batch |
| 5 | labs-vitals | T1 | lab | Observation -> OBSERVED_FOR (assoc) | batch |
| 6 | allergies | T1 | allergy | AllergyIntolerance -> ALLERGIC_TO (causal) | batch |
| 7 | **procedures** | **T1** | **procedure** | **Procedure -> PERFORMED_ON (causal) + PERFORMED_DURING -> Encounter (assoc)** | **batch** |

Record model: **7/20** domains covered.

## Verification

- `npx tsc --noEmit` -> **0**.
- `npx vitest run` -> **fully green**: 806 passed, 1 expected-fail (pre-existing), 83 skipped; 115 files passed.
- `bash check-file-sizes.sh` -> **PASS** (ratchet intact, 75 frozen legacy files unchanged; new src files 135 / 92 lines, tests 101 / 128 / 315 — all under caps).
- Namespace pinning test passes. Deterministic (clock injected). Generic + synthetic, no hardcoded persona (§1.2).
- L1 fake-fidelity: projection runs over the in-memory / pg-mem fakes; CI-pending real-backend integration count stays **0** for this pure record domain.
