# Patient seed bundles (FHIR R4 transaction Bundles) — v2, whole-person

Complete, loadable **FHIR R4 (4.0.1) `transaction` Bundles** for the demo/mock patients.
v2 closes the SDOH + behavioral-health completeness gap: every patient now carries
social-needs screening, closed-loop CBO referrals, and scored BH instruments — not just
clinical data.

## Conformance target (matches what the platform supports)

Base **FHIR R4 4.0.1, structurally valid**. The platform's own validator is a _structural
pre-flight_ that enforces **no named US Core profile** (`enforcedProfiles` is empty, no
US Core `supportedProfile` is claimed), so these bundles are deliberately **not stamped
with US Core `meta.profile`** — they must not claim conformance the platform does not assert.
Coding uses the app's own vocabulary: ICD-10-CM (incl. SDOH **Z-codes**), LOINC
(AHC-HRSN/PRAPARE screening + PHQ-9 44249-1 / AUDIT-C 75626-2), the Gravity **SDOHCC**
pattern (screening Observation → Z-code Condition → `ServiceRequest` → `Task` to a CBO
Organization), 42 CFR Part 2 `Consent`, and RxNorm-by-text for medications.

## What's here

| Bundle                        | Patient         | Entries | Whole-person content                                                                                                                                                                                                                                                                  |
| ----------------------------- | --------------- | ------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dorothy-simmons.bundle.json` | Dorothy Simmons |      52 | 7 clinical + 1 SDOH Z-code condition, 6 meds, labs (A1C 9.2/BNP 842/eGFR 38/EF 35), PHQ-9 14 + AUDIT-C 2, transport CBO referral (Unite Us TU-48821) + BH referral (Cascade Valley), 4 SDOH screens, Encounter, CarePlan, **2 RA coding gaps (V28+V24 diabetes — model coexistence)** |
| `james-wilson.bundle.json`    | James Wilson    |      44 | CHF+T2DM+HTN+depression + transport Z-code, overdue labs as ServiceRequests, PHQ-9 8 + AUDIT-C 3, rural transit CBO referral, 4 SDOH screens, **2 RA coding gaps (HF pending, diabetes net-new)**                                                                                     |
| `robert-chen.bundle.json`     | Robert Chen     |      40 | HTN+CKD 3b+**AUD**; BP 158/96, eGFR 42; AUDIT-C 4; financial Z-code + med-cost CBO referral; **42 CFR Part 2 Consent**; 4 SDOH screens, **2 RA coding gaps (SUD suspected → Part 2-restricted; CKD historic)**                                                                        |
| `lisa-thompson.bundle.json`   | Lisa Thompson   |      37 | Severe asthma+obesity (BMI 38); PHQ-9 6 + AUDIT-C 1; SNAP-Ed nutrition CBO referral; spirometry order; 4 SDOH screens, **1 RA coding gap (COPD suspected)**                                                                                                                           |
| `alex-kirby.bundle.json`      | Alex Kirby      |      52 | Rich state-export history: 33 Observations (incl. 15 SDOH/lifestyle screens), 5 Conditions, 6 Tasks (SDoH + BH screening), ServiceRequests + Coverage/Org, **1 RA coding gap (suspected, no evidence → cannot close)**                                                                |

Each is `Bundle.type = transaction`: every entry has a `urn:uuid` `fullUrl` + `request.method = POST`,
so intra-bundle references resolve on load and the server assigns real ids.

## SDOH / BH modeling (the Gravity closed-loop)

- **Screening** — `Observation` (category `social-history`, AHC-HRSN LOINC: housing 71802-3,
  food 88122-7, transportation 93030-5, financial 76513-1) carrying the registry's screening result.
- **Documented need** — `Condition` with an ICD-10-CM **Z-code** (Z59.82 transportation,
  Z59.86 financial) + SDOHCC category, only where the registry shows an actual barrier.
- **Closed loop** — `ServiceRequest` (referral) → `Task` (owner = CBO `Organization`,
  `businessStatus`, `focus` → the ServiceRequest) — the tracked hand-off to the community org.
- **Behavioral health** — `Observation` (category `survey`) for PHQ-9 / AUDIT-C with the
  registry's scores; depression / AUD as `Condition`; a BH-referral `Task` where referred.
- **42 CFR Part 2** — a privacy `Consent` (policy → 42 CFR Part 2, security label `42CFRPart2`)
  for SUD patients (Robert).
- **Risk Adjustment coding gaps** — Da Vinci-RA (`hl7.org/fhir/us/davinci-ra`) Coding Gap
  `MeasureReport`s (one condition-category group each): HCC code + evidence status
  (open/closed/pending) + suspect type (historic/suspected/net-new) + hierarchical status,
  citing supporting evidence by `evaluatedResource` + `ra-groupReference`. These are
  **authored** (pre-computed as a payer RA engine emits them) — the platform is a consumer,
  never a gap-measurement engine. A SUD-linked HCC (Robert HCC135) carries 42 CFR Part 2
  restriction; Dorothy carries both a V28 and a V24 gap (model coexistence). Projected to
  `CodingGap` nodes; a `suspected` gap never mints a `Condition` (coding-intensity firewall).

## Provenance (no fabricated clinical facts)

Derived from `fhir/fhir-state.json` (real per-patient resources carried over, references
rewritten to the transaction patient, danglers dropped) and the authored detail in
`src/lib/patientRegistry.data{1,2,3}.ts` (conditions with ICD-10, meds, labs with values,
SDOH screening results, PHQ-9/AUDIT-C scores, care-plan goals). Overdue items are
`ServiceRequest` (ordered), never Observations with invented results.

## Regenerate / validate / load

```bash
node tools/seed/gen-patient-bundles.mjs                     # regenerate
python3 tools/seed/validate-bundles.py fhir/seed/patients   # R4 models + ref integrity (needs fhir.resources)
npm run backbone:up
FHIR_BASE=http://localhost:8090/fhir node tools/seed/load-all-patients.mjs   # load into HAPI R4
```

Validated: **5 bundles · 225 resources · 0 issues**, every `urn:uuid` reference resolves.
(217 clinical/SDOH/BH/payer resources + 8 Da Vinci-RA Coding Gap MeasureReports.)
