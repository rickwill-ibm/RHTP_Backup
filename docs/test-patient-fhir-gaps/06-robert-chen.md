# Robert Chen — FHIR Gap Analysis
**File:** `fhir/seed/patients/robert-chen.bundle.json`
**FHIR Patient.id:** `robert-chen`
**Registry platform ID:** `PAT-0103`
**Registry FHIR map expects:** `patient-robert-103`
**Store:** ❌ NOT loaded in mock store — live FHIR mode only

---

## 🔴 Critical issue — FHIR ID mismatch
The registry maps `PAT-0103 → patient-robert-103` but the bundle's `Patient.id`
is `robert-chen`. HAPI returns 404 and the SmartApp falls back to Maria.
**Fix required:** rename `Patient.id` to `patient-robert-103` or update registry.

---

## Demographics
| Field | Value | Gap vs Maria |
|---|---|---|
| DOB | 1964-11-03 | ✅ |
| Gender | male | ✅ |
| MRN | `MRN-0103` (tcoc mrn system) | ✅ |
| Address city/state | Rapid City, SD | ✅ |
| Address postal code | ❌ MISSING | ⚠ |
| Address street line | ❌ MISSING | ⚠ |
| Telecom | ❌ not present | ❌ gap |
| Emergency contact | ❌ not present | ❌ gap |
| Race/Ethnicity ext | ❌ not present | ❌ gap |
| Marital status | ❌ not present | ❌ gap |
| Language/communication | ✅ present | ✅ |

---

## Resource gaps vs Maria

### 🔴 Entirely absent
| Missing resource | SmartApp impact |
|---|---|
| AllergyIntolerance | Banner "No Known Allergies" — CKD patient on 3 meds |
| Immunization | Immunizations chart page empty |
| FamilyMemberHistory | Histories tab empty |
| DiagnosticReport | Results tab limited |
| DocumentReference | Documentation tab empty |
| Procedure | No procedure history |

---

### ⚠ Present but incomplete

#### Encounter (1)
- ✅ 1 routine check-up present
- ❌ `encounter.location` not present — banner "Loc: —"
- ❌ `encounter.participant` has no ATND type code — banner "Attending: —"
- ❌ No `encounter.reasonCode`
- ❌ No encounters for alcohol use disorder management

#### Observations (10)
Labs/vitals present:
- ✅ Blood pressure (85354-9) — renders in banner
- ✅ eGFR (33914-3) — essential for CKD patient
- ✅ AUDIT-C survey score — appropriate for alcohol use disorder
- ✅ SDOH: Housing · Food · Transportation · Financial strain

Missing vs clinical complexity:
- ❌ **No body weight (29463-7)** — banner weight blank
- ❌ **No HbA1c** — hypertension + CKD warrants metabolic screening
- ❌ **No creatinine raw value** (only eGFR calculated)
- ❌ **No urine albumin/creatinine ratio** (UACR — standard CKD monitoring)
- ❌ **No lipid panel** (statin patient — no LDL to monitor therapy)
- ❌ No BMI
- ❌ No PHQ-9 (alcohol use disorder patient should have depression screening)
- ❌ 3 malformed Observations with no LOINC code or date — will not render
- ❌ Only single readings — no trend time series

#### Conditions (4)
✅ I10 HTN · N18.32 CKD 3b · F10.10 Alcohol use disorder mild · Z59.86 Financial insecurity
- ❌ No dyslipidemia/hypercholesterolemia (statin patient on atorvastatin)
- ❌ No encounter-diagnosis entry

#### Medications (3)
✅ Amlodipine · Losartan · Atorvastatin — active with dosage
- ❌ No RxNorm coding (text-only)
- ❌ No alcohol use disorder treatment medication (naltrexone/acamprosate)

#### Consent (1) — unique to Robert
- ✅ Robert is the ONLY patient with a Consent resource
- ✅ Status: active — 42 CFR Part 2 relevant given F10.10 alcohol use disorder
- This is correct and important for the Part 2 segmentation test

#### ServiceRequests (3)
✅ Coded referrals present
- ❌ No nephrology referral (CKD 3b patient)
- ❌ No addiction medicine referral

#### Flags (2)
- ❌ Both use `system: "warning"` — not real code systems

#### Coverage (1)
- ❌ `payor` array empty — no payor reference

#### RiskAssessment (1)
- ✅ ER risk 52% with rationale text
- ❌ `method` coding empty

#### MeasureReport (2)
- ✅ HCC135 Substance Use Disorder (V28) · HCC329 CKD Stage 3 (V28)
- Both well-structured with proper CMS-HCC codes
- ❌ Both use same model version (V28) — no V24 comparison

---

## Notable: Robert is the Part 2 test patient
Robert has `F10.10` (Alcohol Use Disorder) + an active `Consent` resource.
The ingest pipeline's 42 CFR Part 2 segmentation logic paths through this patient.
His bundle needs to be robust enough to test the Part 2 consent-filtered display
in the SmartApp — which means the Consent resource must be correctly structured
with Part 2-relevant scope.

---

## Gap priority for SmartApp testing
| Priority | Gap | Fix |
|---|---|---|
| 🔴 P0 | FHIR Patient.id mismatch | Rename id to `patient-robert-103` |
| 🔴 P1 | No AllergyIntolerance | Add drug allergy (ACE/ARB patient with CKD) |
| 🔴 P1 | No UACR observation (CKD monitoring) | Add 9318-7 lab Observation |
| 🔴 P1 | No body weight (29463-7) | Add vital-signs Observation |
| 🔴 P1 | 3 malformed Observations | Fix LOINC codes and dates |
| 🟡 P2 | No LDL (statin patient) | Add 13457-7 lab Observation |
| 🟡 P2 | No PHQ-9 (alcohol use disorder + depression risk) | Add 44249-1 survey Observation |
| 🟡 P2 | Missing dyslipidemia Condition | Add E78.5 Hyperlipidemia condition |
| 🟡 P2 | Medication RxNorm coding missing | Add coding arrays |
| 🟡 P2 | Coverage payor empty | Add Organization reference |
| 🟡 P2 | No nephrology ServiceRequest | Add referral for CKD 3b |
| 🟢 P3 | Single encounter | Add 1–2 historical encounters |
| 🟢 P3 | No Immunizations | Add flu/pneumonia/hepatitis B records |
| 🟢 P3 | No DiagnosticReport | Add renal function panel report |
