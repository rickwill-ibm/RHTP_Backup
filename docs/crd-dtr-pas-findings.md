# CRD → DTR → PAS scenario — adversarial review (CMS-0057-F)

Reviewed the running flow at `src/app/(reviewer)/prior-auth/page.tsx` and its views/services. The
flow **does** connect end to end (Order → CRD → Checklist → DTR → Review → Submit → Portal), so it's
not broken mechanically. The problems are in **fidelity, information routing, and validity** — the
flow is three disconnected mock universes stitched together, and the one piece of information that
must travel to the payer (the DTR evidence) never does.

Root diagnosis: there are **three unrelated patient identities** in one flow —
1. **Live flow** (`OrderView.tsx:15-20,38-39`): Maria Redhawk · Pine Ridge FQHC · Dr. Whitfield · South Dakota Medicaid.
2. **CRD mock** (`crdService.ts:42-54`): "South Dakota DHSS / Dr. Whitfield FQHC" — hardcoded regardless of patient.
3. **PA Portal** (`usePaStore.ts:95-201`): Priya Natarajan, Marcus Bell, Wanda Brooks, Thomas Okafor — four strangers the live flow can never produce.

---

## HIGH — routing / processing / validity

**H1 · DTR evidence never reaches PAS (the core routing break).**
`pasService.buildPasBundle` (`pasService.ts:87-125`) receives `input.dtr` but **drops it**. The bundle
is a bare `Claim` — no `QuestionnaireResponse`, no `supportingInfo`, no CDex `DocumentReference`
attachments. Everything the reviewer gathered in DTR (met criteria, uploaded docs) is discarded, so
the payer receives a PA request with **no clinical documentation attached**. This is the whole point
of DTR→PAS, and it's severed.

**H2 · PAS bundle is non-conformant to Da Vinci PAS.**
Same function: the Claim has **no `insurance` element** (required for `Claim/$submit`), **no `Coverage`,
`Patient`, `Practitioner`, or `ServiceRequest`** resources bundled (PAS request bundles must include
the referenced resources), the `insurer` is **hardcoded `"South Dakota Medicaid"`** (`:112`) for every
patient, and `patient.reference` is `Patient/${memberId}` (`:110`) — a **member/subscriber ID used as a
FHIR Patient resource id**. A real payer endpoint would reject this bundle.

**H3 · CRD ignores its own response and is patient-agnostic.**
`crdService.runCrdChecks` (`crdService.ts:8-33`) POSTs a valid CDS-Hooks `order-sign` request, then
**always `return getMockCrdResult(cptCode)`** (`:32`) — the real response is never parsed. The mock
takes **only the CPT**, no patient/coverage context, yet asserts "Patient Enrolled / Eligible" as
passed (`:39-49`) and hardcodes "South Dakota DHSS" + "Dr. Whitfield FQHC" (`:42,54`). Every patient,
every code → identical "all pass, PA required = YES."

**H4 · Two disconnected patient universes.**
The live workflow (Maria) and the PA Portal cases (Priya/Marcus/Wanda/Thomas, `usePaStore.ts:95-201`)
never intersect. `activeCaseId` defaults to `'AUTH-88213'` (Priya, `:281`). Running the live flow as
Maria and submitting drops a Maria case into a portal of four unrelated strangers. For a demo of "one
patient's PA journey," the journey and the portal are about different people.

---

## MED-HIGH — patient context / validity

**H5 · Any non-Maria patient breaks the scenario.**
`OrderView` (`:42-71`) hardcodes Maria when `activePatientId==='MARIA_SD_001'`, else FHIR-loads the
patient — but `orderingProvider`/`facility` stay hardcoded to Whitfield/Pine Ridge (`:38-39`), CRD copy
stays South Dakota (H3), and DTR content only exists for Maria/`72148` — every other patient+code
falls to a generic 2-group stub (`dtrService.ts:112-136`). So a "real" patient shows another patient's
provider, plan, and a hollow DTR.

**H6 · The scenario's DTR is not an actual DTR Questionnaire.**
`DtrTreeView` renders a canned "requirement-group match" (`dtrService.ts` mock), while the loading
copy claims "Fetching Questionnaire Package(s)" (`DtrTreeView.tsx:40`). The real DTR machinery — the
Questionnaire generator, `QuestionnaireRenderer`, `$questionnaire-package`, the Policy Engine — is a
**separate, disconnected implementation**. There are two DTR representations that don't share a model,
so the DTR you *author* in the Policy Workbench is not the DTR this scenario *runs*.

**H7 · `memberId` conflated with FHIR Patient id throughout.**
`Patient/${memberId}` in the PAS bundle (`pasService.ts:110`); `patientId: s.patient?.memberId ?? 'unknown'`
stamped onto the CDex `DocumentReference` (`usePaStore.ts:245`) — a member ID (or literal `'unknown'`)
written where a Patient resource reference belongs.

---

## MED — validity / workflow

**M1 · Any uploaded file resolves a medical-necessity gap to "Met."**
`resolveDtrGap` (`usePaStore.ts:236-258`) flips a gap to `met` on any file, with **no validation** the
document supports the requirement. Since "Continue to Submit" gates on `allMet` (`DtrTreeView.tsx:114`),
uploading *any* file (even empty/irrelevant) unlocks submission of a met-looking PA.

**M2 · Submission shows success even when it failed.**
On BFF error or a 202 human-gate, `pasService` still returns a stub PA number (`pasService.ts:66-84`),
and `ReviewSubmitView` renders the green "Prior Authorization Submitted ✓" screen (`:241-268`). The UI
cannot distinguish an accepted submission from a failed/pended one.

**M3 · Review lets you submit with unmet DTR.**
`ReviewSubmitView.handleSubmit` (`:34-39`) only checks that `dtrResults` *exists*, not that gaps are
resolved — and free step-nav (below) bypasses the DTR screen's `allMet` gate.

**M4 · Free step navigation, no sequencing.**
The top nav (`page.tsx:74-95`) lets you jump to any step at will. Views degrade to empty states, which
mitigates it, but there is no enforced Order→CRD→DTR→Review progression.

---

## LOW — honesty / polish

- **L1 · Overclaiming copy while fully mocked**: "Run a real-time CRD check against the payer"
  (`OrderView.tsx:184`), "evidence merged from EMR and Payer Patient Access API" (`DtrTreeView.tsx:82`).
- **L2 · Portal cases share one canned checklist**: all four cases have identical Enrolled/Eligible/
  In-Network/PA-Required rows (`usePaStore.ts:105-110,132-137,157-162,184-189`).
- **L3 · `pass: true` on "Prior Authorization Required = YES"** (`crdService.ts:63-69`) — the pass/fail
  semantic is muddy for a "required" signal (a needed PA isn't a "passed check").

---

## Recommended fix order

1. **H1 + H2** — make PAS real: include the DTR `QuestionnaireResponse` + CDex `DocumentReference`s and
   the referenced Patient/Coverage/Practitioner/ServiceRequest in the bundle; add `insurance`; derive
   `insurer` and the Patient reference from the loaded patient, not constants. (This is also the "real
   Generate-route wiring" thread — the same coverageRule/cql/QuestionnaireResponse plumbing.)
2. **H4 + H5** — one patient source of truth: make the portal cases derive from (or at least be
   consistent with) the live patient, and drive provider/facility/insurer/plan from the loaded patient
   instead of Maria constants.
3. **H3** — parse the real CDS response (or, if staying mock, key the mock off the patient's coverage,
   not just the CPT, and stop asserting eligibility that was never checked).
4. **H6** — converge the scenario's DTR onto the real Questionnaire model so authored policy == run DTR.
5. **M1–M4** — validate uploads against the requirement (or label them "attached, pending payer review"
   rather than "Met"); surface true submit status; gate Review's submit on DTR state; enforce step order.
