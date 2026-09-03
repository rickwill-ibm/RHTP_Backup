# Dorothy Simmons — FHIR Gap Analysis
**File:** `fhir/seed/patients/dorothy-simmons.bundle.json`
**FHIR Patient.id:** `dorothy-simmons`
**Registry platform ID:** `PAT-0042`
**Registry FHIR map expects:** `patient-dorothy-042`
**Store:** ❌ NOT loaded in mock store — live FHIR mode only

---

## 🔴 Critical issue — FHIR ID mismatch
The registry maps `PAT-0042 → patient-dorothy-042` but the bundle's `Patient.id`
is `dorothy-simmons`. When `resolveIds()` requests `patient-dorothy-042` from HAPI,
it will return 404. The SmartApp will fall back to Maria's demo data.
**Fix required:** either rename `Patient.id` in the bundle to `patient-dorothy-042`
or update the registry `PLATFORM_TO_FHIR_ID_MAP`.

---

## Demographics
| Field | Value | Gap vs Maria |
|---|---|---|
| DOB | 1951-03-14 | ✅ |
| Gender | female | ✅ |
| MRN | `MRN-0042` (tcoc mrn system) | ✅ |
| Address city/state | Ozark, MO | ✅ |
| Address postal code | ❌ MISSING | ⚠ partial |
| Address street line | ❌ MISSING | ⚠ partial |
| Telecom | ✅ home phone present | ✅ |
| Emergency contact | ❌ not present | ❌ gap |
| Race/Ethnicity ext | ❌ not present | ❌ gap |
| Marital status | ❌ not present | ❌ gap |
| Language/communication | ✅ present | ✅ |

---

## Resource gaps vs Maria

### 🔴 Entirely absent
| Missing resource | SmartApp impact |
|---|---|
| AllergyIntolerance | Banner shows "No Known Allergies" — clinically misleading for a 74yo with 7 conditions |
| Immunization | Immunizations chart page empty |
| FamilyMemberHistory | Histories tab empty |
| DiagnosticReport | No lab reports or imaging reports in Results tab |
| DocumentReference | Documentation tab empty |
| Procedure | No procedure history |

---

### ⚠ Present but incomplete

#### Encounter (1 — only a routine check-up; Maria has 4)
- Only 1 encounter vs Maria's 4
- ❌ `encounter.reasonCode` empty — no presenting complaint
- ❌ `encounter.location` not present — banner "Loc: —"
- ❌ `encounter.participant` has no ATND type code — banner "Attending: —"
- ❌ No ED encounter despite high 84% ER risk score in RiskAssessment

#### Observations (14)
Labs present: ✅ HbA1c · BNP · eGFR · LVEF · PHQ-9 · AUDIT-C
SDOH present: ✅ Housing · Food · Transportation · Financial strain
Missing vs clinical complexity:
- ❌ No blood pressure observation (hypertension + CHF patient — critical gap)
- ❌ No body weight (29463-7) — banner weight field blank
- ❌ No BMI (39156-5) — banner BMI blank (obese patient)
- ❌ No heart rate · No O2 sat
- ❌ No LDL/cholesterol (statin patient)
- ❌ No potassium (furosemide patient)
- ❌ 4 Observations have no LOINC code or date — malformed, will not render in chart pages
- ❌ No multi-point time series (single readings only — no trend charts possible)

#### Medications (6)
✅ All present and active with dosageInstruction
- ❌ No RxNorm LOINC code on any medication — only display text "Furosemide" etc.
  (Maria uses `medicationCodeableConcept.coding[0]` with RxNorm system)

#### Flags (2)
- ❌ Both flags use `code.coding` with `system: "error"` / `system: "warning"` — not
  a real code system. PatientBanner renders the text but the resource is non-conformant.

#### Coverage (1)
- ❌ `payor` array is empty — no payor reference or display name
- ❌ `period` is empty — no coverage effective dates

#### RiskAssessment (1) — not used by SmartApp yet but present
- ❌ `method` coding empty — no scoring method identified

#### MeasureReport (2 — V24 and V28 HCC coding gaps)
✅ Both present and well-structured with HCC group codes
- ✅ HCC38 Diabetes (V28) · HCC19 Diabetes without complication (V24)

---

## Conditions (8 — most complete of all patients)
✅ All 8 conditions have coding, clinicalStatus, category, and onset dates
- I50.32 CHF · E11.65 T2DM · J44.1 COPD · I10 HTN · E66.01 Morbid obesity
- N18.3 CKD stage 3 · F32.1 MDD · Z59.82 Transportation insecurity (SDOH)

---

## Gap priority for SmartApp testing
| Priority | Gap | Fix |
|---|---|---|
| 🔴 P0 | FHIR Patient.id mismatch (`dorothy-simmons` ≠ `patient-dorothy-042`) | Rename id in bundle |
| 🔴 P1 | No AllergyIntolerance | Add 2–3 allergy resources |
| 🔴 P1 | No blood pressure observations | Add 85354-9 vital-signs Observation |
| 🔴 P1 | No body weight | Add 29463-7 vital-signs Observation |
| 🔴 P1 | 4 malformed Observations (no code, no date) | Fix or remove |
| 🟡 P2 | Medication coding (text only, no RxNorm) | Add `coding` arrays to MedicationRequest |
| 🟡 P2 | Flag code systems invalid | Replace with real SNOMED codes |
| 🟡 P2 | Coverage payor reference empty | Add Organization reference |
| 🟡 P2 | No DiagnosticReport / DocumentReference | Add 1 of each |
| 🟢 P3 | Single encounter (no history) | Add 1–2 prior encounter records |
| 🟢 P3 | No Immunizations | Add flu/pneumonia/COVID records |
