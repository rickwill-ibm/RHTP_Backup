# Care Plan Pair Output: G5 (care plan hardening) + O-7 (richer criteria content)

Specialist: Care Plan pair (Medical Expert lens + engineering lens). Direction pack: DP-4. Contracts consumed: C1, C2, C4, C9.4, C10; seam convention C3; docs C8. Golden-path participation: hop 8. Framing rule honored throughout: every design element below is general capability for the class of journeys the 16 steps exemplify; nothing binds to the Maria journey, and section 2 records where the current code violates exactly that rule.

Label discipline: every claim is marked CURRENT (verified in the staged code or evidence pack) or TARGET (this design). ASSUMPTION labels carried where stated.

---

## 1. Matrix Row

### Row G5: Intelligent care plan hardening

| Column | Content |
|---|---|
| Current state | CURRENT. Real 1,262-line deterministic-ish generator across five modules (`src/lib/services/carePlanGenerator*.ts`); two entry points (`generateComprehensiveCarePlan`, `generateHolisticCarePlan`); ZERO tests; rules/template rigor only; no FHIR output; no contraindication input; no guideline citations; nondeterministic (Date.now/new Date inline); side-effecting (mutates `referralStore` during generation); PHI in console logs; a hardcoded member-name literal in referral ids; types imported from `@/lib/mockData`; no BFF route for care plans among the 21 real API routes. All five files frozen in the quality ratchet baseline. |
| Code evidence | `src/lib/services/carePlanGenerator.ts:39-111` (entry points), `:66` (PHI log), `:107-110` (silent fallback); `carePlanGenerator.helpers.ts:143` (`ref-margaret-` id literal), `:118-128` (keyword specialty map), `:173` (referralStore mutation); `carePlanGenerator.goals.ts:98-169` (keyword measure matching), `:64` (inline dates); `carePlanGenerator.holistic.ts:120-129` (demo-journey keyword strings); `carePlanGenerator.types.ts:1` (mockData type import), `:12` (`clinicalData?: any`). Evidence pack: "Care plan: real 1,262-line generator across five modules; ZERO tests; rules/template-level rigor. Debt register prescribes split: builder/validator/templates." |
| Target architecture | TARGET. New `src/lib/carePlan/` module per conventions §4, split builder/validator/templates per the debt-register prescription; pure deterministic `planEngine.evaluate(context, deps)`; context in via C1 person-context (tier-labeled, consent-scoped); output as FHIR CarePlan/Goal/Task/ServiceRequest per C4, persisted to the record through the stage-4 loader path with an outbox event (`care-plan.created` / `care-plan.updated`, ADR-006 single event-birth rule); clinician review through the existing goldenThread work queue (DP-3 no-second-inbox rule); DP-4 acceptance oracle (golden fixtures, property invariants, FHIR conformance) as the regression floor; legacy files become thin delegates and the baseline shrinks. |
| Dependencies | C1 read API (person-context), C9.4 care-plan MVR (4@partial T1, 5@T1 dispense, 6@partial T1, 9@>=T2 with the contraindication honesty flag, 13@T1, 15@T1), C10 event consumption (`care-gap.*` in, `care-plan.*` out), ADR-002 backbone for the progress projector, ADR-005 evidence entries, ADR-006 outbox, goldenThread `workQueue` public surface, C5 dual-mode suite. |
| Contracts touched | C1, C2, C4, C9.4, C10, C3, C5, C8 (section 7). |
| Scale posture | Section 8. Request-scoped generation plus stream-class event consumption; partition memberId; idempotent on eventId; rebuildable from replay. |
| Portability posture | Section 9. Kafka API plus Postgres wire only; FHIR store via the doctrine-6 seam. |
| Effort | Section 13. Epics E1..E7, S/M/L with assumptions. |
| Risks | Section 15, ranked. |
| Acceptance tests | Section 11, named files. |
| Docs-done | Section 12. |

### Sub-row O-7: Richer criteria content (under G5)

| Column | Content |
|---|---|
| Current state | CURRENT. Policy corpus engine is Tier A (17 real policies, accuracy anchors 19/19, `NormalizedPolicy` ingestion). O-7 is content work: the corpus lacks payer PA criteria depth. Content sources verified in Phase 0 item 3: the PA folder holds Aetna cardiac Clinical Policy Bulletins plus UnitedHealthcare PA requirements (documents only, not code). |
| Target | TARGET. Extraction of those documents into `NormalizedPolicy`-pattern criteria records with full provenance, every record flagged `smeReviewed: false`; auto-approval paths (gold-carding, auto-approve recommendations) hard-gated on `smeReviewed: true`; GB-3 SME sign-off flips the flag per criteria version, attributed and audited. Care plan citations and the goldenThread medical-necessity path consume the same corpus (single source of truth). |
| Dependencies | Policy corpus ingestion (existing Tier A), GB-3 (blocked gate, planned around), C8 provenance doc row. |
| Effort | E6 in section 13. |

---

## 2. Current State Evidence

All citations from the evidence pack plus direct reads of the five staged generator files. Nothing re-derived, nothing contradicted.

**From evidence.md (binding):** "Care plan: real 1,262-line generator across five modules (`src/lib/services/carePlanGenerator*.ts`; generateComprehensiveCarePlan, generateHolisticCarePlan); ZERO tests; rules/template-level rigor. Debt register prescribes split: builder/validator/templates." The 21 real API routes include no care-plan route. The quality ratchet freezes 66 legacy over-cap files; `/home/claude/enforcement/AGENTS.md:54` names `services/carePlanGenerator*` as "legacy, frozen (see ratchet)".

**Verified line counts (staged copy):** carePlanGenerator.goals.ts 347, carePlanGenerator.helpers.ts 327, carePlanGenerator.holistic.ts 272, carePlanGenerator.ts 255, carePlanGenerator.types.ts 61; total 1,262. Sibling engines feeding the holistic path: holisticContextEngine.ts 396, rootCauseAnalyzer.ts 401 (itself over the 400 cap), tieredInterventionGenerator.ts 96.

**Defect inventory from direct read (each a hardening target, cited file:line):**

1. **Representative-rule violation (plan §1.2 defect class).** `carePlanGenerator.helpers.ts:143`: referral ids are minted as `` `ref-margaret-${Date.now()}-...` ``; a member's first name is a string literal inside a general engine. `carePlanGenerator.holistic.ts:120-129` keys intervention typing off demo-journey phrases ("activate unite us", "autism family support", "caregiver alliance", "respite care program"); `:61-62` special-cases the caregiver-burden blocker in the plan title. These work only for the demo journey shape.
2. **No contraindication input at all.** `ComprehensivePlanInput` (types.ts:7-13) carries patient, hccSuspects, careGaps, alerts, `clinicalData?: any`. No allergies, no active medication list, no interaction data. DP-4 invariant 2 is unimplementable against this input shape.
3. **No guideline citations.** No goal or intervention carries any evidence-source field anywhere in the five files. DP-4 invariant 3 is unimplemented.
4. **Keyword-string clinical logic.** Specialty routing (`helpers.ts:118-128`), SDOH detection (`helpers.ts:248-277`), intervention selection (`goals.ts:98-169`), intervention typing (`holistic.ts:118-160`) all match free-text measure names and descriptions. No coded value sets, no terminology.
5. **Nondeterminism.** `Date.now()` / `new Date()` inline at `helpers.ts:143,153,308`, `goals.ts:64,195,265`, `holistic.ts:163-186`. Violates conventions §7.1; makes golden-fixture regression impossible as-is.
6. **Side effects inside generation.** `createReferralsForCareGaps` (`helpers.ts:110-177`) mutates the browser-memory `referralStore` during plan generation, before any clinician review. Impure engine plus an ungated care action.
7. **PHI in logs.** `carePlanGenerator.ts:66` logs the patient name via `console.log`. Violates conventions §6.3, §8.1.
8. **Silent degradation.** `carePlanGenerator.ts:47-51` swallows goal-assignment errors; `:107-110` silently falls back from holistic to comprehensive on any error. Violates fail-loud doctrine.
9. **Financial values and clinical priorities entangled, hardcoded.** Bonus constants 2500/2000/3000 (`carePlanGenerator.ts:214-216`, `helpers.ts:139-141`, `holistic.ts:89`), 15% shared-savings factor (`carePlanGenerator.ts:244`), plan sharing with the Health Plan gated on revenue > 5000 (`carePlanGenerator.ts:125`). Data-is-not-code violation plus a clinical-rigor concern (section on rigor criteria below).
10. **Consent-blind sharing.** `determineSharing` (`carePlanGenerator.ts:113-130`) shares to portal, specialists, health plan with no consent check. Care-plan MVR requires 15@T1 for exactly this reason.
11. **Type source-of-truth violation.** `types.ts:1` imports domain shapes from `@/lib/mockData`; `(patient as any)` casts at `helpers.ts:152`, `carePlanGenerator.goals.ts` sibling `holistic.ts:204`.
12. **Fabricated contact data.** Care-team emails synthesized from provider names (`goals.ts:299`, `holistic.ts:199`), NPI "See patient record". Presentation-tier fabrication inside a service.
13. **No FHIR output.** `GeneratedCarePlan` is a bespoke UI shape; C4 CarePlan/Goal/Task/ServiceRequest mapping does not exist. Note evidence pack C9.1 row 11: care plans/goals/tasks are T0 in the record today.
14. **DP-4 invariant 1 is only accidentally approximated.** `assignInterventionsToGoals` (`helpers.ts:22-104`) backfills a default follow-up intervention for empty goals, but assignment is keyword matching on goal description text.
15. **No BFF route.** ASSUMPTION (UI pages are not in the staged copy): the generator runs client-side, imported by WPC screens, consistent with the browser-memory referralStore import and the absence of any care-plan route in the verified 21. Target must land generation server-side behind `/api/care-plan/*` per the BFF invariant.

**What is genuinely good and gets kept:** barrier-first sequencing (SDOH goal generated first, `goals.ts:57-83`); barrier-aware modality selection (`determineOptimalModality`, `goals.ts:16-43`); the tiered root-cause-first structure of the holistic path; goal/intervention/care-team decomposition already matching the eventual FHIR shape. The hardening preserves these semantics as data-driven capability.

---

## 3. Target Architecture

Design sits entirely inside doctrine (seam pattern, BFF-only, AI guardrails, ratchet), ADR-002/005/006, C1/C2/C4/C9/C10, and DP-4. No deviations needed; none proposed.

### 3.1 Shape: deterministic engine, effects at the edges

One pure core: `planEngine.evaluate(context: PlanContext, deps: EngineDeps): PlanResult`. `deps` injects clock, id-generation, and policy/template data access (conventions §7.1). Same context plus same deps yields the same plan, forever; this is what makes golden fixtures a regression suite instead of a screenshot.

Data flow (current vs target labeled):

- **Context in (TARGET):** `contextAdapter` builds `PlanContext` from the C1 person-context read (`GET /api/person-context/{memberId}?purpose=care-coordination`). Every section carries its C9 tier label; the adapter never upgrades a tier. Consent scoping and Part 2 exclusion happen inside C1 before the engine ever sees data; the engine additionally receives the consent summary so sharing decisions are consent-driven, not revenue-driven. CURRENT equivalent: UI passes hand-assembled mock shapes.
- **Engine (TARGET):** builder modules produce goals, interventions, care team; validator modules enforce the DP-4 invariants and attach the data-limitation flags; templates and criteria are data files loaded through deps. CURRENT equivalent: keyword-matching inline logic.
- **Output (TARGET):** dual-projection from one internal plan model: (a) FHIR CarePlan/Goal/Task/ServiceRequest per C4 for persistence; (b) the existing `GeneratedCarePlan` view-model for the WPC screens, so C5 dual-mode stays green without UI rewrites.
- **Persistence and propagation (TARGET):** the BFF route persists the FHIR bundle to the record with Provenance; the write commits with an outbox row in the same transaction scope (ADR-006: internal platform writers use the same outbox pattern; exactly one way events are born). `care-plan.created` / `goal.set` / `task.created` events ride the C2 envelope. The graph, agents, golden thread consume; the care-plan service never writes to any projection directly (dual-write ban).
- **Review (TARGET):** plan activation is HITL always. The route creates a review `WorkItem` via the goldenThread `routeToQueue` public surface (`src/lib/goldenThread/index.ts` exports `routeToQueue`, `isSlaBreached`, `WorkItem`); no second inbox (DP-3). Clinician approval transitions the CarePlan from `draft` to `active`; the transition is attributed, audited (ADR-005 entry), and emits `care-plan.updated`.
- **Referrals (TARGET):** the engine proposes referrals as ServiceRequest resources in `draft` inside the plan. Referral initiation is an approval-time effect executed by the route (later by the referral-coordination agent under its own HITL gate), never a generation-time mutation. This deletes defect 6 structurally.
- **Progress (TARGET, hop 8):** a small `progressProjector` consumes `care-gap.*` and relevant domain events for members with active plans, annotates goal progress with evidence references, persists via the same route-side writer, and emits `care-plan.updated`. Idempotent on eventId, rebuildable from replay (C10.2).

### 3.2 The DP-4 acceptance oracle, made executable

1. **Golden fixtures.** `tests/carePlan/fixtures/*.json`: reviewed member contexts with expected plan characteristics, signed by the Medical Expert lens (fixture metadata: `signedBy`, `signedAt`, `lensVersion`). The fixture set is deliberately journey-diverse per plan §1.2: diabetes with transportation barrier; behavioral-health context with Part 2 exclusion applied; polypharmacy older adult; pediatric well-child with childcare barrier; barrier-free simple case; allergy-contraindication case; minimal-data case (T3-only claims shadows) proving the data-limitation flags fire. Expected characteristics are structural assertions (goal count ranges, mandatory barrier goal ordering, citation presence, flag presence), never pixel or prose equality. Fixtures are data generated by `tools/seed/` scripts (conventions §14.5). NOTE (honesty): medical-lens sign-off is this coalition's internal clinical review; it is not GB-3 external SME sign-off and is never represented as such.
2. **Property invariants** (fast-check, `invariants.property.test.ts`), run against generated arbitrary contexts:
   - P1: every Goal in the output has at least one linked intervention (Task or ServiceRequest).
   - P2: no intervention whose intervention-class conflicts with an active contraindication in context; when allergy data is below T1 the engine must instead emit the data-limitation flag (asserting P2 without the data is itself a failure).
   - P3: every clinical recommendation carries at least one guideline citation whose source id resolves in the citation registry (ADA/USPSTF/HEDIS-class).
   - P4: every SDOH barrier present in context is either addressed by a barrier goal/intervention or explicitly deferred with a coded reason; no silent drops.
   - P5: determinism; identical context and deps produce identical output.
   - P6: output parses against the zod plan schema and each FHIR resource passes structural profile validation.
3. **FHIR conformance.** Tier-A structural validation offline in unit tests (profile shape, required bindings) plus an integration harness that runs `$validate` against the HAPI container for the fixture outputs (`fhirConformance.test.ts`), per C4: US Core CarePlan, Goal, plus Task and ServiceRequest; SDOH content on Gravity SDOHCC profiles.
4. **O-7 flag conformance.** Any plan citation or necessity criterion whose corpus record carries `smeReviewed: false` propagates a `notSmeReviewed` marker into the plan output; auto-approval logic refuses such criteria; tests assert both (section 11).

### 3.3 Clinical rigor criteria (Medical Expert lens, binding on the build)

- **Evidence base.** Every goal and intervention template row carries `citation: {sourceId, system}` resolving in `data/guideline-citations.json` (ADA Standards of Care, USPSTF grade recommendations, HEDIS measure specifications, CMS/state program guidance). A template without a citation cannot load (schema-enforced). Template selection is by coded trigger (measure id, value-set membership, Z-code), never by free-text keyword.
- **Clinical/financial separation.** Clinical prioritization (goal selection, ordering, urgency) computes only from clinical and social inputs. Financial impact (RAF delta, gainshare) remains a reporting projection computed after the plan is formed and is never an input to goal selection or to sharing decisions. Sharing is consent-plus-role driven. This corrects defects 9 and 10 as a rigor requirement, not merely a style fix.
- **Contraindication checking scope, phase-honest.** At 9@>=T2 (allergies document-level or absent): no contraindication assertion is made; every plan carries `dataLimitations: [{domain: "allergies", tier: "<actual>", consequence: "contraindication-checking-not-asserted"}]`, rendered prominently in the review UI. At 9@T1: intervention-class gating against coded AllergyIntolerance (class-level rules in `data/contraindication-rules.json`, e.g. contrast-media class vs documented contrast allergy) plus condition-based intervention gating (e.g. nephrotoxic-class recommendation vs CKD stage). Explicit scope boundary: this is intervention-level gating on coded data, not a pharmacy-grade drug-drug interaction engine; medication-interaction depth beyond class rules is out of scope for G5 and named as such wherever the capability is described (doctrine 9 honesty).
- **Safety gates.** Plan activation always HITL (work-queue review); referral execution approval-gated; BH/SUD content consent-gated at read time via C1 on top of transformation-time labels; urgent flags carry SLA routing via `routeToQueue` priority with `isSlaBreached` escalation; any future LLM narration sits on top of the deterministic plan per the six guardrails (server-side, deterministic-first, human-gated, PHI-safe, labelled decision-support, feature-flagged) and changes nothing in the plan content path.

### 3.4 O-7 content plan (flagged not-SME-reviewed pending GB-3)

Sources (Phase 0 item 3, verified): Aetna cardiac Clinical Policy Bulletins plus UnitedHealthcare PA requirement documents in the PA folder.

- **Home:** the existing Tier-A policy corpus (`src/lib/policy`, `NormalizedPolicy` pattern), not a parallel criteria store; the care plan and goldenThread medical necessity consume one corpus (single source of truth). The care-plan module holds only the citation registry keys pointing into it.
- **Extraction pipeline:** `tools/content/extract-criteria/` scripts turn each document into structured criteria records: payer, policy id, version/effective dates, indication codes (ICD-10/SNOMED), service codes (CPT/HCPCS), criteria logic (structured JSON now; CQL where the DTR/CQL path already executes it, spike SP2), plus provenance (source filename, checksum, section anchor, extractedAt, extractor version). Data lands as `data/*.json` per data-is-not-code; documents themselves are content inputs, not repo code.
- **Flag lifecycle:** every extracted record ships `smeReviewed: false`. The flag surfaces in every consumer (plan citations, necessity rationale, any admin screen). Auto-approval and gold-carding logic hard-refuse criteria with `smeReviewed: false` (a code gate with a named test). GB-3 sign-off is a per-record, per-version attributed flip recorded to the ADR-005 ledger. Until GB-3 has SME time, all O-7 content operates in decision-support-only mode; this is planned around, never built around.
- **Accuracy anchors:** each extracted policy adds corpus accuracy anchors in the existing 19/19 pattern so extraction quality is regression-tested content, not asserted.

### 3.5 Legacy retirement (ratchet-conformant)

The five `carePlanGenerator*.ts` files are frozen; they never grow. Sequence: (1) new module lands complete with tests; (2) each legacy entry point becomes a delegate calling the new engine (the ratchet-permitted one-line-call edit pattern); (3) WPC screens move to the BFF route behind the mock toggle (C5 dual-mode proves both paths); (4) legacy files retire in a refactor-only PR and the baseline shrinks by five files. The holistic siblings (holisticContextEngine 396, rootCauseAnalyzer 401, tieredInterventionGenerator plus helpers) stay frozen in this pass; their barrier-first and root-cause semantics are absorbed as data-driven `barrierPlanner` capability, and their retirement is a named follow-on refactor, not hidden scope.

---

## 4. Build Approach and Reuse Map

**Reused (named Tier-A code):**
- goldenThread `workQueue` / `workQueueView` public surface (`routeToQueue`, `isSlaBreached`, `workItemFromEvidence`): plan review items. No second inbox.
- Policy corpus ingestion + `NormalizedPolicy` pattern + accuracy-anchor testing: O-7 content home.
- Consent module (`providerAccessOptOut.ts`): C3 exemplar replicated for the care-plan store seam; consent state consumed via C1.
- Authz guard pattern: route protection on `/api/care-plan/*`.
- FHIR validation utilities: structural conformance in unit tests.
- ADR-005 evidence store interface: audit entries for generation, approval, flag flips.
- ADR-006 outbox pattern: event emission.

**New:** everything under `src/lib/carePlan/` (section 5), the BFF routes, the progress projector, the extraction tooling under `tools/content/`, the test suite (section 11).

**Order:** E1 core extraction with determinism fixes; E2 oracle (fixtures + properties + conformance) against the core; E3 BFF route, persistence, review flow; E4 progress projector; E5 contraindication gate + citation registry; E6 O-7 content; E7 legacy delegation + dual-mode green + baseline shrink. E1 and E2 interleave (tests land with the code they cover, conventions §14.1); E6 can run parallel from E2 onward.

---

## 5. File-Level Touchpoints

All new files under `src/lib/carePlan/` per conventions §4; every file under the 400-line cap (estimates below are design budgets); no additions to any baseline file beyond the delegate call edits the ratchet permits; all authored data external in `data/`.

```
src/lib/carePlan/
  types.ts                     (~180)  shared shapes; Result unions for expected outcomes
  schema.ts                    (~250)  zod: PlanContext, PlanResult, template/criteria/rule data schemas
  index.ts                     (~40)   public surface, re-exports only
  README.md                    (<=150) conventions §13.2 template
  contextAdapter.ts            (~220)  C1 response -> PlanContext; tier labels; limitation detection
  planEngine.ts                (~200)  evaluate(context, deps); orchestrates builders + validators
  builder/goalBuilder.ts       (~250)  coded-trigger goal generation from templates
  builder/interventionBuilder.ts (~250) intervention generation; modality selection (data-driven)
  builder/barrierPlanner.ts    (~200)  SDOH addressed-or-deferred semantics; barrier-first ordering
  builder/careTeamBuilder.ts   (~150)  care team from context (no fabricated contact data)
  validator/invariants.ts      (~200)  DP-4 P1..P6 as executable checks; flag assembly
  validator/contraindications.ts (~200) class-rule gating; tier-aware assertion/flag logic
  validator/citations.ts       (~120)  registry resolution; template citation enforcement
  fhir/toCarePlan.ts           (~180)  C4 CarePlan mapping
  fhir/toGoal.ts               (~120)  C4 Goal mapping
  fhir/toTask.ts               (~120)  C4 Task mapping
  fhir/toServiceRequest.ts     (~150)  C4 ServiceRequest mapping incl Gravity SDOH profiles
  fhir/toViewModel.ts          (~180)  internal model -> legacy GeneratedCarePlan shape (C5 continuity)
  progress/progressProjector.ts (~220) hop-8 event consumption; goal progress annotation
  store/planStore.ts           (~150)  SEAM: care-plan-store; mock + record-backed implementations
  data/goal-templates.json
  data/intervention-templates.json
  data/specialty-map.json              (coded measure/value-set -> specialty)
  data/modality-rules.json             (barrier -> modality preferences)
  data/guideline-citations.json        (ADA/USPSTF/HEDIS-class registry)
  data/contraindication-rules.json     (class-level gating rules)
  data/deferral-reasons.json           (coded SDOH deferral reasons)

src/app/api/care-plan/
  generate/route.ts            (~150)  POST: generate draft, persist, enqueue review
  [id]/route.ts                (~120)  GET plan; PHI-safe errors
  [id]/approve/route.ts        (~150)  POST: attributed activation; referral initiation; outbox

tools/content/extract-criteria/       (extraction scripts; O-7)
tools/seed/carePlanFixtures.ts        (fixture generation)
```

Legacy touchpoints (delegate edits only, ratchet-conformant): `carePlanGenerator.ts`, `carePlanGenerator.holistic.ts` gain a call into `@/lib/carePlan`; no other legacy file changes. ASSUMPTION: WPC screen wiring (not in the staged copy) switches to the BFF route behind the mock toggle; confirmed against the full repo in E7.

---

## 6. Golden-Path Participation

Owned hop: **hop 8 (care plan update)**, exactly as golden-path.md specifies. Payload-level statement:

- **Input:** the `care-gap.closed` C2 event (contracts.md C2 care-gap sample shape): eventType `care-gap.closed`, memberId partition, `causationId` pointing at the observation event, `payload.evidenceRefs: ["Observation/obs-a1c-20260402"]`, `consentContext` inspected from the envelope alone.
- **Processing:** progressProjector checks for an active CarePlan for the member (via the plan store, never another projector's store); the deterministic engine path computes the delta: the glycemic-control-class goal gains a progress annotation citing the observation; no intervention change; DP-4 invariants re-validated on the updated plan (the goal keeps its interventions; the citation set keeps its source ids; barrier states unchanged).
- **Output:** Goal/CarePlan updates persisted per C4 with Provenance; outbox emits `care-plan.updated` (`payload: {carePlanRef, change: "goal-progress", goalRef, evidenceRefs}` per the golden-path hop-8 sample); ADR-005 entry `care-plan.updated` with correlation id `corr-a1c-journey-0042` propagated; a review WorkItem enqueued only when policy requires sign-off for the change class (progress annotations default to no-review, ASSUMPTION pending clinical policy data).
- **Upstream dependency stated:** hop 8 consumes hop 5a output (care-gap events, G2-owned projector per trace finding F1) and reads context via C1 (hop 5b lens serving, G1). Generation-time participation: a full plan generation for this member reads the A1c observation through C1 at 6@partial T1 and cites it; the path holds for any member, any lab, any measure.

---

## 7. Contracts Touched

| Contract | Touchpoint | Grep anchor |
|---|---|---|
| C1 | contextAdapter consumes `GET /api/person-context/{memberId}?purpose=care-coordination`; tier labels honored; Part 2 exclusion relied on server-side | `// CONTRACT: C1` in contextAdapter.ts |
| C2 | progressProjector consumes; route emits via outbox; zod-parse at every boundary | `// CONTRACT: C2` in progressProjector.ts, routes |
| C4 | fhir/* mappers; `$validate` gate in conformance harness | `// CONTRACT: C4` in fhir/*.ts |
| C9.4 | care-plan MVR encoded in contextAdapter limitation logic incl the 9@>=T2 allergy honesty flag | `// CONTRACT: C9` in contextAdapter.ts |
| C10 | event types `care-plan.created/updated`, `goal.set/met`, `task.created/completed`; rebuild-from-replay; no cross-projector reads | `// CONTRACT: C10` in progressProjector.ts |
| C3 | planStore seam (mock mode selectable forever; attributed mutations; contract test vs mock AND real) | `// SEAM: care-plan-store` in store/planStore.ts |
| C5 | care-plan screens registered in `tools/demo-green/seams.json` on seam landing; dual-mode assertions | registry entry, E7 |
| C8 | register rows in section 12 | n/a |

---

## 8. Scale Posture

- **Throughput.** Generation is clinician-initiated, request-scoped: bounded by care-team headcount, not membership. ASSUMPTION: <=10 generations/min state-scale peak; three orders below any gate. Progress projection consumes stream-class domain events: <300/min state peak per the load model; one consumer group (`care-plan-projector`), consumers <= partitions, lag an SLO metric per C6. Batch-class windows: projector may lag per the C6 exemption; catch-up within the alarmed 1h window.
- **Partition key.** memberId everywhere (C6); per-member ordering is what makes progress annotation safe against out-of-order gap events.
- **Idempotency.** Projector dedupes on eventId; route mutations carry idempotencyKey (conventions §7.2); replay-safe by construction; approval transitions are idempotent state checks.
- **Backpressure.** Projector is a plain consumer-group member; falling behind delays progress annotations only (plans stay valid, review queue unaffected); alarmed via consumer lag SLO. Generation backpressure is HTTP-level (stateless route, horizontal scale).
- **Rebuild.** The plan store projection of review state rebuilds from record replay plus the ledger; merge/unmerge (DP-7) rekeys by replay like every projector.
- **Budget compliance.** No DP-5 budget names care-plan generation; none dropped, none re-derived. Consumed budgets honored: C1 read <=300ms p95 feeds generation; internal design target for evaluate() of <=500ms p95 on a T1-rich context, stated as ASSUMPTION and design intent, not a substitute for spine budgets. Signal-to-disposition and ADT budgets are upstream and untouched.

---

## 9. Portability Posture

Protocol dependencies, a subset of C7's five: **Kafka API** (backbone consume/emit via `src/lib/server/backbone` interface), **Postgres wire** (plan-store projection, ADR-005 ledger). The FHIR record is accessed through the doctrine-6 store seam (HAPI reference implementation); the outbox lives in the pipeline-pattern schema per ADR-006 and is store-portable. No object-storage, no OIDC touch beyond the platform's existing auth, no hyperscaler service anywhere in this design. O-7 extraction tooling runs as OCI containers in the batch lane. Anything cloud-specific is IaC-layer, untouched here.

---

## 10. Convention Compliance

- **File split stated up front** (section 5); every file under 400 (tests under 500); no `helpers.ts` dumping ground in the new module (purposeful builder/validator modules instead).
- **Ratchet.** No additions to the five frozen files beyond the permitted delegate calls; baseline shrinks by five at E7; rootCauseAnalyzer.ts (401, over-cap) is named, frozen, not extended.
- **BFF route surface.** Browser touches `/api/care-plan/generate`, `/api/care-plan/{id}`, `/api/care-plan/{id}/approve` only; engines server-side; PHI-safe route errors; authz guard applied; audit events per privileged action.
- **AI-guardrail posture.** The plan path is fully deterministic; no LLM in scope for G5 core. If narration lands later: server-side only, deterministic plan unchanged underneath, human-gated, PHI-safe (references and codes in prompts), labelled decision-support, feature-flagged with degradation to the plain deterministic rendering; prompt as versioned file with eval fixtures per conventions §10.1.
- **Determinism.** Clock, id-gen, data access injected via deps; verified by property P5; no `Date.now()` in the new module (lint-greppable).
- **Types and boundaries.** Strict TS; no `any`; zod schemas in schema.ts as boundary source of truth; expected outcomes (plan-not-found, consent-excluded, data-limited) are Result values; infra failures are coded errors on the `BackboneNotConfiguredError` pattern.
- **Observability.** Structured logging via `src/lib/server/log.ts`; correlation id from the BFF request propagated into engine calls, events, ledger entries; engine timings exposed as metrics.
- **Traceability rows** (docs/traceability.md, added with the capability): care-plan deterministic engine + oracle; care-plan FHIR persistence + events; care-plan review flow (work-queue reuse); contraindication gate (tier-conditional); O-7 criteria content + flag gate. Each row: code path plus test file; backbone-gated rows marked.
- **DoD.** The 13-point definition of done is the acceptance criterion set for every epic; `npm run check:all` exit 0 gates each.
- **Grep anchors.** `SEAM: care-plan-store`; `CONTRACT: C1/C2/C4/C9/C10` as tabled in section 7; `INVARIANT: BFF-only` on the routes.

---

## 11. Acceptance Tests

Named files under `tests/carePlan/` (new domain suite; today zero tests exist for this domain):

**Unit:**
- `planEngine.test.ts`, `goalBuilder.test.ts`, `interventionBuilder.test.ts`, `barrierPlanner.test.ts`, `careTeamBuilder.test.ts`, `contextAdapter.test.ts` (tier-label handling, limitation detection, consent summary)
- `citations.test.ts` (registry resolution; template-without-citation refused)
- `contraindications.test.ts` (class gating at 9@T1; flag emission below; assertion refused without data)

**Property (fast-check):**
- `invariants.property.test.ts` (P1..P6 from section 3.2)

**Golden fixtures (regression, medical-lens signed):**
- `goldenFixtures.test.ts` over `tests/carePlan/fixtures/*.json` (journey-diverse set per 3.2; generated by `tools/seed/carePlanFixtures.ts`)

**FHIR conformance:**
- `fhirMapping.test.ts` (structural, offline Tier-A)
- `fhirConformance.test.ts` (HAPI `$validate` integration for fixture outputs; backbone-gated, marked)

**Contract (per seam, mock AND real):**
- `planStore.contract.test.ts` (same suite against mock Map and record-backed store; C3 rule 7)

**BFF routes:**
- `carePlanRoutes.test.ts` (401/403/400/422/200 per route; PHI-safe bodies asserted; idempotency-key behavior; approve-path attribution required)

**Projector:**
- `progressProjector.test.ts` (hop-8 consumption; dedupe on eventId; out-of-order and redelivery safety; rebuild-from-replay; Part 2 envelope drop without payload parse)

**O-7 content:**
- `criteriaContent.test.ts` (extracted-record schema; provenance completeness; `smeReviewed: false` present on every unreviewed record; auto-approval refusal gate)
- corpus accuracy anchors extended per extracted policy (existing 19/19 pattern)

**Demo-green (C5 additions):**
- care-plan screens added to the dual-mode registry; walkthrough assertions that the plan screen renders in mock mode AND record mode; the data-limitation flag region asserted present when fixtures dictate.

**Legacy equivalence (transitional):**
- `legacyDelegates.test.ts` (legacy exports return engine-backed output shaped for the existing UI; retired with E7)

**Eval suites:** none in scope (no prompts in the deterministic core); the eval directory is created only if narration lands, per conventions §10.1.

Accessibility (O-9): axe-core Playwright checks attach to every care-plan surface touched, as acceptance criteria on E3/E7 rows.

---

## 12. Docs-Done Entries

Register rows per C8 schema (audience, document, stateLabel, class, owner, doneGate, generatedFrom):

| audience | document | stateLabel | class | owner | doneGate | generatedFrom |
|---|---|---|---|---|---|---|
| engineering | `src/lib/carePlan/README.md` | current-state | build-gated (E1) | Care Plan pair | README template complete; agent reaches working context from README + types.ts + index.ts | hand-authored |
| engineering | traceability rows (5, listed in section 10) | current-state | build-gated (per epic) | Care Plan pair | row lands with green test per capability | hand-authored |
| engineering | API reference entries for `/api/care-plan/*` | current-state | build-gated (E3) | Care Plan pair | rendered from zod schemas via the generated-reference pipeline | schema.ts |
| compliance/audit | care-plan clinical rigor statement (evidence base, contraindication scope boundary, safety gates, data-limitation flag semantics) | mixed-labeled | build-gated (E5) | Medical Expert lens | scope boundary text matches shipped gating exactly; no capability overstatement | hand-authored |
| compliance/audit | O-7 criteria provenance catalog | current-state | build-gated (E6) | Care Plan pair | one row per extracted record: source, checksum, version, smeReviewed state | data/criteria records |
| operations/SRE | progress-projector runbook section (lag, replay, rebuild) | target-state | build-gated (E4) | Care Plan pair with X4 skeleton | DLQ replay walkthrough validated once against the dev backbone | hand-authored |
| enablement/field | care-plan honest-answer FAQ entries (what is deterministic, what is flagged not-SME-reviewed, what contraindication checking is and is not) | mixed-labeled | build-gated (E6) | Care Plan pair with X4 | wording reviewed against the rigor statement | hand-authored |

Templates for the build-gated rows come from the Documentation Specialist (X4); these rows embed in the epics as acceptance criteria per doctrine 9.

---

## 13. Effort S/M/L with Assumptions

| Epic | Effort | Assumptions |
|---|---|---|
| E1 Core extraction, deterministic engine, data externalization | M | ASSUMPTION: the legacy semantics worth keeping (barrier-first, modality selection, tiered structure) port as data rules without clinical redesign; the Medical Expert lens review of ported rules is inside this epic. |
| E2 Acceptance oracle (fixtures, properties, conformance) | M | ASSUMPTION: seven fixture archetypes suffice for the first signed set; fast-check arbitraries over PlanContext are buildable from schema.ts without a custom generator framework. |
| E3 BFF routes, persistence, review flow reuse | M | ASSUMPTION: C1 person-context endpoint is available in P2 when this lands (spine sequencing); until then the contextAdapter runs against the mock mode of the same interface. ASSUMPTION: the work-queue public surface accepts a care-plan-review queue name without goldenThread internal changes. |
| E4 Progress projector (hop 8) | S | ASSUMPTION: backbone dev-compose (ADR-002) exists when E4 starts; gap events (F1 projector, G2-owned) are stubbed by fixture events until then. |
| E5 Contraindication gate + citation registry | M | ASSUMPTION: a class-level contraindication rule set of clinically defensible scope is authorable by the medical lens from published sources within the epic; SP1 bounds this before commit. |
| E6 O-7 criteria extraction + flag lifecycle | M | ASSUMPTION: the PA-folder document set is stable and re-suppliable; extraction is semi-automated with manual verification against accuracy anchors; CQL depth per SP2. Content lands decision-support-only until GB-3. |
| E7 Legacy delegation, dual-mode green, baseline shrink | S | ASSUMPTION: WPC screen wiring (unstaged here) calls the generator from client code as inferred; if wiring differs, E7 absorbs the delta (SP4 de-risks). |

---

## 14. Spike Tickets

| Spike | Question it answers | Timebox rationale |
|---|---|---|
| SP1 Contraindication rule sourcing | Which published class-level rule source (or minimal authored set) gives clinically defensible intervention gating at 9@T1 without pharmacy-grade licensing; what is the exact rule schema | Bounds E5 before any rule data is committed |
| SP2 O-7 criteria representation | Structured JSON criteria vs CQL for the extracted Aetna/UHC content: which does the existing DTR/CQL execution path actually run today, and what does gold-card gating need | Prevents building criteria in a shape the necessity engine cannot execute |
| SP3 Offline conformance depth | How much C4 profile validation is assertable Tier-A offline (structural) vs requiring HAPI `$validate`; where the backbone-gated line sits in the test suite | Keeps conformance honesty (Tier-A never claimed as conformance) |
| SP4 UI coupling audit | Exactly which unstaged WPC screens import the legacy generator and with what shapes; confirms the toViewModel continuity surface and E7 scope | The staged copy lacks src/app; this closes the ASSUMPTION in section 2 item 15 |
| SP5 Progress-change review policy | Which plan-change classes require clinician sign-off vs auto-annotation (data-driven policy shape, who authors defaults) | The hop-8 no-review default for progress annotations is currently ASSUMPTION |

---

## 15. Risks

1. **Contraindication over-trust.** The gravest clinical risk: users assume checking exists before 9@T1 data arrives. Mitigation: DP-4 flag invariant P2 plus the C9.4 honesty note made structural (flag asserted in fixtures, rendered in review UI, stated in the rigor statement and FAQ). Escalation: none needed; contract already binds it.
2. **O-7 content escaping its flag.** Unreviewed payer criteria influencing an auto-approval would be a governance breach. Mitigation: hard code-gate refusing `smeReviewed: false` in auto-approval paths, named test, GB-3 planned around per approval gate H. Escalation: owner notified if any consumer requests an exception.
3. **Clinical/financial re-entanglement.** Demo storytelling pressure to keep revenue-driven prioritization could reintroduce defect 9. Mitigation: separation encoded as an engine property (financial projection computed post-plan); adversarial axis "direction-pack compliance" covers regressions. Escalation: any request to make financial input drive goal selection goes to the owner as a DP-4 deviation.
4. **Legacy UI coupling surprises (unstaged app tree).** E7 scope could grow if screens depend on generator internals beyond the exported shapes. Mitigation: SP4 before E7 commitment; toViewModel keeps the legacy shape stable; C5 dual-mode catches breakage mechanically.
5. **Scope creep into measure evaluation.** Care-plan progress logic must consume `care-gap.*` events, never compute measures (trace finding F1 assigns gap derivation to G2). Mitigation: projector consumes events only; stated here as a design boundary; adversarial review axis available if the boundary blurs.
6. **Fixture sign-off bottleneck.** Golden fixtures need medical-lens review each time expected characteristics change. Mitigation: structural (range-based) expectations minimize churn; fixture metadata versions sign-offs; unsigned fixture changes fail the suite by design.
7. **C1 availability sequencing.** The engine's context contract depends on the person-context API landing per spine order. Mitigation: contextAdapter develops against the C1 interface's mock mode (seam doctrine makes this a supported mode, not a workaround); risk is schedule-shaped, not design-shaped.
