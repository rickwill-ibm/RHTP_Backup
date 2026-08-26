# Plan: Patient Record Visibility + Test Data Seeding

**Status:** Plan — not yet implemented
**Companion to:** `DTR_Logic_Tree_Patient_Match_Plan.md` (implemented)
**Scope:** Two features requested during live testing of the two-column DTR screen —
(1) a way to see a patient's full chart, not just the resources a policy happened to
match on, and (2) a way to add test data to a seeded patient without hand-writing FHIR JSON.

---

## 0. Also fixed while grounding this plan

Not part of this plan, fixed directly since it was a two-line, unambiguous bug: the
"Run Through Intelligent Policy Engine" button stayed disabled after choosing a file
because `handleFileChange` in `PolicyIngestView.tsx` never populated the required
Policy ID field — the file name and the ID field were two independent, disconnected
pieces of state. It now derives a slug from the filename (e.g. `CG-SURG-83 Bariatric
Surgery.pdf` → `cg-surg-83-bariatric-surgery`) and fills the ID field only if you
haven't already typed one.

---

## 1. Where patient data actually comes from (correcting a premise)

You asked whether patient history is "part of CDS Hooks" — worth being precise about
this since it shapes the design. It isn't. Three different things are true today:

- **CDS Hooks** (`services/cds-hooks-server`) is the *trigger* protocol: when an order
  is placed, the EHR fires a `hook` request, and the CRD service responds with
  coverage-requirement cards. It doesn't carry clinical history — it just tells the
  provider "you need a prior auth for this, here's what to do about it."
- **DTR** (`fhir-evaluator.mjs`) queries the EMR and payer FHIR servers directly —
  `GET /fhir/{ResourceType}?patient=X&code=A,B` — one narrow, code-filtered query per
  policy criterion group. It only ever sees the specific resources a policy's rules
  ask for. That's why gaps show "no matching resource" even when the patient's chart
  has relevant data the policy's rule just didn't happen to query for.
- **Nothing in the app today does an unfiltered "show me everything for this
  patient"** query. `FhirClient.search()` already supports this — the mock server's
  `GET /fhir/:resourceType` route only *requires* a `patient` param, `code` is
  optional — but nothing calls it that way. This is the gap Ask #2 is about.

## 2. Ask #2 — Patient Record view

### 2.1 Tab vs. drawer — recommendation

A full numbered workflow step (like the existing Order → CRD → DTR → Review → Portal
sequence) is the wrong shape for this: those steps are a linear pipeline you move
through once per submission, and "look something up" isn't a pipeline stage — you'd
want to check the chart *while* looking at a DTR gap, then come right back, possibly
several times. Recommendation: a **side drawer**, not a new numbered nav step.

- A "View Patient Record" button in the DTR screen header (and the Order screen
  header, where the patient banner already renders) opens a right-side drawer over
  the current screen.
- The drawer stays independent of `usePaStore`'s `view` state — opening it doesn't
  navigate away from DTR, so a reviewer can cross-reference a gap group against the
  full chart without losing their place or triggering another CRD/DTR fetch cycle.
- Each DTR group gets a lightweight per-group affordance too: gap groups already
  render candidate codes; add "→ check chart for related history" that opens the
  drawer pre-filtered to that resource type (e.g. jump straight to Conditions if the
  gap is a comorbidity requirement).

If you'd rather have a real tab (e.g. because a drawer feels cramped for a long
problem list), the fallback is a `"chart"` entry in `AppView` + `NAV_STEPS`, unnumbered
(rendered as a separate, unlabeled-step nav button, the way "Ingest Policy" /
"Review Policy Logic" / "Audit Log" already sit outside the 1–5 submission sequence).
Flagging this as the one open decision in this plan — happy to build either; drawer
is my default unless you'd rather have the tab.

### 2.2 Data model

New `src/lib/fhir/patientRecord.ts`:

```typescript
export interface PatientRecordSection {
  resourceType: string;         // "Condition" | "Observation" | "Procedure" | ...
  label: string;                // "Conditions" | "Observations" | ...
  resources: PatientRecordItem[];
}

export interface PatientRecordItem {
  id: string;
  code?: string;
  display: string;              // human label, e.g. "Morbid (severe) obesity due to excess calories"
  date: string | null;          // effectiveDateTime ?? recordedDate ?? onsetDateTime ?? period.start
  status?: string;
  performerName?: string | null;
  source: "emr" | "pa";
}

export async function fetchPatientRecord(
  ctx: SmartContext,
  patientId: string
): Promise<PatientRecordSection[]>
```

`fetchPatientRecord` runs one unfiltered `FhirClient.search(resourceType, {patient})`
per resource type against EMR, and the same against payer for `Coverage` (and as a
fallback for any resource type that comes back empty from EMR — same EMR-then-payer
fallback pattern `fhir-evaluator.mjs` already uses for DTR matching, reused here for
consistency rather than reinvented). Resource types covered in Phase 1, chosen to
match what the seed generator (`generate-patient.mjs`) and the real Rachel Green
bundle actually populate: `Condition`, `Observation`, `Procedure`, `Encounter`,
`Coverage`. `MedicationRequest` and `DiagnosticReport` are a Phase 2 addition (see
§4) since no current seed data populates them yet — adding the query now would just
render permanently-empty sections.

Sorting reuses the existing `mostRecentFirst()` pattern (already in
`fhir-client.mjs` on the backend; a small client-side equivalent gets added to
`patientRecord.ts` since this is a frontend-only fetch, no policy-engine round trip
needed — it's a direct FHIR read, same as `patientLookup.ts` today).

### 2.3 UI — `PatientRecordDrawer.tsx`

Slide-over panel, grouped by section (Conditions / Observations / Procedures /
Encounters / Coverage), each item showing code + label + date + performer, same
visual language as the DTR "Patient Record Match" column (reusing the `EvidenceBlock`
formatting helpers already built for that, so a condition looks the same whether
you're seeing it because a policy matched it or because you opened the full chart).
A source badge (EMR / Patient Access) on each item, same as DTR evidence today.

Loading state: fetch on drawer open (not on every DTR page load) — this is
look-up-on-demand data, not part of the CRD/DTR pipeline, so it shouldn't add a
network round trip to the main flow.

## 3. Ask #3 — Seeding additional test data into an existing patient

`generate-patient.mjs` already solves "scaffold a *brand-new* synthetic patient."
Nothing today solves "add one more Condition/Observation to the *existing* Rachel
Green record so I can verify a DTR comorbidity group flips from gap to met." That's
the actual gap — confirmed by testing it live during DTR verification: the mock FHIR
server's `POST /fhir` transaction-Bundle endpoint already accepts new entries against
an existing patient with no restart required (this is exactly how the payer-fallback
bug fix was verified last session), there's just no reusable, patient-aware tool for
it — I had to hand-write a one-off Bundle inline.

### 3.1 New script: `infra/seed/add-resource.mjs`

```
node add-resource.mjs --patient patient-rachel-green --target emr \
  --resource-type Condition \
  --code I27.20 --code-system icd-10-cm \
  --text "Pulmonary hypertension, unspecified" \
  [--effective-date 2026-06-01] [--performer practitioner-aagaard]

node add-resource.mjs --patient patient-rachel-green --target payer \
  --resource-type Observation --loinc 39156-5 \
  --value 37.1 --unit "kg/m2" [--effective-date 2026-01-15]
```

Two responsibilities, both needed — one without the other isn't enough for real
regression testing:

1. **POST immediately** to the already-running mock server (`--target emr` →
   `EMR_FHIR_BASE`, `--target payer` → `PAYER_FHIR_BASE`), so you see the DTR result
   change right away without restarting anything — matching the fast-iteration loop
   you were already using manually.
2. **Append the same entry to the checked-in `<slug>-emr.bundle.json` /
   `<slug>-payer.bundle.json` file**, so the addition survives a restart and becomes
   part of the permanent fixture instead of evaporating the next time
   `mock-fhir-server` restarts (it's in-memory only, by design — see the file's own
   header comment).

Resource-type templates (`Condition`, `Observation`, `Procedure` to start — matching
what DTR/CRD actually evaluate today) live in the script, keyed by `--resource-type`,
producing FHIR shapes consistent with what `generate-patient.mjs` already emits
(same `subject`/`clinicalStatus`/`category` conventions) so nothing added this way
looks structurally different from the original seed data.

### 3.2 Why not a UI panel for this

Considered a small "Add test resource" form in the app (gated behind a dev-only
flag) alongside the existing seed-ingest UI. Recommending the CLI script instead for
Phase 1: this is a testing/QA tool, not something a clinical reviewer ever touches,
and a script is scriptable (batch-add ten regression fixtures in one shell loop,
check the diff into git, rerun in CI later). A UI panel is Phase 2 if this turns out
to get used often enough that typing flags becomes friction — flagging it here so
it's not forgotten, not because it's clearly needed now.

## 4. Phasing

**Phase 1 (this plan's scope):**
- `patientRecord.ts` + `PatientRecordDrawer.tsx`, EMR-then-payer fallback, 5 resource
  types (Condition/Observation/Procedure/Encounter/Coverage)
- "View Patient Record" entry points from DTR header + Order header
- `add-resource.mjs` supporting Condition/Observation/Procedure, dual-write
  (live POST + bundle-file append)

**Phase 2 (deferred until Phase 1 is in use):**
- MedicationRequest / DiagnosticReport sections (once seed data actually has them)
- Per-DTR-gap-group deep link into the drawer, pre-filtered to the relevant resource
  type
- Dev-only "Add test resource" UI panel, if the CLI script proves to be friction in
  practice
- Numbered-tab variant of the Patient Record view, if the drawer turns out to feel
  too cramped for patients with long problem lists

## 5. Verification plan

- `add-resource.mjs`: add a synthetic comorbidity Condition to Rachel Green, confirm
  Group 3/4 flips from gap → met on the next `/evaluate` call, confirm the bundle
  file diff shows the new entry, confirm it survives a mock-fhir-server restart +
  re-seed.
- `fetchPatientRecord`: confirm it surfaces resources DTR itself doesn't query for
  (e.g. an unrelated Condition with no matching policy criterion) — the whole point
  is seeing more than DTR's narrow, code-filtered queries show.
- Drawer: open from both DTR and Order screens, confirm it doesn't disturb
  `usePaStore` view/navigation state or trigger a duplicate CRD/DTR fetch.

## 6. Open questions

1. Drawer vs. numbered tab for the Patient Record view (§2.1) — my default is
   drawer; say the word if you'd rather have the tab.
2. Any resource types beyond the five in §2.2 you specifically want visible in
   Phase 1 (e.g. Immunization, AllergyIntolerance)? Scoped to what current seed data
   populates by default — easy to add more sections, just want to avoid empty
   placeholder sections.
