# Lisa Thompson — FHIR Gap Analysis
**File:** `fhir/seed/patients/lisa-thompson.bundle.json`
**FHIR Patient.id:** `lisa-thompson`
**Registry platform ID:** `PAT-0156`
**Registry FHIR map expects:** `patient-lisa-156`
**Store:** ❌ NOT loaded in mock store — live FHIR mode only

---

## 🔴 Critical issue — FHIR ID mismatch
The registry maps `PAT-0156 → patient-lisa-156` but the bundle's `Patient.id`
is `lisa-thompson`. HAPI returns 404 and the SmartApp falls back to Maria.
**Fix required:** rename `Patient.id` to `patient-lisa-156` or update registry.

---

## Demographics
| Field | Value | Gap vs Maria |
|---|---|---|
| DOB | 1985-05-19 (age 40) | ✅ |
| Gender | female | ✅ |
| MRN | `MRN-0156` (tcoc mrn system) | ✅ |
| Address city/state | Sioux Falls, SD | ✅ |
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
| AllergyIntolerance | Banner "No Known Allergies" |
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
- ❌ No acute asthma encounter (asthma patient)

#### Observations (11)
Labs/vitals present:
- ✅ BMI (39156-5) — renders in banner BMI field
- ✅ PHQ-9 · AUDIT-C survey scores
- ✅ SDOH: Housing · Food · Transportation · Financial strain

Missing vs clinical complexity:
- ❌ **No blood pressure observation** — no BP data for a patient on asthma meds
- ❌ **No spirometry/PEF/FEV1** — no respiratory function data for an asthma patient
- ❌ No body weight (29463-7) — banner weight field blank
- ❌ No heart rate · No O2 saturation (critical for asthma)
- ❌ No peak flow history
- ❌ 4 malformed Observations with no LOINC code or date — will not render
- ❌ No lab time series — only single readings

#### Conditions (2 — fewest of any patient)
- ✅ J45.50 Severe persistent asthma · E66.9 Obesity — both coded, active
- ❌ No SDOH Z-code condition (SDOH observations present but not reflected as conditions)
- ❌ No encounter-diagnosis entry
- ❌ Only 2 conditions for an asthma + obesity patient — no comorbidities

#### Medications (3)
✅ Fluticasone · Albuterol · Montelukast — active with dosage
- ❌ No RxNorm coding (text-only display names)
- ❌ Missing inhaler device type (essential for asthma management context)

#### ServiceRequests (3)
✅ Coded referrals present (lab procedure + SDOH referral)
- ❌ No pulmonology referral for severe persistent asthma

#### Flags (2)
- ❌ Both use `system: "information"` — not a real code system

#### Coverage (1)
- ❌ `payor` array empty

#### RiskAssessment (1)
- ✅ ER risk 31% — lower than others, appropriate for younger patient
- ❌ `method` coding empty

#### MeasureReport (1)
- ✅ HCC277 COPD — correctly coded
- ⚠ Patient has asthma (J45.50), not COPD — HCC277 is for COPD. This is a
  **clinical coding mismatch** — asthma maps to HCC277 in CMS-HCC V28 only if
  it is COPD-equivalent severity. Needs review.

---

## Gap priority for SmartApp testing
| Priority | Gap | Fix |
|---|---|---|
| 🔴 P0 | FHIR Patient.id mismatch | Rename id to `patient-lisa-156` |
| 🔴 P1 | No AllergyIntolerance | Add drug allergy (common in asthma patients) |
| 🔴 P1 | No O2 sat or peak flow observations | Add vital-signs Observations |
| 🔴 P1 | No body weight (29463-7) | Add vital-signs Observation |
| 🔴 P1 | 4 malformed Observations | Fix LOINC codes and dates |
| 🟡 P2 | HCC277 COPD code for asthma patient | Review clinical accuracy |
| 🟡 P2 | Medication RxNorm coding missing | Add coding arrays |
| 🟡 P2 | Coverage payor empty | Add Organization reference |
| 🟡 P2 | No DiagnosticReport (spirometry report) | Add 1 DiagnosticReport |
| 🟡 P2 | No pulmonology ServiceRequest | Add referral |
| 🟢 P3 | Only 2 conditions | Add 1–2 comorbidity conditions |
| 🟢 P3 | No Immunizations | Add flu/pneumonia records |
