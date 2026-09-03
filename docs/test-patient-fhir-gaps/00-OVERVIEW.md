# FHIR Seed Gap Analysis — Test Patient Comparison
**Reference patient: Maria Redhawk** (`fhir/seed/maria-redhawk.bundle.json`)
**Comparison patients:** Dorothy Simmons · James Wilson · Alex Kirby · Lisa Thompson · Robert Chen

---

## Critical architecture note — what the SmartApp mock store actually loads

The in-memory FHIR store (`src/lib/fhir/store.ts`) **only loads Maria's bundle**.
The whole-person patient bundles live in `fhir/seed/patients/` and are seeded to the
live HAPI server but are **never loaded into the mock store**. In mock mode, selecting
any patient other than Maria causes `resolveIds()` to fall back to Maria's demo data.
This means gaps 2–6 below only matter in **live FHIR mode** (HAPI on :8080).

FHIR ID mismatch (also blocks live mode): the registry maps
`PAT-0042 → patient-dorothy-042` but the bundle's `Patient.id` is `dorothy-simmons`.
Same mismatch for all whole-person patients. The store and HAPI resolver will not find
them unless the FHIR IDs in the bundles match the registry map.

---

## Resource count by patient

| Resource type | Maria | Dorothy | James | Alex | Lisa | Robert |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Total resources** | **52** | **52** | **44** | **52** | **37** | **40** |
| Patient | 1 | 1 | 1 | 1 | 1 | 1 |
| Encounter | 4 | 1 | 1 | 0 | 1 | 1 |
| Condition | 7 | 8 | 5 | 5 | 2 | 4 |
| Observation | 15 | 14 | 10 | 33 | 11 | 10 |
| MedicationRequest | 5 | 6 | 5 | 0 | 3 | 3 |
| AllergyIntolerance | 2 | 0 | 0 | 0 | 0 | 0 |
| Immunization | 3 | 0 | 0 | 0 | 0 | 0 |
| FamilyMemberHistory | 1 | 0 | 0 | 0 | 0 | 0 |
| DiagnosticReport | 1 | 0 | 0 | 0 | 0 | 0 |
| DocumentReference | 1 | 0 | 0 | 0 | 0 | 0 |
| Procedure | 1 | 0 | 0 | 0 | 0 | 0 |
| CarePlan | 1 | 1 | 1 | 0 | 1 | 1 |
| CareTeam | 1 | 1 | 1 | 0 | 1 | 1 |
| Goal | 2 | 4 | 3 | 0 | 3 | 3 |
| Coverage | 1 | 1 | 1 | 1 | 1 | 1 |
| Flag | 1 | 2 | 2 | 1 | 2 | 2 |
| ServiceRequest | 1 | 2 | 5 | 2 | 3 | 3 |
| RiskAssessment | 0 | 1 | 1 | 0 | 1 | 1 |
| MeasureReport | 0 | 2 | 2 | 1 | 1 | 2 |
| Task | 0 | 2 | 1 | 6 | 1 | 1 |
| Consent | 0 | 0 | 0 | 0 | 0 | 1 |
| Practitioner | 4 | 1 | 1 | 0 | 1 | 1 |
| Organization | 0 | 4 | 3 | 2 | 3 | 3 |

---

## Summary of gaps — SmartApp banner impact

The PatientBanner renders: **Name · Age · DOB · Sex · MRN · FIN · Allergies ·
Flags · Location · Attending · Encounter type · Weight · BMI · Coverage**.
Maria has all of these. The table below shows which gap causes a blank/dash in
the banner for each patient.

| Banner field | Maria | Dorothy | James | Alex | Lisa | Robert |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Name / Age / DOB / Sex | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| MRN (identifier) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Allergies | ✅ | ❌ blank | ❌ blank | ❌ blank | ❌ blank | ❌ blank |
| Flags (clinical alerts) | ✅ coded | ⚠ uncoded | ⚠ uncoded | ⚠ text-only | ⚠ uncoded | ⚠ uncoded |
| Encounter — type | ✅ | ✅ | ✅ | ❌ no Encounter | ✅ | ✅ |
| Encounter — attending | ✅ | ⚠ no ATND type | ⚠ no ATND type | ❌ | ⚠ no ATND type | ⚠ no ATND type |
| Encounter — location | ✅ | ❌ blank | ❌ blank | ❌ | ❌ blank | ❌ blank |
| Weight (29463-7) | ✅ | ❌ missing | ❌ missing | ❌ missing | ❌ missing | ❌ missing |
| BMI (39156-5) | ✅ | ❌ missing | ❌ missing | ✅ | ✅ | ❌ missing |
| Coverage | ✅ | ⚠ no payor ref | ⚠ no payor ref | ⚠ no payor ref | ⚠ no payor ref | ⚠ no payor ref |

---

## Severity legend

| Symbol | Meaning |
|---|---|
| ✅ | Present and correctly coded |
| ⚠ | Present but incomplete / uncoded — renders degraded |
| ❌ | Entirely absent — renders blank/dash in the SmartApp |
| 🔴 | Critical gap — blocks a SmartApp feature entirely |

Individual patient detail files:
- `01-maria-redhawk.md` — reference baseline
- `02-dorothy-simmons.md`
- `03-james-wilson.md`
- `04-alex-kirby.md`
- `05-lisa-thompson.md`
- `06-robert-chen.md`
