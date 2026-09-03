# Maria Redhawk — FHIR Baseline (Reference Patient)
**File:** `fhir/seed/maria-redhawk.bundle.json`
**FHIR Patient.id:** `patient-maria-001`
**Registry platform ID:** `MARIA_SD_001`
**Store:** ✅ Loaded into mock store (`src/lib/fhir/store.ts`) — works in both mock and live mode

---

## Demographics
| Field | Value |
|---|---|
| DOB | 1975-03-14 |
| Gender | female |
| MRN identifier | `urn:rhtp:mrn = SD-448291` |
| Address | Mission, SD 57555 |
| Telecom | ❌ not present |
| Emergency contact | ❌ not present |
| Race/Ethnicity extensions | ❌ not present |
| Marital status | ❌ not present |
| Language/communication | ✅ present |

---

## Resource inventory

### Encounters (4)
| Type | Status | Date |
|---|---|---|
| Office visit, established patient | in-progress | 2026-07-19 (today's visit) |
| ED visit | finished | 2026-03-29 |
| Outpatient visit | finished | 2026-02-14 |
| Outpatient visit | finished | 2025-12-10 |

**Encounter completeness:** ✅ `participant` with ATND type present · ✅ `location` present on today's visit

---

### Conditions (7)
| Code | Description | Category | Status |
|---|---|---|---|
| E11.65 | T2DM with hyperglycemia | problem-list-item | active |
| N18.32 | CKD stage 3b | problem-list-item | active |
| I50.32 | CHF diastolic | problem-list-item | active |
| I10 | Hypertension | problem-list-item | active |
| Z59.0 | Homelessness (SDOH) | problem-list-item | active |
| Z59.4 | Food insecurity (SDOH) | problem-list-item | active |
| E11.65 | T2DM (encounter diagnosis) | encounter-diagnosis | active |

All conditions have: ✅ LOINC/SNOMED coding · ✅ `clinicalStatus` · ✅ `category`

---

### Observations (15)
| LOINC | Description | Category | Date |
|---|---|---|---|
| 4548-4 | HbA1c | laboratory | 2025-02 · 2025-08 · 2026-02 (3 series) |
| 62238-1 | eGFR (CKD-EPI) | laboratory | 2025-12 · 2026-03 (2 series) |
| 2823-3 | Potassium | laboratory | 2026-04 |
| 13457-7 | LDL cholesterol | laboratory | 2026-02 |
| 30934-4 | BNP | laboratory | 2026-03 |
| 85354-9 | Blood pressure panel | vital-signs | 2026-04 · 2026-07 (2 series) |
| 8867-4 | Heart rate | vital-signs | 2026-07 |
| 59408-5 | O2 sat | vital-signs | 2026-07 |
| 29463-7 | Body weight | vital-signs | 2026-07 |
| 39156-5 | BMI | vital-signs | 2026-07 |
| 88122-7 | Food insecurity (SDOH) | social-history | 2026-01 |

**Missing labs vs clinical complexity:** ❌ No CBC · ❌ No HbA1c trend beyond Feb 2026 · ❌ No creatinine raw value (only eGFR)

---

### Medications (5 — all active)
- lisinopril 10mg · metformin 500mg · atorvastatin 40mg · furosemide 20mg · potassium chloride 20mEq
- ✅ All have `medicationCodeableConcept` with RxNorm coding · ✅ dosageInstruction present

---

### AllergyIntolerance (2)
- Penicillin · Seafood
- ✅ Coded via SNOMED · ✅ Renders in PatientBanner allergy strip

---

### Immunizations (3)
- Flu 2025 · COVID-19 2024 · PPSV23 2024
- ✅ All coded · ✅ Dates present

---

### Flag (1)
- ✅ Coded with SNOMED system — renders in PatientBanner as clickable alert chip

---

### Coverage (1)
- `coverage-maria-medicaid` · ✅ payor reference present · ✅ Coverage type coded

---

### Other resources
| Type | Present | Notes |
|---|---|---|
| Practitioner | ✅ ×4 | Named practitioners for encounter participants |
| CareTeam | ✅ | |
| CarePlan | ✅ | |
| Goal | ✅ ×2 | A1C goal · BP goal |
| ServiceRequest | ✅ | Nephrology referral |
| DiagnosticReport | ✅ | Echo report |
| DocumentReference | ✅ | ED summary |
| FamilyMemberHistory | ✅ | Mother's history |
| Procedure | ✅ | Echocardiogram |
| RiskAssessment | ❌ | Not present |
| MeasureReport | ❌ | Not present (HCC coding gaps) |
| Task | ❌ | Not present |
| Consent | ❌ | Not present |

---

## What Maria has that no other patient has

- **4 encounters** (rich encounter history for ChartPages/Histories tab)
- **AllergyIntolerance** (all others blank — banner shows "No Known Allergies")
- **3 Immunizations** (all others missing — Immunizations chart page empty)
- **FamilyMemberHistory** (all others missing — Histories tab empty)
- **DiagnosticReport** (all others missing — Results tab limited)
- **DocumentReference** (all others missing — Documentation tab empty)
- **Procedure** (all others missing)
- **4 Practitioners** named vs 1 for others (attending shows in banner)
- **Encounter.location** present (all others blank)
- **Body weight observation** (all others missing — banner weight field blank)
- **Multi-point lab time series** (HbA1c ×3, eGFR ×2, BP ×2) enabling trend charts
