# Coalition Log

Append-only record of the architect + SWE + adversarial coalition run for each core-logic change,
per `docs/framework/coalition-protocol.md`. Enforced by `g_coalition` in `scripts/ci-gates.sh`:
a landing that touches a core-logic path with no new entry here FAILS the gate.

Newest first. One entry per qualifying change.

## 2026-08-30 — Review-screen UX redesign (layout · research drawer · submit affordance)

**Owner feedback (from live browser use):** the Policy Encoding Review screen had three connected problems
— (1) rows rendered the full CPT descriptor inline with the controls pinned right, so the PAGE scrolled
sideways and the code + controls couldn't be seen together; (2) no way to RESEARCH a code ("just listed with
a bunch of others"); (3) the Submit button looked stuck (disabled until a small checkbox below ~45 rows).
Plus a doubled-code display ("43644 — 43644 —").

**Coalition (UI-architect design → SWE build → adversarial red-team):**
- **Root-caused the horizontal scroll** to a missing `min-w-0` on the workbench's `1fr` grid column
  (`PolicyDtrWorkbench.tsx`): a grid item defaults to `min-width:auto` and won't shrink below its content,
  so a truncating descriptor forced the page wider. Added `min-w-0`; controls are now `shrink-0`; the AI row
  uses `flex-wrap` so on the narrowest widths controls wrap under the descriptor instead of overflowing.
- **Per-code research drawer** (`EncodingReviewCodeDrawer.tsx`, NEW): the descriptor is an accessible
  disclosure (`aria-expanded`/`aria-controls`, `role=region`) that opens the full descriptor, the byte-anchored
  source excerpt (provenance), the plain-English section-of-origin (WHY it defaulted to Covered·PA — payer-
  agnostic), system/code/confidence, and an "Explain <code> in the assistant" button that seeds the Encoding
  Assistant (unidirectional prop + nonce, latest-`ask` ref → no re-fire loop). Threaded `source` (from
  `review.provenance`) + `sourceSection` (from `GuidelineCode`) into the procedure `ReviewElement`
  (`fromPolicyReview.ts`, `encodingReview.ts`). The AI-decided row is extracted to `EncodingReviewAiRow.tsx`.
- **Sticky action bar**: the footer is now `sticky bottom-0` with the acknowledgement checkbox moved in beside
  the real blocker ("1 step left: …") and the submit button — always visible. The gate logic
  (`submitReadiness`/`canSubmit`/fail-closed disable) is UNCHANGED; only the affordance moved.
- **Doubled-code fix** + shared pure helpers (`reviewRowText.ts`, NEW: `codeDescriptor` prints the code once,
  `ORIGIN_TEXT`) — DRY across the AI row, drawer, and needs-review row.

**Red-team cleared:** disposition `<select>` moved verbatim (value/onChange/aria/classes identical) — CRD
wiring intact; submit gate behavior unchanged (drawer is read-only, can't satisfy it); overflow fix is at the
shared grid item (all breakpoints) with no `overflow-x-clip` band-aid; disclosure is a real `<button>`, never
a row wrapping the interactive controls (no nested-interactive a11y break); assistant-seed effect depends only
on the nonce with an `askRef`, so message updates can't re-enter it; every file < 400 (panel 304, row 232,
new files 124/86/20, workbench 388, assistant 291). Note: the src components use `jsx:preserve`, which the
vitest transform can't import, so the row LOGIC is unit-tested (`reviewRowText.test.ts`: dedup, origin, the
provenance+section data threading) and the two render shells are E13-baselined; render behavior is verified in
the browser. Full suite green (2153, 0 fail); tsc/lint/sizes/E13/E14 clean.

## 2026-08-30 — PAS authoring bridge (the third artifact: CRD → DTR → PAS)

**Gap (owner close-out map, Tier 3):** the engine authored CRD + DTR but had NO PAS output — the third leg
of the chain the owner named. Architect trace found a RUNTIME PAS builder already exists
(`src/lib/pa/pasBundle.ts`, driven by a live PatientContext, using a loose `Record<string,unknown>` shape);
the authoring side needs its own preview/assembly that SHARES the FHIR types, not a third parallel shape.

**Change (architect design → SWE build → adversarial red-team-in-design):**
- New shared FHIR types `src/lib/fhir/pasTypes.ts` (`FhirClaim`, `FhirOrganization`, supporting) re-exported
  from `types.ts` (the `dtrPackageTypes` precedent), so authoring + runtime PAS can converge on one shape.
- New `src/lib/policy/pas/{types,specimenResponse,pasRequest}.ts` — the pure, deterministic builder
  `buildPasRequest(input)` over a discriminated union: `mode:'response'` (a real completed
  QuestionnaireResponse + patientRef) or `mode:'specimen'` (authored items → a SPECIMEN response via the
  real `buildQuestionnaireResponse` with EMPTY answers, so nothing clinical is fabricated and
  `missingForSubmission` lists what a real 278 would need). Assembles a self-contained Claim
  (use=preauthorization) + Patient + Coverage + Organization + Practitioner + QuestionnaireResponse Bundle;
  only PRIOR-AUTH-REQUIRED codes become `Claim.item` (never request preauth for a not-covered code); the
  davinci-pas profile is stamped ONLY in response mode (a specimen is `synthesized`/`conformanceAsserted:false`).
- New `PasPreviewPanel.tsx` + a third "Prior auth" tab in `GenerateArtifactsStage` (CRD | DTR | PAS), with an
  honest "specimen preview — not a conformance-tested submission" banner and a collapsible FHIR JSON view.

**Scope boundary (stated honestly):** authoring PREVIEW/assembly only — NO live X12-278 EDI transmission to a
clearinghouse (needs infra the payer controls). Shares TYPES with the runtime submission builder, not its code path.

**Verification:** pure/deterministic (injected `now`, derived ids — byte-identical output test); no fabricated
clinical data (specimen answers all unset; specimen Patient carries a `urn:rhtp:pas:specimen` identifier, never
a member id); not-covered/investigational codes excluded from the Claim. Full suite green (2140, 0 fail);
tsc/lint/sizes/E13/E14 clean; all files < cap (pasRequest 130, PasPreviewPanel 128, types.ts 366). New tests
`pasRequest.test.ts` (builder + specimen + response + determinism).

## 2026-08-30 — Code-table (Requirements By Product) path CRD parity

**Gap (owner close-out map, Tier 2):** the code-table path (product → procedure → code, e.g. Horizon)
emitted NO CRD coverage rules — its Generate stage was empty of coverage, and it had no coverage
disposition, so it was second-class vs the criteria path. (The related "NMN → not-covered rule" item was
already satisfied for the criteria path by the section-disposition work.)

**Change:** new `crd/codeTableCoverage.ts` builds CRD coverage rules for a code-table policy — every
enumerated code IS, by the table's own construction, a prior-authorization-REQUIRED covered procedure, so
each becomes a `covered · PA` rule (deduped across products) with a `covered-pa` default disposition. Wired
into the `code-table` branch of `processPolicyDocument`, which now returns `coverageRules` +
`questionnaireCanonical` + `dispositions` just like the criteria branch — so the maker's overrides reach
the published CRD via the SAME `projectCoverageRules` path (no parallel pipeline). Payer-agnostic (keys off
table structure); pure/deterministic. Horizon now yields 15 covered·PA rules (was 0).

**Verification:** full suite green (2135, 0 fail); tsc/lint/sizes/E13/E14 clean; `codeTableCoverage.ts` 44
lines, `policyReview.ts` 282 (< cap). New test `codeTableCoverage.test.ts` (unit dedup + real-Horizon
end-to-end). Note: the per-code disposition-OVERRIDE control in the code-table review UI
(`CodeTableReviewStage`) is a smaller follow-on — the confidence-flag review already covers code
correctness, and `covered · PA` is the correct default for a PA-requirements table.

## 2026-08-30 — Discrete documentation items + recover the silently-dropped BMI-band threshold

**Defect (owner, from the live workbench):** (1) all documentation evidence drained into ONE catch-all
"Attach clinical documentation" upload — the low-value pattern DTR exists to replace; (2) architect trace
found the comorbidity band ("BMI ≥ 35 WITH a qualifying comorbidity") had its `kind` overwritten
measure→choice in `encodeNode`, SILENTLY DROPPING the BMI ≥ 35 threshold from both the questionnaire and
evaluation — so "BMI 36 + a comorbidity" could not be distinguished from "BMI 36 alone".

**Coalition (architect design → SWE build → adversarial pass, tree-of-thought at each fork):**
1. **Discrete documentation items (payer-agnostic).** New `encode/documentation.ts` classifies a RESIDUAL
   attestation leaf that asks for evidence of a completed activity (generic cues: documentation/evaluation/
   clearance/education/treatment plan/attestation/… + a documentation-heading context), strictly AFTER
   measure/choice classification so an eligibility threshold or enumeration is never softened. Such a
   criterion (`kind:'documentation'`, new) emits a discrete item set via `fhir.ts docItems`: an attestation
   boolean (which STILL gates — it stays a BoolExpr leaf), its OWN targeted attachment gated on the
   attestation, and an optional typed datum — a completion `date`, an evaluating-provider `string`, or a
   named-complication `open-choice` built from the criterion's own tokens (obstruction/stricture/GERD/other).
   The generic catch-all in `engineQuestionnaireItems.ts` is now appended ONLY as a fallback (no discrete
   attachment present), so a policy with documentation criteria no longer forces a manual-review PDF dump; a
   policy without them is unchanged. Elevance CG-SURG-83 now yields 8 discrete evidence attachments, catch-all
   suppressed.
2. **Recover the BMI-band threshold.** `encodeNode`'s choice branch, when the node ALSO carries a measure,
   now KEEPS the measure and attaches the enumeration as a distinct CHILD choice (`${id}.comorbidity`) instead
   of overwriting kind. `fhir.ts critItems` renders a measure node's children (so BMI ≥ 35 AND the comorbidity
   choice both surface — distinct linkIds), and `evaluate.ts evalCriterion` requires them together (three-
   valued AND: BMI 36 + comorbidity → met; BMI 36 alone / comorbidity unanswered → unknown; comorbidity
   answered none → not-met; BMI 34 → not-met). Elevance now surfaces BOTH BMI thresholds (was 1).

**Scope boundary (stated honestly):** the fuller "BMI≥40 OR (BMI≥35 AND comorbidity)" *pathway-level* OR
auto-adjudication (leaf-replacement `crit.logic` + `groupExpr` expansion) was DESIGNED but deferred — it
depends on fragile one-of-N heading detection and would broaden the evaluation blast radius across every
nested-parent policy; deferred to its own batch rather than destabilize the heavily-tested engine now. The
shipped fix recovers the dropped threshold as a real, evaluable item (the visible defect), which is the safe,
contained correction.

**Red-team / verification:** documentation classification runs only on the residual-attestation case
(threshold/enumeration never reclassified); attestation booleans remain gating leaves (made more evaluable,
never dropped); measure-with-children is a NEW eval case (no existing measure node has children), so no
existing policy's evaluation changes; distinct linkIds avoid FHIR collisions; payer-agnostic (generic cues +
structure only). Full suite green (2125 tests, 0 fail); tsc + lint clean; sizes/E13/E14/E11 green; encode.ts
342, fhir.ts 342, evaluate.ts 362 (< cap). New tests: `documentationItems`, `comorbidityBmiGate`.

## 2026-08-30 — Reconnect review decisions into the generated CRD + section-inferred coverage defaults

**Defect (owner, from the live workbench):** at the Generate stage every harvested code showed CRD
`pending-review`, no matter what the human decided. Root cause (architect trace): `engineCoverageRulesForReview`
built each `ProcedureRule` with the coverage code OMITTED (honest "don't fabricate covered"), so every code fell
to role `referenced` → `pending-review`; and the two-list review + sign-off collected decisions that NEVER
re-flowed into the rules `GenerateArtifactsStage` renders (`review.coverageRules`, frozen at ingest). The
review was cosmetic w.r.t. published output.

**Coalition (architect design → SWE build → adversarial red-team, tree-of-thought at each fork):**
1. **Section-inferred defaults (payer-agnostic).** Codes are now tagged at harvest with the STRUCTURE they came
   from — `criteria.ts`/`criteriaCodes.ts` set `GuidelineCode.sourceSection` (`coding-appendix` |
   `requirements-table` | `inline-prose`, stronger-signal-wins on dedupe). `review/codeDisposition.ts`
   (`defaultDispositions`) infers a DEFAULT coverage disposition from the section + the not-medically-necessary
   statements (reusing `codeRouting.excludingStatement` + `classifyBasis`, now exported): a code in the policy's
   own code table → `covered-pa`; named in an investigational/NMN statement → `investigational`/`not-covered`;
   a bare prose mention → `pending`. NEVER `covered-pa` without a code-table tag. Keys off structure, never a
   payer name.
2. **One shared disposition truth table.** `crd/coverageDisposition.ts` (NEW) maps a `CodeDisposition` onto (a)
   the engine's ProcedureRule input (`dispositionToInput` — the engine stays the single coverage brain), and (b)
   the client projection (`applyDisposition`, idempotent). `coverageInfoFor` MOVED here (verbatim) so ingest and
   the client cannot drift. `engineCoverageRulesForReview` now accepts `dispositions` and seeds them from the
   defaults at ingest (`policyReview.ts`), so the 27-code Elevance case now arrives `covered · PA` instead of 27
   uniform pending-review. A not-covered/investigational code no longer re-attaches the DTR canonical the engine
   withheld (`wantsPathway` fix).
3. **Human overrides reach Generate.** `EncodingReviewPanel` renders a per-code coverage-disposition select
   (both the needs-review and AI-decided lists); `PolicyDtrWorkbench` holds the `dispositions` map (seeded from
   `review.dispositions`) and projects `review.coverageRules` through `workbench/generateInputs.projectCoverageRules`
   at the Generate stage — so the published CRD reflects the maker's decisions, not the frozen snapshot. The
   assistant dock was extracted to `workbench/AssistantDock.tsx` to keep the workbench under the size cap.

**Red-team cleared:** double-application (applyDisposition idempotent — fixed-point test); payer-agnostic
(defaults key only on structural section + generic negation matcher; test asserts no `covered-pa` without a
table tag); tsc narrowing (coverageInfoFor moved verbatim; disposition switches exhaustive with `never`;
sourceSection/props additive-optional so all call sites compile); size caps (new logic in new files; workbench
391→377 via extraction, panel 326, both < 400); fail-closed sign-off gate untouched (dispositions change WHAT
generates, never WHETHER). Projecting with the defaults reproduces the ingest rules byte-for-byte (consistency
verified). Full suite green (2119 tests, 0 fail); tsc + lint clean; E13/E14/E11/sizes green. New tests:
`coverageDisposition`, `codeDisposition`, `generateInputs`.

---

## 2026-08-29 — CRD honest coverage (general): no fake "Covered" + coded coverage-info

**Scope (core-logic paths):** `src/lib/policy/encode/ir.ts` (`ProcedureRule.coverageCode` now OPTIONAL — omitted = undetermined), `src/lib/policy/crd/engineCoverageRules.ts` (drop fabricated pre-review `coverageCode:'covered'`; add `coverageInfoFor`), `src/lib/policy/crd/coverageRule.ts` (`CoverageRule.coverageInfo` field). UI: `src/components/policy/workbench/GenerateArtifactsStage.tsx` (render `referenced` honestly + coverage-info pills). Test: `engineCoverageRules.test.ts` (re-pinned to the honest behavior).

**Problem:** the CRD table labelled EVERY code green "Covered" — a fabricated pre-review default (`coverageCode:'covered'`) indistinguishable from a real determination. Asserting coverage the policy/coding-map has not made.

**Design (GENERAL — not per-policy):** coverage is UNDETERMINED pre-review, so the code carries no `coverageCode`; the engine yields an honest `referenced` role with PA-required, and a Da Vinci `coverage-information` coding of `pending-review` (never `covered`). Real determinations (covered / not-covered / investigational / conditional) map to their proper coverage-info codings. Applies to every policy in the corpus; Horizon shows honest "Referenced — pending review", a policy with real determinations shows them. INVARIANT: never fabricate `covered`.

**Adversarial:** making `coverageCode` optional is safe — every use is a `===`/`!==` compare (undefined-safe) and the only `switch` has a `default → referenced`; full suite confirms. Per the payer's steer, this is a corpus-general fix, not a Horizon curation — to be validated on a cleaner (non-OCR) corpus policy next.

**Result:** mirror gate green — 377 tests, prettier + size ratchet clean. Delivered to device.

---

## 2026-08-29 — Production increment: LOINC-coded DTR items end-to-end

**Scope (core-logic paths):** `src/lib/policy/encode/fhir.ts` (MEASURE_LOINC map + `FhirItem.code`; attach coding in `measureItem`/`measureItemsMulti`), `src/lib/policy/dtr/engineQuestionnaireItems.ts` (`fhirItemsToDefs` carries `code` + `answerOption` coding). Model: `src/lib/dtr/questionnaireResponse.ts` (`QuestionnaireItemDef.code` + `answerValueSet`; `QuestionnaireAnswerOption.coding`). UI: `src/components/dtr/QuestionnaireRenderer.tsx` (renders code + answerValueSet badges). Test: `tests/policy/measureCoding.test.ts`.

**Trigger:** core `src/lib/policy/encode/**` change adding terminology bindings to generated FHIR. Coalition required.

**Design (first production increment of the conformance work):** the engine's typed measures now carry their standard LOINC concept (BMI 39156-5, age 30525-0, systolic/diastolic BP, weight, height, HbA1c, glucose, eGFR, lipids, LVEF); the translation stops dropping `valueCoding.system`; the item model gained `code`/`answerValueSet`; the renderer shows the codes. INVARIANT: a field is coded only when a well-established LOINC concept exists — unmapped fields stay uncoded (never fabricated). Reuses the whole existing pipeline (engine → fhirItemsToDefs → renderer), no parallel generator.

**Adversarial:** LOINC map is a curated, well-known concept set (not runtime-invented). Choice `answerValueSet` binding + CRD `coverage-info` per code remain follow-ups; the OCR criteria-quality problem (run-on/duplicated criteria in the scanned bariatric doc) is a separate extraction concern not addressed here — coding a garbled criterion still leaves garbled text, so extraction cleanup is tracked as the next dependency.

**Result:** mirror gate green — 377 tests (374 + 3), prettier + size ratchet clean. Delivered to device. Proven target: `/policy-engine/conformance-demo` (the fully-conformant slice).

---

## 2026-08-29 — Da Vinci CONFORMANCE SLICE (CPT 43775): coded CRD + value-set-bound DTR

**Scope (core-logic paths):** `src/lib/policy/dtr/conformance/valueSets.ts` (new — curated FHIR terminology), `src/lib/policy/dtr/conformance/bariatricSlice.ts` (new — CRD coverage-info card + DTR R4 Questionnaire builder). UI: `src/app/(reviewer)/policy-engine/conformance-demo/page.tsx` (browser-testable demo route). Test: `tests/policy/bariatricConformanceSlice.test.ts`.

**Trigger:** new modules under `src/lib/policy/**` producing a coverage/medical-necessity artifact. Coalition required.

**Why:** the running engine produces prose, not coded FHIR — no `answerValueSet`, no ICD-10/LOINC/SNOMED/CPT `Coding`, no CRD `coverage-info`. User (correctly, per the Da Vinci CRD/DTR IG examples) required coded, value-set-bound artifacts. This is the agreed ONE-code vertical to prove the process before scaling.

**Design:** a payer authors the terminology (curated value sets: yes/no/unknown, obesity ICD-10/SNOMED, comorbidity, LOINC BMI, CPT) — the deterministic engine never fabricates codes. The builder binds to it: CRD card (cardType `coverage-info`, indicator `warning`, coded coverage classification, SMART link with `appContext.questionnaire`) and a DTR R4 Questionnaire (grouped, `item.code` LOINC/SNOMED, choices bound to `answerValueSet`, SDC `initialExpression` pre-population, `enableWhen` conditional). INVARIANTS: CRD link canonical === DTR Questionnaire.url; every coded concept carries a real system.

**Adversarial:** the codes are AUTHORED/curated, not extracted — honest (a payer maintains its coding map) and does not claim the extractor invented them. Slice is self-contained (not yet wired into the live GenerateArtifactsStage pipeline) — deliberately, so the target is proven and measurable before integration. Follow-up (the "enhance & complete" phase): extend the production models (`QuestionnaireItemDef`, `CoverageRule`) to carry these bindings, map all 21 codes + the full criteria set, wire the renderer.

**Result:** 374 tests (365 + 9 conformance assertions), prettier + size ratchet clean; demo route renders live at `/policy-engine/conformance-demo` (browser-verified: coverage-info card, answerValueSet, LOINC/ICD codings, enableWhen).

---

## 2026-08-29 — DTR questionnaire omits coverage EXCLUSIONS (no "check an exclusion" items)

**Scope (core-logic path):** `src/lib/policy/encode/fhir.ts` (`toQuestionnaire` — skip exclusion criteria when emitting Questionnaire items). Test: `tests/policy/questionnaireExclusions.test.ts`.

**Trigger:** core `src/lib/policy/encode/**` change touching a medical-necessity/coverage surface (what a DTR asks the provider to attest). Coalition required.

**Problem (found by investigation, tree-of-thought + adversarial):** the authoring Generate stage rendered exclusion/investigational statements ("…is considered investigational", "…does not meet …criteria for coverage") as attestation checkboxes. Root cause: criteria classification is heading-based (`extract/criteria.ts`), so inline exclusion sentences under a medically-necessary region leak into `cp.medicallyNecessary`; the engine then emits a Questionnaire item for every leaf criterion, exclusions included. A provider cannot meaningfully "check" an exclusion — it asserts the opposite of coverage.

**Design (leverage, not duplicate):** filter at the ONE questionnaire seam (`toQuestionnaire`) rather than re-classifying at extraction (which would ripple into evaluate/CRD/tests). Reuse the existing negation signals — `EncodedCriterion.negate`, `Measure.negatedLocally`, and `isNegationHeading` — broadened by a few exclusion phrases ("does not meet", "not eligible", "is/are excluded", "considered cosmetic"). INVARIANT: an exclusion criterion is never emitted as a Questionnaire item; it STAYS in the criteria registry so evaluation + CRD still see it — only the DTR questionnaire omits it.

**Adversarial:** false-positive risk on positively-phrased negation ("has not undergone prior surgery") — mitigated because the detectors are coverage-specific ("not medically necessary / investigational / does not meet criteria"), not general negation. Positive concurrent-procedure statements ("concurrent cholecystectomy is considered medically necessary") are NOT filtered — they are legitimately answerable DTR questions. Empty pathway (all-exclusion) degrades to population-only, no crash.

**Result:** mirror gate green — 365 tests (363 + 2 new), prettier clean, size ratchet ok (fhir.ts 247 lines). Delivered to device. Follow-ups (separate): value-set/coding binding on `QuestionnaireItemDef` (carry `valueCoding.system`, add `answerValueSet`); clinical grouping + EHR pre-population in the renderer; CRD|DTR tabs in `GenerateArtifactsStage`.

---

## 2026-08-29 — Encoding-review code ROUTING (honest per-code signal, no fabricated disposition)

**Scope (core-logic paths):** `src/lib/policy/review/codeRouting.ts` (new), `src/lib/policy/review/encodingReview.ts` (additive `routing?` field on `ReviewElementInput`), `src/lib/policy/review/fromPolicyReview.ts` (wire `routing` through the procedure elements + `CodingMapContribution`). UI consumer: `src/components/policy/EncodingReviewPanel.tsx` (grouping only).

**Trigger:** core `src/lib/policy/review/**` change + new module + a coverage/medical-necessity-adjacent surface (procedure-code disposition). Coalition mandatory.

**Problem:** the review screen showed every procedure code with the identical generic "Assign coverage role (covered / not-covered / investigational)" line — no signal. Root cause: `deterministicCodingMap` deliberately proposes no role (it "cannot invent coverage decisions"); the AI coding-map path is unconfigured in the demo.

**Architect design pass:** rather than propose a disposition, derive a *routing hint* — WHERE each code's evidence sits — from the one honest, provenance-anchored structural signal (`review.notMedicallyNecessary[]`). Codes named (word-boundary) in an exclusion/investigational statement route `excluded` with the statement as provenance + a `classifyBasis` basis; all others route `assign`. Additive model field; `deterministicCodingMap` left byte-identical (its defect pins stay green); UI groups the queue by routing so it isn't a wall of identical rows, stating the "assign role" instruction once per group.

**Adversarial BEFORE coding (payer-UM SME + encoding specialist — NO-GO on the first design, then revised):**
- The ORIGINAL proposal (auto-label each code "Covered · PA required" from code-in-guideline membership) was **NO-GO**: the extractor's `guidelineCodes` is a flat, context-free harvest, so "member of the covered set" does not exist as data; asserting coverage would be a fabricated determination, would anchor the maker (automation bias), and — by replacing the blocking `verify` flag — would let codes silently leave review via `bulkAcceptCleanExplicit` / the 60% `canSubmit`. "PA applies ⇐ policy has criteria" was also rejected (gold-carding, statutory carve-outs, site-of-service, benefit exclusion).
- Design revised to meet the adversarial's conditional-GO: routing NEVER sets `role`; every routed code `requiresAssignment: true` and keeps its blocking flag (cannot be bulk-accepted); fail-safe to `assign` on any missing/ambiguous signal; no PA assertion; `excluded` only from an explicit negation/exclusion statement, carrying that statement as provenance.

**Adversarial AFTER coding (INVARIANTs pinned as tests):** `tests/policy/codeRouting.test.ts` (8 tests) pins: excluded routing carries provenance + basis and never a `role`; word-boundary matching (43644 ≠ 436440/143644); a non-negation prose mention does NOT route excluded; benefit-exclusion vs investigational basis; empty inputs → `{}`; every routed code `requiresAssignment`. INVARIANT comments in `codeRouting.ts` mark the fail-safe and no-coverage-decision rules.

**Result:** mirror gate green — 363 tests pass (355 prior + 8 new), prettier + size ratchet clean, app compiles (`next dev`). Delivered to device.

**Honest limit:** for a policy whose codes are all in the coding list with no per-code exclusion statements, all codes route `assign` (one group) — differentiation appears only where the policy itself distinguishes codes. Richer per-code dispositions require the AI coding-map path (endpoint + key), which stays out of scope here. Full `PROMPT_MASTER_LOG.csv` provenance rows to be appended in the provenance close-out.

---

## 2026-08-28 — Clinical measure encoder: enterprise hardening

**Scope (core-logic paths):** `src/lib/policy/encode/{measure,measureScan,dimensions,dimensionResolve,encode,evaluate,fhir,time,ir,index}.ts`, `src/lib/policy/review/{fromPolicyReview,encodingReview}.ts`.

**Trigger:** core `src/lib/policy/**` change + new modules + new capability + touches fail-closed
defaults and a medical-necessity/eligibility decision. Coalition mandatory.

**Architect design pass:** field↔unit↔range dimension registry; clause-scoped field resolution
(field noun resolved at sentence scope, operator/value/unit in a tight local window); band-aware
parsing (ranges never shattered); fail-safe range gate (flag, never silent-drop); local polarity
detection; multi-measure per criterion wired through evaluate + FHIR + review.

**SWE implementation plan:** modular layout to keep every file ≤ 400 lines (`dimensions.ts`
registry split from `measure.ts`); back-compat shims (`parseScalarMeasure`/`encodeMeasure`) so the
existing suite stays green; explicit preserved-test list; per-defect regression pins.

**Adversarial BEFORE coding (two lenses — NO-GO):**
- Engineering/regression: silent range-drops flip eval outcomes; `measures[0]` reordering breaks the
  range tests; compound-BP regresses to scalar; threshold-variant attaches to the wrong field;
  half-wired multi-measure = false coverage. → design revised (bands-first, compound-BP preserved,
  flag-not-drop range gate, variant-by-field, multi-measure fully wired).
- Clinical/extraction: comma-clamped windows drop the modal "BMI, …, of at least 40 kg/m²"; the "or"
  clamp kills "40 or greater"; per-comparator scan shatters "35 to 39.9"; polarity inversion on
  "not medically necessary". → clause-scoped field resolution + postfix-atomic + bands-first + polarity flag.

**Adversarial AFTER coding (post-implementation — NO-GO, then fixed + pinned):**
- CRITICAL: `negatedLocally` was a dead flag → an exclusion evaluated as a positive eligibility gate
  (false approval). Fixed: encode raises a reviewFlag so it can never auto-approve. Pinned.
- HIGH: phantom same-field measure → duplicate FHIR linkId. Fixed: unit-owner precedence + same-field
  dedupe + index-based linkIds. Pinned.
- MEDIUM: compound BP bypassed the range gate. Fixed: routed through the gate. Pinned.
- LOW: word-numerals > twenty dropped silently. Fixed: extended + flag on unresolved. Pinned.

**Result:** mirror gate green — tsc clean, 355 tests, prettier + eslint clean. Delivered to device;
size ratchet passes. Tests: `tests/encode/measure.{registry,hardened,defects}.test.ts`,
`tests/policy/encodingReview.test.ts`.

**Note:** this entry is retroactive — the coalition was run before this protocol existed; logging it
here both records it and seeds the log the `g_coalition` gate now requires.

---

## Entry: DTR terminology-resolution layer — Phase 1 (inline/offline)

**Change class:** core `src/lib/policy/**` (additive). **Trigger:** user directive — DTR choice items must bind to authoritative FHIR ValueSets ("propose the concept; the terminology infra establishes the code/value-set binding"); build a resolution layer, general across the payer corpus (Horizon, Elevance/Anthem, Aetna, UHC, state Medicaid), not a per-policy lookup.

**Architect verdict:** Proceed — additive, low-to-medium risk. Four corrections folded in:
1. Engine value-set `concept` is SYNTHETIC (`"<id> options"`, encode.ts:150) → the registry resolves off item heading text + option displays, not `concept`, and returns `undefined` unless confident (fail to "unset" = the prior behaviour = safe no-op).
2. `codingMap.ts` lives at `src/lib/policy/review/` — provider/selector/config pattern mirrored (`select* + *ConfigFromEnv + NotConfiguredError`).
3. Carrier fields (`QuestionnaireItemDef.code/.answerValueSet`, `answerOption.coding`) already existed — nothing thrown away.
4. Only the hydrate pass may be async; the sync generators stay pure.

**Deviation from the literal plan (architect-flagged concern, risk-reducing):** resolver placed in the DTR adapter layer (`engineQuestionnaireItems.fhirItemsToDefs`) rather than `encode/choiceItem`, so the `encode/` engine (`fhir.ts`) is UNTOUCHED — avoids the `encode → dtr` import the architect flagged as an engine-cleanliness risk. Same user-visible result (renderer already shows the `answerValueSet` pill). Registry decoupled from `encode` via a plain `ConceptSignal` (text + option displays), so `terminology/**` imports no engine types.

**Files:** new — `src/lib/policy/dtr/terminology/{registry,expansion,vsac}.ts`, `tests/policy/terminologyGolden.test.ts`; edited — `src/lib/policy/dtr/conformance/valueSets.ts` (+`ALL_VALUE_SETS`/`VS_BY_URL` inline corpus), `src/lib/policy/dtr/engineQuestionnaireItems.ts` (resolve → `answerValueSet`; opt-in async `hydrateExpansions`).

**Invariants asserted (golden corpus, 18 tests):** unconfident/ambiguous → `undefined` (exactly-one-match rule; negative cases); CPT + `urn:rhtp:*` never leave the inline provider even when VSAC is "configured"; VSAC gated (`VsacNotConfiguredError`, no network offline); hydrate is fail-safe (never blanks options on miss/throw); sync generators stay non-Promise; NO payer-specific branch in `terminology/**` (keys on clinical concepts + code systems only).

**Gate (mirror, green):** vitest 395/395; tsc clean on all changed `.ts`; prettier clean; eslint clean (tests/policy). Sizes: all prod < 400, test < 500. Testlink: all three new modules imported by `terminologyGolden.test.ts` (real coverage incl. the VSAC gated-throw branch) — no testlink-baseline row needed; the VSAC network-success branch does not exist yet (Phase 2).

**Delivery:** written to working tree on `main` (uncommitted, staged for review). Device pre-commit (prettier + sizes + testlink) to confirm on commit.

---

## Entry: DTR terminology-resolution — Phase 3 (corpus expansion + generality proof); Phase 2 → roadmap

**Change class:** core `src/lib/policy/**` (additive). **Trigger:** user directive — complete Phase 3, prove generality across payers/domains; stay inline (record live VSAC as roadmap).

**What changed:**
- `valueSets.ts` corpus 3 → 6, spanning TWO payers and THREE clinical domains: added `VS_CARDIAC_ARRHYTHMIA` (ICD-10 I47/I48 + SNOMED) and `VS_ABLATION_CPT` (CPT 93650/93653/93654/93656) grounded in **Aetna CPB 0165 (Cardiac Catheter Ablation & Radioablation)** — a different payer and specialty from the Horizon bariatric seed — plus a cross-cutting `VS_TOBACCO_STATUS` (SNOMED status codes).
- `registry.ts` +2 conservative rules (arrhythmia, tobacco). The ablation **procedure** (CPT) set is deliberately rule-less — a procedure is a coverage code, not a DTR answer, and an "ablation" rule would collide with real arrhythmia headings ("catheter ablation for the following arrhythmias …"). It stays corpus-only (expandable + inline-routed).

**Generality proven (golden corpus now 25 tests):** the SAME engine + resolver bind a cardiac arrhythmia choice end-to-end with zero payer/domain-specific code (`engineQuestionnaireItems` on a clean cardiac policy shape → `answerValueSet = …/cardiac-arrhythmia`, and NOT a metabolic set); cardiac ↔ metabolic never cross-bind; the CPT-bearing cardiac set stays inline even with VSAC "configured"; corpus spans ICD-10 + SNOMED + CPT; exactly-one-match safety holds across all 5 rules (procedure-shaped options → unset). No Horizon or payer name anywhere in `terminology/**` or the engine.

**Gate (mirror, green):** vitest **402/402**; tsc clean on all changed `.ts`; prettier + eslint clean; sizes — valueSets 180, registry 137 (prod < 400), golden test 302 (< 500).

**Roadmap (deferred, not built):** **Phase 2 — live VSAC `$expand`.** Committed posture is INLINE-ONLY: the `vsac.ts` provider + `selectExpansionProvider` routing seam are in place but inert (throws `VsacNotConfiguredError`; never selected unless `VSAC_ENDPOINT` + `VSAC_API_KEY` are set). Activating it is a future item — wire the UMLS/VSAC `$expand`, keep CPT + `urn:rhtp:*` inline. No code change needed elsewhere to turn it on.

**Delivery:** written to working tree on `main` (uncommitted, staged for review).

---

## Entry: Choice-detection fix — one-of-N + open enumerations become bound value-set choices

**Change class:** core `src/lib/policy/encode/**` + terminology (additive/behavioral). **Trigger:** on the real Elevance CG-SURG-83 policy the workbench Generate step produced 23 items with `choices=0, bound=0` — every "one of the following …" list flattened into booleans with dangling "; or", and the terminology layer was starved (no choice items to bind).

**Root causes (found by reproducing the pipeline on the real fixture, not the screen):**
1. `detectChoiceMin` only matched "one or more of / at least one of / any of the following" — it MISSED "one of the following" (the most common payer phrasing) and open enumerations ("including but not limited to"). So B (5 procedures) and the comorbidity lists never became choices.
2. Once they were choices, the resolver still returned `undefined` on the comorbidity list: the diagnosis rule fired on `obes`+`morbid` where "morbid" came from "co-**morbid**", and the comorbidity rule looked for "comorbid" (closed) while Elevance writes "co-morbid" (hyphenated) → two rules matched → ambiguous → unbound.
3. Option labels bypassed `clean()`, so "; or" litter stayed on the answer options.

**Fixes:**
- `encode/valueset.ts` `detectChoiceMin`: recognize "one of the following"; check "all/each of the following" FIRST so an AND list is never mis-read as one-of-N.
- `encode/encode.ts`: build a choice for a FLAT option list that is a one-of-N OR an open enumeration (`isOpenSet`); a node whose options themselves have children RECURSES (nested content preserved → inner comorbidity choice forms instead of being dropped).
- `dtr/terminology/registry.ts`: diagnosis rule anchored on the PHRASE "morbid obes…" (never bare "morbid"); comorbidity rule matches "co-?morbid" (both spellings).
- `encode/fhir.ts` `choiceItem`: run option displays through `clean()` (trailing "; or"/"; and"/";"/":" trimmed) — display only; sourceText stays verbatim for provenance.

**Proof (Elevance CG-SURG-83, reproduced end-to-end):** items 23→16, `choices 0→3`, `bound 0→2` — the 5 procedures collapse into one choice; BOTH comorbidity lists resolve to `answerValueSet=obesity-comorbidity`; option labels de-littered.

**Gate (mirror, green):** vitest **404/404** (added 2 regression tests pinning "one of the following" → choice and hyphenated "co-morbid" → obesity-comorbidity); tsc/prettier/eslint clean; sizes valueset 64, encode 285, fhir 298, registry 141 (all < 400). No legacy-path regressions (`detectChoiceMin` is engine-only).

**Known residue (separate seam, extraction boundary — NOT this fix):** a couple of section headings still bleed into an item ("…Reoperation", "…* Revision/…") and one revision run-on remains; deferred to the extraction-quality seam.

**Delivery:** working tree on `main` (uncommitted, staged for review).

---

## Entry: Authoring workflow UX — sign-off gating + honest submit footer (browser-diagnosed end-to-end)

**Change class:** core `src/lib/policy/workflow/**` + `review/**` + two workbench components. **Trigger:** driving the authoring flow end-to-end in the browser on the Elevance preset surfaced two defects the unit tests didn't (they proved the lifecycle is correct in isolation).

**Defect 1 — illegal-transition on approve.** `isStageUnlocked('signoff')` required only `hasPromotableDoc`, so the stepper let you jump to the checker-approve stage before the maker submitted; `checkerApprove` then hit `in-review → approved` ("✕ illegal transition"). The lifecycle itself was already fail-closed (a wrapper test pins it) — the gap was stage-gating.
- Fix: `isStageUnlocked('signoff') = hasPromotableDoc && submitted`, mirroring the existing generate/promote-until-approved lock. Reuses the lock pattern; no new machinery. Tests updated to pin the corrected gating (signoff locked until submitted; furthestUnlocked/resolveActiveStage follow).

**Defect 2 — footer label lied.** The review footer showed "Ready for maker sign-off" whenever `openDefects===0`, but the Submit button is disabled until `decided ≥ 60%` — so at 40% decided the label and the gate disagreed.
- Fix: expose the canonical threshold as `ReviewProgress.minDecided` (single source of truth, reused from the same `Math.ceil(total*fraction)` that drives `canSubmit`) and make the footer show `Decide N more to submit · decided/total` until `canSubmit`. No duplicated constant.

**Verified live (browser, Elevance CG-SURG-83):** Ingest → Review (45/45 decided) → Submit → Sign-off → **Approve with no illegal-transition** → Generate: 27 CRD coverage rules + 16 DTR items, comorbidity choices carry the `answerValueSet` pill. Full authoring chain green end-to-end.

**Gate (mirror):** vitest 404/404; tsc/prettier/eslint clean; sizes under cap.

**Known residual (extraction seam, deferred to hardening — NOT this fix):** two section headings still bleed into DTR items ("…surgery. Reoperation"; "…GERD). * Revision/ conversion indications…") because a criterion region isn't terminated at an unmarked following heading/note — same defect class as the tested evidence-appendix boundary.

**Delivery:** working tree on `main` (uncommitted, staged for review). Components (IngestStage preset, EncodingReviewPanel footer) delivered directly — outside the mirror's vitest scope, verified in the browser.

---

## Entry: Extraction boundary — criterion no longer absorbs a following heading or footnote (authoring complete)

**Change class:** core `src/lib/policy/extract/criteriaParse.ts` (the marker/nesting parser). **Trigger:** the two DTR heading-bleeds seen live on Elevance CG-SURG-83 ("…undergoing bariatric surgery. **Reoperation**" and "…documented GERD). **\* Revision/ conversion indications apply…**").

**Root cause:** `parseCriteria`'s continuation branch folds ANY non-marker line into the deepest open criterion. So a standalone section heading ("Reoperation", the label of the next determination) and a footnote line ("* Revision/…") were appended to the preceding criterion.

**Fix (two tight, general boundaries; reuses the existing group-start predicate):**
- A footnote line (`^[*†‡§]␠`) is a policy note, never criterion text — not folded.
- A SHORT standalone heading (≤40 chars, ≤3 words, title-case, no sentence-ending punctuation) whose NEXT meaningful line opens a determination (`isGroupStartLine`, factored out and shared with the region opener) is a section label — skipped, so it doesn't bleed onto the last item. Guarded tightly so a genuinely wrapped fragment is never dropped; the two determinations still split into two groups (heading skipped, not lost).

**Adversarial/red-team:** the lookahead skip fires only when the line looks like a heading AND the next line opens a determination — a lowercase sentence-fragment continuation (e.g. "documented within 6 months") is never dropped; a footnote skip can only remove a note, never criterion content.

**Gate (mirror):** vitest **405→407** (added `criteriaBoundary.test.ts`, 2 cases); the whole 400+ extraction suite (criteria/extract.*) stays green — no regression. tsc/prettier/eslint clean; file 162 lines (< 400).

**Verified live (browser, Elevance):** full chain reload → review → submit → approve → Generate; both DTR items clean, `bleedsRemaining {reoperation:false, revisionNote:false}`.

**Authoring status: COMPLETE.** Choice binding, Elevance preset, sign-off gating, honest submit footer, and extraction boundary all delivered + gated + browser-verified end-to-end. Next phase: CRD → DTR → PAS runtime.

**Delivery:** working tree on `main` (uncommitted, staged for review).

## 2026-08-29 — Comorbidity/documentation boundary: investigation + regression lock

**Trigger:** live browser showed the obesity-comorbidity DTR choice carrying 9 options — 4 true
conditions (diabetes, cardiovascular disease, hypertension, cardio-pulmonary) plus 5 DOCUMENTATION
criteria (weight-loss-program history, inadequate weight loss, pre-op evaluations, pre-op education,
treatment plan). Directive: bind only true conditions, but ensure the documentation criteria are still
captured as their own items, and ensure the fix generalizes.

**Finding (reproduction-driven, adversarial):** the CURRENT source is already correct. Running the real
pipeline (pdfIntake → extractCriteriaPolicy → engineQuestionnaireItems) on Elevance CG-SURG-83 in a
clean environment emits the comorbidity choice with EXACTLY 4 condition options bound to
`urn:rhtp:dtr/ValueSet/obesity-comorbidity`, and the 5 documentation criteria each as their own separate
boolean items. `criteria.test.ts` corroborates the extraction tree (C.2 = 4 comorbidities, D = 5
documentation items as a distinct top-level criterion). The "9 merged options" observed in the browser
was a STALE dev bundle (same class as the WorkQueuePage `slice`-of-undefined phantom seen earlier this
session, whose guard is already committed). No code defect; the encode `flatOptions` recursion fix from
earlier this session is what keeps C.2's value set to its own 4 children.

**Locked:** added `tests/policy/comorbidityDocumentationBoundary.test.ts` — a payer-agnostic synthetic
case (open-set comorbidity sub-list + a separate documentation branch) AND the real Elevance golden,
each asserting (a) the comorbidity value set contains only conditions (no documentation phrase leaks
into any choice option) and (b) each documentation criterion surfaces as its own non-value-set-bound
item. Full policy+dtr suite green in a clean run (269 tests + 3 new). Test-only change: E13 (changed
src empty), sizes (131 < 500 test cap), types clean.

**Generality probe (tip-of-the-iceberg):** ran the same probe over the other fixtures. `horizon.pdf` and
`sample-pa.pdf` are NOT medical-necessity criteria policies — they are PA-requirement / code-list
documents ("All items below require prior authorization" + CPT tables), so 0 criteria is CORRECT. BUT
both yielded 0 harvested CODES from their CPT tables — a real, separate gap on the CRD/code-extraction
side (not the comorbidity class). Logged for prioritization; not fixed in this pass.

## 2026-08-29 — Demo hardening: assistant BYO-key, graceful promote, requirement-table code harvest

**1) Encoding Assistant "bring your own key" (session-only).** Added a first-step config in the
assistant rail: the demonstrator enters `AI_CODING_ENDPOINT` + `ANTHROPIC_API_KEY` to switch from the
deterministic offline path to the live LLM. Key handling is SESSION-ONLY — held in React state, sent
per-request to our own BFF, never written to storage, never logged, cleared on refresh/disconnect. The
BFF route (`/api/policy/assistant`) now prefers request config over the env gate and still fails safe to
the deterministic answer. Files: `EncodingAssistantPanel.tsx`, `api/policy/assistant/route.ts`.

**2) Graceful promote — "queue for next release".** Replaced the unrealistic "✓ Promoted — live for the
tenant" with an operational release conclusion: a new pure module `workflow/release.ts` stamps a
calendar version, queues the next monthly release window, sets an effective date = window + provider-
notice period (default 60d), files a deterministic change-record id, carries the maker/checker sign-off,
and lists the stakeholder queues the change WOULD notify (modeled, labelled "queued" — never faked as
sent). The workbench renders a release-summary card with a rollback affordance (honest copy: a published
version is immutable; rollback opens a new change). Unit-tested (`release.test.ts`, 5 cases, clock-injected
deterministic). Files: `workflow/release.ts`, `PolicyDtrWorkbench.tsx`.

**3) Requirement-table code harvest (generality).** Closed the gap where PA-requirement/code-list policies
(horizon.pdf, sample-pa.pdf) harvested 0 codes. Added a requirements-table pass to `criteriaCodes.ts`:
inside a PA-requirements / CPT-HCPCS-table context it harvests EVERY valid code per line — handling leading
row indices ("1 43770 …"), many codes per line ("93451, 93452, 93453"), and wide table headers — with
CPT-range / HCPCS-format validation. Fail-closed: no context ⇒ no harvest, so prose 5-digit numbers are
never fabricated into codes; context closes at References/Rationale. Result: horizon 0→15 codes, sample-pa
0→7 (incl. E-series DME HCPCS), Elevance unchanged at 27. Payer-agnostic test `requirementTableCodes.test.ts`
(4 cases incl. the false-positive guard). Full policy+dtr suite green (278 tests) in a clean run.

All changes verified in a clean cloud reproduction (device vitest can't run — node_modules carries Windows
native bindings, device shell is Linux). gate:push + commit are user-side on Windows.

## 2026-08-29 — DTR determination sections (fix: two pathways read as duplicates)

**Defect (UX, confirmed in browser):** a policy with 2+ medical-necessity determinations (Elevance
CG-SURG-83: initial surgery + revision/reoperation) generated a DTR questionnaire that FLATTENED both
pathways into one undifferentiated list — so the second pathway's BMI/comorbidity/documentation items
looked like duplicated questions and undermined reviewer trust.

**Fix:** the pathway now carries the determination heading (`Pathway.label`, set in `encode.ts` from the
group heading; surfaced as the group text in `fhir.ts`). `fhirItemsToDefs` emits one non-answerable
`display` section header per top-level pathway group — but ONLY when the policy has 2+ determinations, so
single-determination policies are unchanged. A new `display` QuestionnaireItemType renders as a titled
section divider (`QuestionnaireRenderer`) and is excluded from the QuestionnaireResponse and from
required/valid accounting (`questionnaireResponse.ts`). The Generate-stage DTR tab count counts only
answerable items (so "Questionnaire 16" is unchanged though 2 headers were added → 18 total).

**Result:** Elevance now renders two titled sections — "Gastric bypass … medically necessary when all of
the following are met" and "Surgical repair/correction or reversal …" — each with its own items. New
regression test `dtrPathwaySections.test.ts` pins: 2+ determinations ⇒ one titled header each (colon
trimmed, non-answerable); a single determination ⇒ no header. Full policy+dtr suite green (280 tests) in a
clean run; types clean.

## 2026-08-29 — Review split into two lists (human exceptions vs AI-decided)

**Change (UX + model):** the Encoding Review stage no longer dumps all 45 items in one queue. `encodingReview.ts`
adds `reviewBucket()` (needs-review vs ai-decided), `acceptAiDecided()` (pre-accepts AI-decided items), and
`submitReadiness()` (gate = no open defects AND every exception decided). "Needs your review" holds genuine
exceptions — defect/ambiguous flags, codes named in a not-medically-necessary/investigational statement
(`routing.bucket==='excluded'`), and human-gated documentation. "AI-decided" holds everything the AI resolved
(clean explicit + AI-mapped codes, per product decision), pre-accepted and collapsed for sample-check; any row
reopens. The panel adds an explicit "I've reviewed the AI-decided items" acknowledgement; the editor submits the
WHOLE policy for maker→checker sign-off — nothing generates CRD/DTR on the AI's say-so alone. Existing
`reviewProgress`/`needsReview`/tests unchanged (new functions added alongside). New test `reviewTwoList.test.ts`;
full policy+dtr suite green (283). Types + lint clean. Panel 280 lines (< cap).

## 2026-08-29 — General-purpose hardening (architect + SWE + red-team coalition)

**Question (owner):** the engine must be general-purpose for ANY payer/state policy — a payer name should have no meaning in the code beyond the sample, unless we deliberately want per-payer adapters. Architect review VERIFIED the live authoring path (route → processPolicyDocument → extractCriteriaPolicy/extractStructuredPolicy → encode → review → DTR/CRD) is payer-agnostic: the only fork is structural (`/Requirements By Product/` → code-table, `/Medical(ly) Necess/` → criteria); zero payer-name branching in encode/dtr/crd/review. Payer names survive only as (a) provenance comments grounding reference value-sets, (b) the demo sample-loader.

**Changes (coalition: architect design → SWE build → adversarial red-team → fix):**
1. **PolicyProfile seam** (`profile/policyProfile.ts`, NEW) — the sanctioned optional per-payer/state extension: `detect` + `normalizeText` (INPUT pre-normalization only), a generic identity default, registry + selector, mirroring the terminology-expansion and coding-map provider seams. Wired as the first step of `processPolicyDocument` (identity by default ⇒ general path byte-for-byte unchanged). Test `policyProfile.test.ts`.
2. **Silent under-extraction guard** (`policyReview.ts`) — a substantial document (bodyChars>6000 or ≥3 necessity cues) that yields ≤2 TOTAL (nested) criteria now pushes a warning, surfaced as an amber "⚠ warnings" chip on the doc card + the review warnings box — a thin/prose extraction can no longer masquerade as fully authored.
3. **Legacy payer-classifier quarantined** — `extract/{index,fields,segment}.ts` (aetna-cpb vs pa-list classifier, off the authoring path, still test-covered) carry LEGACY/do-not-wire banners; `ingest/{aetnaCpb,uhcPaList}.ts` relabeled as mock-corpus seed adapters. Physical deletion deferred to a dedicated refactor-only change (mass test/baseline churn would otherwise risk the push gate).
4. **Assistant floating dock** (`PolicyDtrWorkbench.tsx`) — narrow screens (<lg) get a toggleable bottom-LEFT dock (clears the global Demo Navigator) instead of a buried bottom-stacked panel; sticky right rail retained on lg+.
5. **tsc fix** (`dtrPackageTypes.ts`) — added `display` to `FhirQuestionnaireItemType`, repairing a latent `check:types` break introduced by fix #1's `display` item type (caught by red-team). 

Red-team also cleared: param-reassign (no rule), guard false-positives (now counts nested criteria), fragment balance (removed the fragment entirely — dock nested in grid; 0 prettier warnings), two assistant instances (independent state, one visible per breakpoint). 287 policy+dtr tests green; tsc + lint clean; workbench 391<400.

## 2026-08-30 — Research-drawer source excerpt widened to a usable context window

**Question (owner):** on the redesigned Encoding Review, the per-code research drawer's "Source excerpt
(from the policy)" showed only ~three words either side of the code (`"…ux limb 150 cm or less) 43645
Laparoscopy, surgical, …"`) — too little for a reviewer to verify the code in context, and it sliced words
in half ("roux" → "ux").

**Change (coalition: architect → SWE → adversarial lens; ceremony scaled to a display-only pure fn):**
`extract/provenance.ts` — `SNIPPET_PAD` 24 → 100 (a full line of context each side; the same `snippet`
feeds both the drawer and the assistant's inline citation, so both improve consistently). `snippetAround`
now snaps a cut that lands INSIDE a word back to the nearest whole-word boundary (decided from the raw
neighbour chars before whitespace-collapse), so the excerpt never begins/ends on a fragment. The code sits
centred in the window, so snapping can never touch it.

**Adversarial lens (R4 engineering):** verification is span-based (`verifyAnchor` compares `text[span]` to
the recorded value) and is provably UNAFFECTED by any display-window change — the snippet is decoration, the
span is the evidence. No test asserts snippet content/length (`extract.provenance.test.ts` checks spans;
`encodingAssistant.test.ts` supplies its own snippet strings), so widening is non-breaking. Edge cases
cleared: a code at the text edge gets no ellipsis and no snap on that side; a code-only text yields the bare
code (no fragment, no ellipsis); snapping only fires when both the neighbour and boundary chars are
non-space, so it cannot eat a whole word or empty the body.

**Result:** new `extract.provenance.test.ts` cases pin the wide window (>120 chars), whole-word edges, and
the no-ellipsis-at-edge rule. Types + lint clean; full gate green (push tier).

## 2026-08-30 — Human-in-the-loop gating: AI recommends, human decides every item, checker can't rubber-stamp

**Owner intent:** AI may recommend, but every recommendation must be reviewed and passed by a human
(accept / modify+accept / reject) before the policy can gate for approval; the approver must do real
spot/sanity checks, not rubber-stamp; AI confidence + policy conflict should aid where to focus first.

**Architect → SWE (changes):**
1. **No auto-accept.** AI-decided elements are RECOMMENDATIONS (start `open`), not pre-accepted.
   `EncodingReviewPanel` no longer calls `acceptAiDecided`; the submit gate is `submitReadiness.everyItemDecided`
   (no open element anywhere, no open defect) — the single-ack checkbox is gone. `EncodingReviewAiRow`
   shows Accept / Reject (+ the coverage select as "modify") when open, state + Reopen once decided.
2. **Explicit safe bulk-accept.** `bulkAcceptRecommended` accepts ONLY clean (explicit, unflagged,
   non-`excluded`, ai-decided-bucket) codes; AI-mapped (low-confidence) and policy-conflicting codes are
   left open for individual decisions. Reopen now re-blocks the gate automatically (tracked, not a no-op).
3. **Conflict detector.** A code whose OWN descriptor reads not-medically-necessary / investigational
   (`descriptorFlagsExclusion`) — the signal the prose-only `excludingStatement` missed on CG-SURG-83's
   44238 — now routes `excluded` (→ needs-review) and defaults not-covered/investigational, not covered.
   One shared wording set; descriptor path uses adjectival cues only (no loose `investigation`/`exclud`
   stems that appear benignly in CPT text like "intestine, except rectum").
4. **Confidence + conflict triage** (`reviewTriage.ts`, split out for the size cap): `reviewAttention`
   flags AI-mapped + policy-conflicting codes "⚠ verify"; the AI-recommended list sorts them to the top.
   Confidence-to-extract ≠ safe: an explicit code the policy calls NMN is the top-priority review.
5. **Checker can't rubber-stamp** (`SignoffStage`): a decision summary (counts by disposition) shows
   what is being approved; every off-coverage code AND every code the maker pulled ONTO coverage against
   the policy default (`summarizeDispositions` with `overrideFrom`) must be individually spot-checked
   before Approve unlocks; Approve is disabled (not silently no-opped) for an empty / same-as-maker reviewer.

**Adversarial red-team (findings fixed before gate):**
- Size: `encodingReview.ts` hit 407/400 → triage helpers extracted to `reviewTriage.ts` (373).
- `everyItemDecided` failed OPEN on an empty review set → added `total>0` guard (mirrors `reviewProgress`).
- Spot-check was one-directional (denied codes only) → now also flags investigational→covered overrides.
- Descriptor regex used loose stems → tightened to explicit adjectival determinations; statement path
  broadened with common payer phrasings ("not reasonable and necessary", "does not meet … criteria").
- `DispositionSelect` rendered on diagnosis rows (phantom spot-check) → restricted to procedure codes.

**Known follow-up (documented, not in this batch):** the new maker/checker completeness gates are
enforced in the React shell; the pure lifecycle (`makerSubmit`/`checkerApprove`) still enforces only
maker≠checker. Threading review-completeness + spot-check into `applyTransition` as a fail-closed
precondition is a separate lifecycle change. Accepting a procedure row affirms its shown coverage
disposition (the select is on the row); bulk-accept is limited to clean, non-conflicting codes.

**Result:** 46 targeted + full policy suite green; tsc + lint clean; all changed files under the size cap.

## 2026-08-30 — DTR patient evaluation: the authored policy prepopulates from a real FHIR record

**Owner intent:** the CRD/DTR/PAS analysis proved the patient side was a disconnected fixture —
`/api/dtr/evaluate` returned a hardcoded lumbar-MRI scenario for ANY code and the evidence was baked-in
literals. Connect the AUTHORED policy to a patient: derive its computable criteria, run them against a
patient's FHIR record, and show what prepopulates vs what stays a documentation gap.

**Architect → SWE (new `src/lib/policy/dtr/evaluate/`):**
1. `patientData.ts` — minimal FHIR bundle types + pure query helpers (`ageInYears` from Patient.birthDate,
   `latestObservation` for LOINC 39156-5 BMI, `findCondition` for ICD-10 comorbidities) that return the
   matching resource WITH provenance, plus a bariatric patient fixture (Maria: BMI 42.3, active E11.9).
2. `patientEvaluation.ts` — `evaluateDtr(criteria, bundle, asOf)`: every computable group's status +
   evidence is READ FROM THE RECORD (age/BMI/comorbidity); documentation criteria stay `gap` (never
   auto-satisfied). Deterministic (`asOf` injected).
3. `dtrCriteriaFromPolicy.ts` — `dtrCriteriaFromReview` encodes the reviewed criteria (REUSE of the same
   engine the questionnaire/CQL use) and lifts the typed age/BMI thresholds + documentation, so the
   evaluation is driven by the authored policy. Comorbidity uses a documented standard obesity set.
4. `bariatricCriteria.ts` — the CG-SURG-83 computable-criteria fixture + CPT set for the server path.
5. Wiring: `devStubs.dtr.ts` routes bariatric CPTs through `evaluateDtr` (no longer the lumbar default);
   `PatientPrepopPanel.tsx` (Generate stage) evaluates the LIVE authored review against the sample patient.

**Adversarial red-team (findings fixed before gate):**
- Size: `devStubs.dtr.ts` was blown to 538 by a stray reformat → restored to the compact 240-line form
  (prettier rule is warn-level; scenario objects kept single-line under the cap).
- Comorbidity was marked `required` even when BMI ≥ 40 qualified alone → now required only when the band
  is the patient's actual qualifying path (`band && !bmiClearsThreshold`); a BMI-45 patient no longer
  reads a false comorbidity gap.
- `findCondition` excluded clinically-active `recurrence`/`relapse` → now included; `evaluateDtr` guarded
  against malformed/empty bundles (no `entry`, missing `code.coding`).
- Honesty: the server path is a FIXED fixture + fixed patient (the stateless endpoint can't reach the live
  review); comments corrected to say so, and the panel reports "N/M computable criteria auto-prepopulated
  · K gaps to resolve" rather than an absolute "all met".

**Result:** new `dtrPatientEvaluation.test.ts` + `dtrCriteriaFromPolicy.test.ts` (12 tests) pin age/BMI/band/
comorbidity/documentation status, provenance, the required-logic fix, and the derivation. tsc + lint clean;
full suite green; all files under the size cap; `PatientPrepopPanel.tsx` baselined in testlink.
