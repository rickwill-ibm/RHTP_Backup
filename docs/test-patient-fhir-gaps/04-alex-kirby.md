# Alex Kirby — FHIR Gap Analysis
**File:** `fhir/seed/patients/alex-kirby.bundle.json`
**FHIR Patient.id:** `alex-kirby`
**Registry platform ID:** N/A (not in PLATFORM_TO_FHIR_ID_MAP)
**Store:** ❌ NOT loaded in mock store — live FHIR mode only

---

## 🔴 Critical issues — two blockers

### 1. Not in the registry ID map
`alex-kirby` does not appear in `PLATFORM_TO_FHIR_ID_MAP` at all. The RHTP
patient switcher has no entry for Alex Kirby, so there is no way to navigate
to her record from the UI. She can only be reached by manually passing
`?patientId=alex-kirby` in the URL.

### 2. All 5 Conditions completely malformed
Every Condition resource has: no `code.coding` array, no `clinicalStatus.coding`
array, no `category`. The Problems/Diagnoses chart page will render blank rows.
The care-gap derivation engine (ProviderViewAct) will find no codable conditions.

### 3. No Encounter at all
Alex is the only patient with zero Encounter resources. The PatientBanner
encounter row shows all dashes. All encounter-dependent ChartPages
(Encounter History, Documentation) are empty.

---

## Demographics — best of all test patients
| Field | Value | Gap vs Maria |
|---|---|---|
| DOB | 1956-06-14 | ✅ |
| Gender | female | ✅ |
| MRN | `FJVV987654321` (urn:mrn) · NHS `943 476 5829` | ✅ (dual identifiers) |
| Address | 2847 Oak Avenue, Boston MA 02108 | ✅ full street address |
| Telecom | ✅ home + mobile phone | ✅ |
| Emergency contact | ✅ ×2 (daughter + husband) | ✅ (only patient with this) |
| Race/Ethnicity ext | ❌ not present | ❌ gap |
| Marital status | ❌ not present | ❌ gap |
| Language/communication | ❌ not present | ❌ gap |

---

## Resource gaps vs Maria

### 🔴 Entirely absent
| Missing resource | SmartApp impact |
|---|---|
| Encounter | PatientBanner encounter row all dashes; no encounter history |
| AllergyIntolerance | Banner "No Known Allergies" |
| MedicationRequest | Medications chart page completely empty |
| Immunization | Immunizations chart page empty |
| FamilyMemberHistory | Histories tab empty |
| DiagnosticReport | Results tab limited to Observation data only |
| DocumentReference | Documentation tab empty |
| Procedure | No procedure history |
| CarePlan | Care Plan tab empty |
| CareTeam | No care team assignment |
| Goal | No goals |

---

### ⚠ Present but incomplete

#### Observations (33 — most of any patient, but mixed quality)
✅ Well-coded (LOINC) vital-signs: BMI · BP panel · Waist-height ratio
✅ Well-coded labs: Triglycerides · ALT · UACR · HbA1c · Fasting glucose · LDL · HDL · Creatinine
✅ Survey: (coded) but missing PHQ-9 — only Social Risk Score and food/housing scores

**Critical coding problem — 19 social-history Observations:**
All 19 social-history and early survey Observations use **text-only codes with no
LOINC coding array**. The FHIR hooks filter by LOINC code — these observations
will not be found by `useVitals`, `useLabs`, or social-history search queries.
They carry rich lifestyle and living-situation narrative but are invisible to the app.

**4 early lab Observations (pre-March):** text-only codes, no LOINC
— Total Cholesterol · Triglycerides · Creatinine · TSH
These are duplicates of the March 15 coded observations but without LOINC codes.

**Missing vital-signs vs Maria:**
- ❌ No body weight (29463-7) — banner weight blank
- ❌ No heart rate (8867-4)
- ❌ No O2 saturation

#### Conditions (5 — all malformed)
- ❌ ALL 5 conditions have no `code.coding` — only `clinicalStatus.text: "active"`
- ❌ No `category` array on any condition
- These will not render in Problems tab or trigger any care gap derivation

#### Flags (1)
- ❌ Uses `code.text` only: `"Patient seen in ER (08/2025)"` — no LOINC/SNOMED code
- Text is clinically useful but will not trigger coded alert logic

#### ServiceRequests (2)
✅ Both coded with SNOMED: specialist referral + lab procedure
- ❌ Subject references use `urn:uuid` (not `Patient/alex-kirby`) — may not resolve correctly

#### Tasks (6 — most of any patient)
- ❌ All 6 Tasks have empty `focus` — no linked ServiceRequest or other focal resource
- ❌ Subject references use `urn:uuid` — may not resolve

#### Coverage (1)
- ❌ `payor` array empty
- ❌ No payor name or Organization reference

#### MeasureReport (1)
- ✅ HCC38 Diabetes — correctly coded
- ❌ Subject reference uses `urn:uuid` — may not bind correctly to Patient.id

---

## Gap priority for SmartApp testing
| Priority | Gap | Fix |
|---|---|---|
| 🔴 P0 | Not in PLATFORM_TO_FHIR_ID_MAP | Add `PAT-ALEX` → `alex-kirby` entry |
| 🔴 P0 | All 5 Conditions malformed (no coding) | Add proper ICD-10/SNOMED coding arrays |
| 🔴 P0 | No Encounter | Add at least 1 current encounter |
| 🔴 P1 | No MedicationRequest | Add 2–3 active medications |
| 🔴 P1 | No AllergyIntolerance | Add allergy resources |
| 🔴 P1 | 19 social-history Obs text-only (no LOINC) | Add LOINC coding to each |
| 🟡 P2 | Tasks have no focus reference | Link tasks to ServiceRequests |
| 🟡 P2 | Coverage payor empty | Add Organization reference |
| 🟡 P2 | `urn:uuid` subject references | Replace with `Patient/alex-kirby` |
| 🟡 P2 | No CarePlan / CareTeam / Goal | Add these resources |
| 🟢 P3 | No Immunizations | Add flu/COVID records |
| 🟢 P3 | No DiagnosticReport | Add 1 lab report |
