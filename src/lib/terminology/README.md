# Terminology / semantic-validation seam (`src/lib/terminology/`)

Structural validity (does a record have the right shape) is not the same as
**semantic** validity: are its codes real, do they translate across systems, and
how do they classify? This seam answers that, and wires a **semantic gate** into
pipeline stage 4 **alongside** the existing structural `FhirProfileValidator`
(the structural gate is not removed). Everything here is an **honest stub**: the
seeded service is real-now for demo data; the production service throws until a
real terminology server is wired.

## Governed code systems

| System      | Meaning                      | Demo use                   |
| ----------- | ---------------------------- | -------------------------- |
| `RxNorm`    | Medications                  | MedicationRequest/Dispense |
| `LOINC`     | Labs / vitals                | Observation                |
| `SNOMED-CT` | Clinical findings, allergens | AllergyIntolerance         |
| `ICD-10-CM` | Diagnoses, Z-codes (SDOH)    | SDOH z-codes               |
| `CPT-HCPCS` | Procedures / services        | (reserved)                 |
| `HCC`       | CMS risk-adjustment groups   | classify() target          |

## The three operations

- **`validateCode(system, code)`** — is this a real code in a governed system?
  Returns `{ valid, status: valid | unknown-code | unsupported-system, stub }`.
  This backs `$validate-code` on a real server.
- **`translate(code, sourceSystem, targetSystem)`** — cross-map a code between
  systems ($translate / ConceptMap). Returns the target code or `null`.
- **`classify(code, scheme, valueSetId?)`** — group a code. `scheme: 'HCC'` maps
  an ICD-10-CM diagnosis to its **CMS-HCC risk-adjustment group** (e.g. `E11.9`
  → `HCC38`); `scheme: 'value-set'` answers value-set membership.

### HCC classification note

HCC (Hierarchical Condition Category) grouping drives risk-adjustment payment:
ICD-10-CM diagnoses roll up into HCC groups, which carry risk weights. The
seeded service ships a **small stub crosswalk** (the single source of truth is
`classify/data/hcc-crosswalk.json`, shared by both the seeded service and the
data-driven `classify/hccClassify`), NOT the full CMS mapping. A production
deployment resolves HCC via the real crosswalk / a grouping service.

## Modes (the `terminology` dataMode seam)

- `mock` / `seeded` → **`seedTerminologyService`**: an in-repo allowlist
  (`data/terminology-seed.json`) covering exactly the codes the demo fixtures
  use. Every answer is flagged `stub: true`.
- `production` → **`productionTerminologyService`**: throws
  `TerminologyServiceNotConfiguredError` naming the FHIR terminology operations
  ($validate-code / $translate / ValueSet $expand).

## The stage-4 semantic gate

`SemanticValidator` (`semanticValidator.ts`) is wired into `conformAndLoad`
(pipeline stage 4) as a **second gate after** the structural profile validator.
It extracts governed codings from `record.payload`, validates each against the
selected `TerminologyService`, and quarantines a record with a PHI-safe reason
when a code is bad:

- `semantic-unrecognized-code` — governed system, code not recognized (seeded).
- `semantic-unsupported-system` — a coding in a system we do not govern.
- `semantic-terminology-unavailable` — **production, not wired**: codes cannot
  be verified, so the gate **fails closed** (quarantine, never admit unverified).

In mock/seeded mode the allowlist covers all demo codes, so the demo pipeline
stays green. Callers may pass `semanticValidator: null` to `conformAndLoad` to
disable the gate.

## What the real terminology-server plug-in needs

- `TERMINOLOGY_SERVER_BASE_URL` — a FHIR terminology server
- Auth for its endpoints
- Map the three operations to `CodeSystem/$validate-code`,
  `ConceptMap/$translate`, and `ValueSet/$expand` (+ an HCC grouping service /
  crosswalk for `classify(scheme: 'HCC')`)

Replace the throwing bodies of `productionTerminologyService` with `fetch()`
calls; the seam and the stage-4 gate do not change.
