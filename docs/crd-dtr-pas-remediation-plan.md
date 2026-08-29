# CRD → DTR → PAS remediation plan (CMS-0057-F)

**Status:** ready to run (not started). **Source of findings:** the adversarial review of the
`(reviewer)/prior-auth` scenario (13 findings, H1–H7 / M1–M4 / L1–L3). This plan resolves all of them,
sequenced by leverage and dependency, under the Agentic Build Framework.

## Goal

Turn the scenario from three disconnected mock universes into **one coherent patient's PA journey**
whose DTR evidence actually travels to a **conformant** PAS bundle — with real information routing,
honest status, and enforced workflow — without regressing the 212-green gate suite.

## Guardrails (apply to every workstream)

- **Hold code** — stage/deliver via the device bridge; nothing committed/pushed by the agent.
- **Mirror-gate everything gatable** — extract risky logic into pure, framework-free modules in
  `src/lib/**` and gate in `/root/xbuild` (tsc · vitest · prettier · eslint) before delivery. React
  shells stay thin; the user runs `npm run type-check && npm run build` for the shell/route layer.
- **No backward regression** — full suite stays green; size/testlink/wiring/provenance gates stay green
  (new pure modules ship WITH tests and a production caller, or they trip E13/E14).
- **Adversarial testing lenses** (v1.8 kit) on every new pure module: precision-not-recall,
  guards-fail-closed, order-independence, target-contract conformance (FHIR/X12), round-trip/encoding,
  no-silent-degradation, claims-enforced, degenerate-inputs.
- **Preserve the HITL / fail-closed contract** already in `ReviewSubmitView` + `pasService`
  (`approvedBy` signal, server-bound reviewer of record) — do not weaken it.

---

## Workstream A — PAS conformance + DTR→PAS routing  *(HIGH: H1, H2, H7, M2)*

The core fix: the DTR evidence must reach a conformant PAS bundle, and submit status must be truthful.

- [ ] **A1 · Extract a pure `pasBundle.ts` module** (`src/lib/pa/pasBundle.ts`) — move `buildPasBundle`
      out of `pasService.ts` into a pure, mirror-gated builder `buildPasRequestBundle(input)`.
- [ ] **A2 · Include the DTR `QuestionnaireResponse` (H1).** From `input.dtr`, emit a
      `QuestionnaireResponse` per procedure (answers = met criteria) and reference it from the Claim's
      `supportingInfo`. Attach each uploaded CDex `DocumentReference` (already built in
      `cdexDocumentReference.ts`) as `supportingInfo` too.
- [ ] **A3 · Conformant Claim + bundled resources (H2).** Add `insurance` (referencing a `Coverage`),
      and bundle the referenced `Patient`, `Coverage`, `Practitioner`/`PractitionerRole`,
      `Organization`, and `ServiceRequest` resources. Target the Da Vinci PAS request-bundle profile;
      validate cardinality/identity in tests (lens: target-contract conformance).
- [ ] **A4 · Derive insurer + Patient reference from the loaded patient (H2/H7).** Stop hardcoding
      `"South Dakota Medicaid"`; carry plan/coverage on `PatientBanner`/`PaOrder`. Use a real
      `Patient` resource id, not `memberId` (memberId → `Coverage.subscriberId` / Patient identifier).
- [ ] **A5 · Truthful submit status (M2).** `pasService` must distinguish accepted vs pended/202 vs
      error; `ReviewSubmitView` renders "Submitted / Pended / Failed" accordingly — no fake PA number
      on error, no green check on failure (lens: no-silent-degradation).
- [ ] **A6 · Wire it.** `/api/pas/submit` and `pasService` consume `buildPasRequestBundle`; add a
      round-trip test (build → parse → assert QuestionnaireResponse + DocumentReferences present).
- **Gatable:** A1–A4, A6 (pure builder + tests) in the mirror; A5 UI on the user's tsc/build.
- **DoD:** a submitted bundle contains the Claim + insurance + QuestionnaireResponse + every uploaded
      DocumentReference + referenced resources; tests assert it; no hardcoded insurer/patient-id.

## Workstream B — one patient, one source of truth  *(HIGH: H4, H5; LOW: L2)*

- [ ] **B1 · Unify the patient (H4).** Make the PA Portal cases derive from a shared patient/case model
      so the live flow's patient and the portal are the same universe. Either (a) drive the portal from
      submitted cases + a small seeded set that uses the SAME demo patients as the live flow, or (b)
      make the live demo patient one of the portal patients. Remove the Maria-vs-portal split.
- [ ] **B2 · Context-drive provider/facility/insurer (H5).** `orderingProvider`, `facility`, plan/
      insurer, and the CRD "enrolled/eligible" details must come from the loaded patient/coverage, not
      the Maria/SD constants in `OrderView.tsx:38-39` and `crdService.ts:42-54`.
- [ ] **B3 · Real DTR content for more than one case (H5).** Back the DTR by the policy engine (see
      Workstream D) so non-Maria patients get real criteria, not the 2-group stub.
- [ ] **B4 · Per-case portal data (L2).** Portal checklist/DTR rows should reflect each case, not the
      one shared canned block.
- **Gatable:** the patient/coverage/case model (pure types + mapping) in the mirror; the store/views on
      the user's tsc.
- **DoD:** running the flow as patient X and opening the portal shows patient X's case; no patient's
      screen shows another patient's provider, plan, or evidence.

## Workstream C — CRD fidelity  *(HIGH: H3; LOW: L3)*

- [ ] **C1 · Stop discarding the CDS response (H3).** In `crdService.runCrdChecks`, parse the real
      `/api/cds` CDS-Hooks cards into `CrdCheckResult`; fall back to mock ONLY on genuine failure (and
      say so). Extract the parse into a pure, tested `parseCrdCards()`.
- [ ] **C2 · Make CRD patient-aware (H3).** Pass patient/coverage context into CRD; only assert
      "Enrolled/Eligible" from an actual eligibility signal, never unconditionally.
- [ ] **C3 · Fix pass semantics (L3).** "Prior Authorization Required = YES" is a *determination*, not
      a passed check — render it as its own row (required/not-required), separate from pass/fail checks.
- **Gatable:** `parseCrdCards` + the CrdCheckResult mapping in the mirror.
- **DoD:** a real CDS card set flows through to the checklist; eligibility reflects real data or is
      labeled unverified; PA-required is not a green "pass."

## Workstream D — converge the DTR model  *(MED-HIGH: H6)*

- [ ] **D1 · One DTR representation.** The scenario's DTR (`dtrService` + `DtrTreeView`) and the policy
      engine's real DTR (Questionnaire generator, `QuestionnaireRenderer`, `$questionnaire-package`,
      `questionnairePackage.ts`/`cql.ts`/`coverageRule.ts`) must share one model. Drive the scenario's
      DTR from the authored policy so **the DTR you author in the Workbench is the DTR this scenario
      runs** (this also lands the "real Generate-route wiring" thread).
- [ ] **D2 · Map criteria-groups ↔ QuestionnaireResponse** so the DTR match view and the PAS
      QuestionnaireResponse (A2) are the same data in two renderings.
- **Depends on:** Workstream A (the QuestionnaireResponse shape) + the Generate-route wiring follow-up.
- **DoD:** authoring a policy in the Workbench changes what this scenario's DTR asks and what the PAS
      bundle carries; no second, canned DTR model.

## Workstream E — validity & workflow guards  *(MED: M1, M3, M4)*

- [ ] **E1 · Don't fabricate "Met" from any file (M1).** An upload marks a gap **"Attached — pending
      payer review,"** not "Met." Reserve "Met" for evidence that actually satisfies the coded
      requirement (or a reviewer attestation, captured + audited). Gate submit on "resolved" (met or
      attached-with-attestation), not on trivially-flippable met.
- [ ] **E2 · Gate Review's submit on DTR state (M3).** `ReviewSubmitView.handleSubmit` checks DTR
      resolution, not mere presence.
- [ ] **E3 · Enforce (or clearly signal) step order (M4).** Either sequence Order→CRD→DTR→Review, or
      keep free-nav but make each step's precondition explicit (the empty states already help).
- **Gatable:** the "resolved vs met" state logic as a pure predicate + tests (lens: guards-fail-closed).
- **DoD:** a random file cannot produce a "Met, ready to submit" PA; submit requires genuine resolution.

## Workstream F — honesty / polish  *(LOW: L1)*

- [ ] **F1 · De-overclaim copy** where the path is mocked ("real-time against the payer", "merged from
      EMR and Patient Access API") — or make it true once A/C land. Label demo/mock paths as such.

---

## Sequencing & dependencies

```
A (PAS + routing)  ─┬─►  D (DTR model convergence)  ──►  scenario is "real"
C (CRD fidelity)   ─┘
B (one patient)    ──────────────────────────────────►  demo is coherent
E (validity guards) — independent, can land anytime
F (copy)            — last, after A/C make claims true
```

Recommended order: **A → C → B → E → D → F.** A is the highest-leverage single fix (it also unblocks D
and overlaps the Generate-route wiring). B makes the demo credible. E is cheap and independent.

## How to run this later

1. Pick a workstream; for each gatable item, build the pure module in `/root/xbuild`, add lens-driven
   tests, and gate: `npx tsc --noEmit && npx vitest run && npx prettier --check && npx eslint`.
2. Deliver via the device bridge (SendUserFile + device_commit_files, mtime-guarded on edits).
3. After a batch, the user runs on their machine:
   `for c in type-check lint check:sizes check:framework test build; do echo "── $c ──"; npm run -s "$c" && echo "✅ $c" || echo "❌ $c"; done`
4. Keep the suite green; register any not-yet-wired module in the wiring baseline only as a temporary
   burn-down entry, and wire it for real in the same workstream.

## Traceability

| Finding | Workstream item |
|---|---|
| H1 DTR evidence not in PAS | A2 |
| H2 non-conformant bundle | A3, A4 |
| H3 CRD ignores response / patient-agnostic | C1, C2 |
| H4 two patient universes | B1 |
| H5 non-Maria breaks | B2, B3 |
| H6 two DTR models | D1, D2 |
| H7 memberId as Patient id | A4 |
| M1 any file → Met | E1 |
| M2 false submit success | A5 |
| M3 submit with unmet DTR | E2 |
| M4 free navigation | E3 |
| L1 overclaiming copy | F1 |
| L2 canned portal rows | B4 |
| L3 pass semantics | C3 |

---

# Addendum (expanded direction) — connected flow, publication topology, resilience

## Publication & runtime topology (the correction)

Policy processing is the single source that **publishes to BOTH CRD and DTR** — they are siblings, and
the CRD card *references* the DTR questionnaire. It is NOT "policy → DTR → CRD," and CRD is not
downstream of DTR.

```
Policy processing (Workbench, after sign-off)
   ├─► CRD coverage rule:      code → { PA required?, applicable-guideline refs, → Questionnaire canonical URL }
   └─► DTR Questionnaire pkg:   Questionnaire + ValueSets + CQL   ◄─ referenced BY the CRD card

Runtime:   CRD ("what's required?" + points to the questionnaire)
             → DTR (fetch that questionnaire, pre-fill from FHIR, clinician confirms gaps)
             → PAS (submit request / receive decision / record authorization)
```

**Current gap:** the workbench generates the DTR questionnaire (wired) and a CRD coverage rule
(`buildCoverageRules`) that is **orphaned/unpublished** (E14), while runtime CRD (`crdService`) is a
**hardcoded mock reading no published policy**. So there is no real policy→CRD publication — "PA
required" is canned. Fix = publish the coverage rule to the source CRD reads, card references the DTR
questionnaire, retire the crdService mock.

## Workstream G — one connected clinician flow (production-grade, not hollow)  *(new)*

Reframe the scenario as ONE connected journey with a persistent 3-stage progress strip:

```
CRD · DISCOVER            →   DTR · DOCUMENT                 →   PAS · TRANSACT
PA required                   9/10 answers retrieved              Request submitted
Clinical criteria apply       Evidence assembled                  Decision received
Documentation required        Clinician confirms 1 item           Authorization recorded
```

- [ ] **G1 · CRD as a real CDS card.** At order-sign, surface a card: "Prior authorization required" +
      documentation requirements + guidance + a **Complete Documentation** action — driven by the
      published coverage rule (not the mock).
- [ ] **G2 · "Complete Documentation" launches the DTR workflow** (SMART-app style), carrying order +
      patient + coverage context — a real handoff, not a nav click.
- [ ] **G3 · Persistent progress strip** (CRD→DTR→PAS with the sub-states above) visible across the
      whole flow, driven by real state (lifecycle status + DTR answer counts), not static labels.
- [ ] **G4 · Production polish.** Remove hollow actions; every button does a real thing or is not shown.
      Consistent layout, loading/empty/error states, accessible.

## Workstream H — resilience: queue · decision-clock timers · status · notifications  *(new)*

**Leverage existing code** — do NOT rebuild: `goldenThread/workQueue.ts` (`routeToQueue`, `WorkItem`,
`isSlaBreached`) and `graph/mapping/priorAuthLifecycle.ts` (dated status phases, as-of queries) already
provide the queue + SLA + lifecycle substrate. The PA scenario must wire to them instead of the ad-hoc
`usePaStore`.

- [ ] **H1 · Durable work queue.** PA submissions/polls become `WorkItem`s routed via `routeToQueue`;
      survive restart; ret/retry with backoff; dead-letter on repeated failure.
- [ ] **H2 · Decision-clock timers (CMS-0057-F).** Expedited **72 hours**, standard **7 calendar days**;
      compute due/at-risk/breached from `isSlaBreached` + the lifecycle; show a countdown per case.
- [ ] **H3 · Async status workflow.** PAS is request→pended→decision; poll/subscribe for the
      ClaimResponse (FHIR) / 278 response (EDI); drive status off `priorAuthLifecycle` phases, not a
      one-shot "Submitted ✓".
- [ ] **H4 · Notifications.** On decision, on additional-info (CDex task) request, and on clock
      approaching breach — to the reviewer/clinician queue.
- [ ] **H5 · Checkable state.** Every case's status, timer, and next action are queryable "as of now"
      from the lifecycle substrate (the existing as-of model), so a returning user/agent can resume.
- **DoD:** a submitted PA is a durable queued work item with a running decision clock, an async status
      that advances through real lifecycle phases, notifications on transitions, and no false "done."

## DTR as the populated SMART workflow  *(refines Workstream D)*

- [ ] **D3 · Pre-populate from FHIR.** The DTR questionnaire is auto-filled from FHIR-accessible EHR +
      Patient Access data (symptom duration, PT history, meds, neuro findings, prior imaging); the
      clinician **confirms or supplies only what's missing** — surfaced as "9/10 retrieved, confirm 1."
- [ ] **D4 · One questionnaire model** end to end: the package CRD references == what DTR renders ==
      what becomes the PAS `QuestionnaireResponse` (ties to A2).

## Sequencing note for the addendum

Publication topology + G1/G2 depend on Workstream A (real artifacts) and C (real CRD). H (resilience)
can proceed in parallel by wiring the existing substrate. D3/D4 depend on A. Recommended: land
**A → C → (publication topology) → G → H → D3/D4 → B/E/F polish**.

---

# Execution log + red-team (session of 2026-08-28)

The **membership→coverage** spine drove this pass: a patient *is a member of a plan (Coverage)*, and
CRD eligibility, the payer on the PAS Claim, and the Patient/Coverage the bundle references now all
derive from one seeded context — no `South Dakota Medicaid` / `MARIA_SD_001` constants in logic.

## New pure cores (mirror-gated in `/root/xbuild`; 43 PA tests, full suite 245 green)

| Module | Serves | What it does |
|---|---|---|
| `src/lib/pa/patientContext.ts` | B1/B2, H7, C2 | Typed `PatientContext` + seeded registry (Maria + the 4 portal patients); `patientId` ≠ `memberId`; eligibility is evidence, never assumed. |
| `src/lib/pa/publishedCoverage.ts` | publication topology | The demo's **published** coverage rules the runtime CRD reads (PA-required + DTR questionnaire canonical), not a mock; unknown code fails to PA-required/review. |
| `src/lib/pa/crdDerivation.ts` | C1/C2/C3/H3 | `deriveCrdResult(ctx, code, rule)` computes the checklist from coverage; PA-required is a **determination** row; `parseCrdCards` for real CDS cards. |
| `src/lib/pa/dtrQuestionnaireResponse.ts` | D2/A2 | `DtrMatchResult` → one FHIR `QuestionnaireResponse` model; met=TRUE, attached=Attachment (pending), gap=unanswered. |
| `src/lib/pa/pasBundle.ts` | A1–A4/A6, H1/H2/H7 | Conformant PAS request bundle: Claim + insurance→Coverage + bundled Patient/Coverage/Org/Practitioner/ServiceRequest + QR + DocumentReferences; supportingInfo references them. |
| `src/lib/pa/dtrReadiness.ts` | E1/E2/M1 | Upload = "attached — pending review", never Met; submit gated on required-group resolution. |
| `src/lib/pa/paDecisionClock.ts` | H2 | CMS-0057-F 72h/7d clock: on-track/at-risk/breached, as-of. |

## Shell wiring (delivered; scoped device `tsc` green over `src/lib/pa/**` + `src/components/pa/**`)

`crdService` (patient-aware), `pasService` (conformant bundle + truthful submitted/pended/failed),
`usePaStore` (upload→`pending`; patient key resolved to Patient id for the DocumentReference),
`OrderView` (patient+coverage from the registry), `CrdChecklistView` (PA-required as a determination
row), `DtrTreeView` (three-state met/attached/gap + readiness-gated Continue), `ReviewSubmitView`
(submit gated on DTR resolution + truthful status), plus de-overclaimed CRD/DTR copy (F1).

## Red-team sweep — findings & dispositions

- **RT-1 (fixed) — CRD guideline-conflict false positive.** `parseCrdCards` flagged a conflict from
  an informational "*no* conflicting guideline identified" card (it contains "conflicting"+"guideline")
  and had dead `|| true` code. Now: flag only a **warning/critical** card that asserts a conflict and
  is not negated. Regression tests added.
- **RT-2 (fixed) — non-conformant FHIR ids.** The bundle used `MARIA_SD_001` (underscore) directly as
  a resource id and could exceed 64 chars for long provider names. Now sanitized to `[A-Za-z0-9.-]`,
  capped, references round-trip to the bundled `Patient.id`, and the original key is preserved as a
  Patient identifier. Regression test added.
- **RT-3 (accepted, documented) — demo in-network signal.** `OrderView` passes
  `orderingProviderInNetwork: true` for every ordered provider. The derivation is honest (only claims
  in-network when signalled); the unconditional signal is a labeled demo seed.
- **RT-4 (accepted, minor) — Review "Part I" count** still counts the PA determination among the CRD
  checks (shows N-of-N including it). Cosmetic; the determination is rendered separately in the CRD view.

## Deferred (honest scope — NOT claimed done)

- **H (resilience) UI.** The decision clock + queue routing exist as tested pure modules and the
  existing `workQueue`/`priorAuthLifecycle` substrate is available, but a **countdown/timer, durable
  queue, async status polling, and notifications are not yet surfaced in the running UI.**
- **G3 progress strip** (CRD·DISCOVER → DTR·DOCUMENT → PAS·TRANSACT) — not built this pass.
- **D3 FHIR pre-population** ("9/10 retrieved, confirm 1") — DTR still uses the policy/mock match, not
  live FHIR prefill.
- **Real publication persistence.** Coverage rules are seeded as the "published" set; wiring
  authoring → a persisted rule store the CRD reads remains.
- **Verification boundary.** Pure cores are mirror-gated (tsc·vitest·prettier·eslint); the shell/route
  layer is scoped-`tsc` verified on-device. A full `npm run build` + boot smoke of the running PA
  screens is the user's remaining check.

