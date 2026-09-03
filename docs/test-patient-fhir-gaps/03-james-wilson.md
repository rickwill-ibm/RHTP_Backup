# James Wilson — FHIR Gap Analysis
**File:** `fhir/seed/patients/james-wilson.bundle.json`
**FHIR Patient.id:** `james-wilson`
**Registry platform ID:** `PAT-0087`
**Registry FHIR map expects:** `patient-james-087`
**Store:** ❌ NOT loaded in mock store — live FHIR mode only

---

## 🔴 Critical issue — FHIR ID mismatch
The registry maps `PAT-0087 → patient-james-087` but the bundle's `Patient.id`
is `james-wilson`. HAPI will return 404 and the SmartApp falls back to Maria.
**Fix required:** rename `Patient.id` in bundle to `patient-james-087` or update registry.

---

## Demographics
| Field | Value | Gap vs Maria |
|---|---|---|
| DOB | 1968-07-14 | ✅ |
| Gender | male | ✅ |
| MRN | `MRN-0087` (tcoc mrn system) | ✅ |
| Address city/state | Winner, SD | ✅ |
| Address postal code | ❌ MISSING | ⚠ partial |
| Address street line | ❌ MISSING | ⚠ partial |
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
| AllergyIntolerance | Banner shows "No Known Allergies" — clinically unsafe for CHF patient on 5 meds |
| Immunization | Immunizations chart page empty |
| FamilyMemberHistory | Histories tab empty |
| DiagnosticReport | Results tab empty — no echo, no lab reports |
| DocumentReference | Documentation tab empty |
| Procedure | No procedure history |

---

### ⚠ Present but incomplete

#### Encounter (1)
- Only 1 routine check-up encounter
- ❌ `encounter.reasonCode` empty
- ❌ `encounter.location` not present — banner "Loc: —"
- ❌ `encounter.participant` has no ATND type code — banner "Attending: —"
- ❌ No encounters reflecting CHF or acute exacerbation history

#### Observations (10)
Labs present: ✅ HbA1c · PHQ-9 · AUDIT-C
SDOH present: ✅ Housing · Food · Transportation · Financial strain
Missing vs clinical complexity:
- ❌ No blood pressure (hypertension + CHF patient — critical gap)
- ❌ No BNP (CHF patient — critical gap; Maria has it)
- ❌ No eGFR (relevant for ACE inhibitor safety)
- ❌ No body weight (29463-7) — banner weight blank
- ❌ No BMI — banner BMI blank
- ❌ No heart rate · No O2 sat
- ❌ No LDL (statin patient)
- ❌ 4 malformed Observations with no LOINC code or date — will not render
- ❌ Only single readings — no trend time series

#### Medications (5)
✅ metformin · carvedilol · lisinopril · furosemide · atorvastatin — all active with dosage
- ❌ No RxNorm coding — text-only display names (same issue as Dorothy)

#### Conditions (5)
✅ I50.32 CHF · E11.9 T2DM · I10 HTN · F32.0 MDD · Z59.82 Transportation SDOH
- ❌ Missing statin indication condition (dyslipidemia)
- ❌ No encounter-diagnosis entry for today's visit

#### ServiceRequests (5)
✅ Richest of all patients — 5 referrals present
- ❌ `ServiceRequest.category` uses `108252007` (lab procedure) and `3457005` (referral) but not all are coded

#### Flags (2)
- ❌ Both use `system: "warning"` — not a real code system (same issue as Dorothy)

#### Coverage (1)
- ❌ `payor` array empty — no payor reference
- ❌ Coverage type `MC` (Medicare) but no payor Organization linked

#### RiskAssessment (1)
- ❌ `method` coding empty
- ✅ Prediction probability 0.67 (67% ER risk) with rationale text

#### MeasureReport (2 — both V28)
- ✅ HCC226 Heart Failure · HCC38 Diabetes — well-structured
- ❌ Both use the same model version (V28); Maria pattern would include both V24 and V28

---

## Gap priority for SmartApp testing
| Priority | Gap | Fix |
|---|---|---|
| 🔴 P0 | FHIR Patient.id mismatch | Rename id to `patient-james-087` |
| 🔴 P1 | No AllergyIntolerance | Add 2–3 allergy resources |
| 🔴 P1 | No BNP observation (CHF patient) | Add 30934-4 lab Observation |
| 🔴 P1 | No blood pressure observation | Add 85354-9 vital-signs Observation |
| 🔴 P1 | No body weight (29463-7) | Add vital-signs Observation |
| 🔴 P1 | 4 malformed Observations | Fix LOINC codes and dates |
| 🟡 P2 | Medication RxNorm coding missing | Add coding arrays |
| 🟡 P2 | Flag code systems invalid | Replace with SNOMED |
| 🟡 P2 | Coverage payor empty | Add Organization reference |
| 🟡 P2 | No DiagnosticReport / DocumentReference | Add 1 of each |
| 🟢 P3 | Single encounter only | Add 1–2 historical encounters |
| 🟢 P3 | No Immunizations | Add flu/pneumonia records |
