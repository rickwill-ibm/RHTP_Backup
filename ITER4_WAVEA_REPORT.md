# Iteration 4 — Wave A report: domain template (L7) + medications domain

Wave A captures the proven adapter+mapping shape from the three existing adapters
into ONE golden template, then proves it by building the richest of the four
clinical-core domains — **medications** (prescribed + dispensed) — entirely through
that template. No re-architecture: every surface matches the existing patterns.

## Verification (Definition of Done)
- `npx tsc --noEmit` -> **0**
- `npx vitest run` -> **752 passed** | 1 expected-fail | 83 skipped (was 738; **+14**, 0 regressions)
- `bash check-file-sizes.sh` -> **PASS** (ratchet intact, 75 frozen legacy files unchanged; largest new file 218 lines, well under the 400/500 caps)
- Deterministic (clock injected via `deps.now()`); generic + synthetic, no hardcoded persona (§1.2)
- L1 fake-fidelity: medications projection runs over the in-memory / pg-mem fakes only; **CI-pending real-backend integration count stays 0** for this pure record domain.

## 1. The L7 template
`src/lib/pipeline/adapters/_TEMPLATE.md` — the golden checklist: the exact files to
create (adapter, mapping, fixture, two test files), the exact **two registries** to
touch (pipeline `index.ts` export + graph `mapping/index.ts` `MAPPING_SPECS`), plus
the `types.ts` union widening, and the **8-step checklist** — (1) source parse,
(2) normalize, (3) tier + provenance, (4) segmentation-if-sensitive,
(5) graph mutations (node/edge types, dated, causal-with-provenance),
(6) register both, (7) tests (normalization + projection + lens read + C9 tier +
namespace pinning), (8) C9 matrix row. The **medications domain is inlined as the
worked reference example** at every step, so a subsequent domain agent fills in the
same recipe and cannot drift. The pipeline README adapters table now links it.

## 2. The medications domain (built through the template)
One FHIR-JSON feed carries two related resource kinds — the stress test for the
template's two-node-type / causal-link shape.

- **Adapter** `src/lib/pipeline/adapters/medication.ts` (batch, `fhir-json`):
  parses a synthetic RxNorm bundle (`tests/pipeline/fixtures/medication.json`) into
  normalized records at **T1**. `MedicationRequest -> Medication`
  (`medication.prescribed`, provenance `prescriber-authoritative`);
  `MedicationDispense -> MedicationDispense` (`medication.dispensed`, provenance
  `pharmacy-dispense`). Identity anchored through `deps.resolveIdentity` (never the
  raw `Patient/RX-MEM-*` ref); payloads are codes + refs only; the dispense payload
  carries `prescriptionRef` so the causal edge attaches. Typed payload interfaces
  `MedicationPayload` / `MedicationDispensePayload` live in the adapter file.
  Registered in `src/lib/pipeline/index.ts`.
- **Mapping** `src/lib/graph/mapping/medication.ts`, registered in `MAPPING_SPECS`:
  - `(Member)-[:PRESCRIBED_FOR {from authoredOn}]->(Medication)` — associative, dated.
  - `(MedicationDispense)-[:DISPENSED_UNDER {causal, asserter, basis}]->(Medication)`
    — the pharmacy asserts the fill satisfied the order, so **causal with
    provenance** (`asserter = pharmacy-dispense`, `basis = <rxnorm>@<prescriptionRef>`).
  - Emits only the neutral instruction set; exports the pinned namespace constants.
- **Namespace widening**: `WpcDomain += 'medications'`, `SourceFormat += 'fhir-json'`
  in `pipeline/types.ts` (one pre-existing test helper in `transform.test.ts` was
  re-pointed at the `SourceFormat` type instead of a duplicated literal union — an
  in-scope sync fix, not a re-architecture).

## 3. The pinning test (refined L3, F-C1 lesson)
`tests/pipeline/domainNamespaceIntegrity.test.ts` pins the domain id, node kinds,
edge types, module paths, and registry entries and asserts **all surfaces agree**:
the adapter and spec share `domain = 'medications'`; the spec is in `MAPPING_SPECS`
and `specFor(...)` claims both event subtypes; the adapter is exported with the
right format/mode; **every eventType the adapter emits on the real fixture is
claimed by exactly the medications spec**; and the projector emits exactly the
pinned node kinds + edge types per event. One drifting surface fails here.

## 4. Tests (14 new, all green)
| File | Cases | Covers |
|---|---|---|
| `tests/pipeline/medication.test.ts` | 3 | normalization (prescribed + dispensed), **C9 tier T1** + provenance on every record, PHI-safe payload/quarantine, end-to-end `runPipeline` propagation on pg-mem (4 events, class=batch, tier carried) |
| `tests/graph/medication.test.ts` | 6 | projection to the neutral instruction set, causal `DISPENSED_UNDER` with asserter/basis, dated associative `PRESCRIBED_FOR`, **both backends byte-identical**, idempotent replay, **whole-person lens now surfaces the Medication** on both backends |
| `tests/pipeline/domainNamespaceIntegrity.test.ts` | 5 | the cross-surface pinning above |

## C9 coverage matrix — record 3/20 -> 4/20 (wave A)
| # | C9 domain id | Tier | Adapter (format / mode) | Mapping spec | Node types | Edge types |
|---|---|---|---|---|---|---|
| 1 | `coverage` | T1 | `eligibility834` (x12-834 / batch) | `coverageSpec` | Coverage | HAS_COVERAGE |
| 2 | `encounter` | T1 | `adtEncounter` (hl7v2-adt / stream) | `encounterSpec` | Encounter | HAD_ENCOUNTER |
| 3 | `sdoh` | T1 | `cboSdoh` (flat-file-csv / batch) | `sdohSpec` | SdohScreening, SocialNeed | SCREENED_FOR, HAS_UNMET_NEED |
| **4** | **`medications`** | **T1** | **`medication` (fhir-json / batch)** | **`medicationSpec`** | **Medication, MedicationDispense** | **PRESCRIBED_FOR, DISPENSED_UNDER** |

Waves B/C add `labs-vitals`, `allergies`, `procedures` (record -> 7/20) through the
same template + the namespace pinning surface, which they extend with their own
pinned rows. `careteam` has a mapping spec (lens-backed) but no ingest adapter yet;
it is not a C9 record-ingest row.

## Blocking concern
None. One adjacent observation for wave B/C: the `whole-person` lens is 1-hop from
the member, so it surfaces the `Medication` (via `PRESCRIBED_FOR`) but not the
`MedicationDispense` (reachable only 2-hop via `DISPENSED_UNDER`) — matching the
pinned 2-edge design; a medications-specific or 2-hop lens is a separate follow-on,
out of scope here.
