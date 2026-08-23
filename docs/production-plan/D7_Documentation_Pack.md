# Documentation Specialist Output: X4 + D7 pack

Template: manifests.md §7 (fifteen sections, in order). Authored artifacts are embedded as annexes inside §3 (the authored-now set plus the register) and §12 (per-specialist docs-done packages plus build-gated templates). Every embedded document carries an explicit state label per doctrine 9. Style contract honored: no em dash followed by a space; no double spaces; current vs target always labeled.

---

## 1. Matrix Row

D1-ready row for X4 (Stakeholder documentation):

| Field | Value |
|---|---|
| Gap area | X4 Stakeholder documentation (docs-as-code, audience-mapped) |
| Current state | CURRENT: real engineering `docs/` tree exists (ARCHITECTURE.md, traceability.md, build-narrative.md, conformance-plan.md, current-state.md, remaining-work-and-test-plan.md, demo-plan.md, feature READMEs such as `src/lib/policy/README.md`); conventions v2 + AGENTS.md + CLAUDE.md committed with live gates. Zero coverage beyond the engineering audience: no operator runbooks, no deployment guide, no API reference, no executive current-vs-target statement, no compliance posture document, no enablement material. Known drift: remaining-work-and-test-plan.md states 145 passing vitest tests; the verified count is 223/223 across 33 suites. |
| Code evidence | evidence.md (docs tree list per plan §2 item 5; 223/223 measurement; conventions v2 file at `/home/claude/AI-CODING-CONVENTIONS_v2.md`) |
| Target architecture | C8 register at `docs/REGISTER.md` (audience x document x state label x class x owner x done-gate x generatedFrom); authored-now set committed this run; build-gated set as templates + epic acceptance criteria; generation sources of record wired (API reference from zod schemas, deployment guide from deploy.config.yaml, agent pages from manifests, policy reference from policy data); docs-stay-current review gate live |
| Dependencies | Spine outputs (contracts.md, adrs.md, load-model.md, golden-path.md, trace-matrix.md) for target-state content; the other four specialists' §12 entries for register absorption; D5 for the deploy.config.yaml schema the deployment guide renders from |
| Effort | See §13 |
| Risks | See §15 |

Labels carried: the trace-matrix rows cited in the honesty ledger are RECONSTRUCTED and REPRESENTATIVE; the annex says so wherever they appear.

---

## 2. Current State Evidence

All claims cite `/home/claude/coalition/inputs/evidence.md`; nothing re-derived.

1. Tier A (real, tested): identity match engine (`src/lib/identity/matchEngine.ts`, deterministic rules short-circuit at 100, probabilistic weights, thresholds autoLink 90 / possible 60, audited); consent opt-out seam (`src/lib/consent/providerAccessOptOut.ts`, the house seam exemplar); authz guard; goldenThread orchestrator + stages + medical necessity + DTR; policy corpus (17 real policies, accuracy anchors 19/19); network adequacy engine (time/distance, ratios, wait-time, gaps, augmentation, analyst copilot); FHIR validation utilities.
2. Tier B (presentational): knowledge graph (`src/lib/wholePersonGraphData.ts`, 804 lines hardcoded, 52 nodes / 67 edges, five Cypher lens filters as UI labels, no store, no execution); SDE (`src/app/signal-disposition-engine/page.tsx`, 918 lines, results hardcoded); agent coalition (no runtime, demo scenario data); dashboards (per-screen inline numbers); WPC population (seed scripts only).
3. Care plan generator: real 1,262-line service across five modules; ZERO tests; rules/template-level rigor; debt register prescribes the builder/validator/templates split.
4. Substrate absent by design: `start` runs `next dev`; in-process Map stores; no queue/cache/worker deps; file-based state; `backend/` holds logs only.
5. WPC record baseline: 20 resources / 15 types, PA-shaped; WPC screens render from hardcoded TS (`mockData.data.patients.ts`, `patientRegistry.data1-3.ts`, `fhirCareTeamData.ts`, `patientContext.*`), not from FHIR; pipeline-fed completeness today is zero.
6. Verification base: 223/223 unit tests across 33 suites in a clean environment; ~119K LOC; 21 real API routes; real HAPI FHIR JPA (Docker) seeded with the Maria bundle; Newman CMS-0057-F contract tests; Playwright e2e.
7. Conventions v2 governing, ratchet live, 66 legacy over-cap files frozen.

Verified in this session: `docs/remaining-work-and-test-plan.md` is NOT in the staged working copy at `/home/claude/diligence` (src, tests, tools, configs only). The §4.1 drift fix is therefore specified as an exact verified-pattern patch to apply in the canonical repo.

---

## 3. Target Architecture

State label: this section describes the target documentation system; the embedded annexes are the authored-now artifacts themselves, each internally labeled current vs target line by line.

The documentation system has four moving parts, all doctrine-9 mechanics:

1. **The register** (`docs/REGISTER.md`, Annex 3A). One row per document, C8 schema. It is the single source of truth for what documentation exists, for whom, in what state, owned by whom, made true by what gate. Engineering rows absorb the existing docs tree; nothing is duplicated or forked.
2. **The authored-now set** (Annexes 3B, 3C, 3D, 3E). Written in this run from verified evidence plus spine outputs only. Every target-state statement is labeled TARGET; nothing implies production capability that today exists only as demo surface.
3. **The build-gated set** (§12 packages). Templates plus docs-done acceptance criteria attached to the epics that make each document true. Nobody authors operational fiction; a runbook for a system that does not exist is a skeleton with named failure modes, never step-by-step commands.
4. **Generation sources of record.** Generatable content is never hand-maintained (doctrine 9; conventions §5.3): API reference renders from zod schemas (zod-openapi, CI-wired); deployment guides render from `deploy.config.yaml` (ADR-004); agent pages render from agent manifests (conventions §10.2); disposition-policy reference renders from policy data (DP-2 policy-as-data); DAG documentation renders from the repo's DAG definitions (ADR-003, DAGs are data). Hand-written copies of any of these fail review.

Docs-stay-current is a regression contract like demo-stays-green: a PR that changes a seam, contract, or deployment surface without touching its doc fails review (C8). §11 turns this into named checks.

---

### Annex 3A. `docs/REGISTER.md` (the C8 artifact, committed verbatim)

```markdown
# ACE Documentation Register

Contract: C8. Schema: audience | document | stateLabel | class | owner | doneGate | generatedFrom | notes.
The notes column is an additive extension per the contract evolution rule (additive only, versioned).
stateLabel values: current-state, target-state, mixed-labeled (mixed requires per-section labels).
class values: authored-now, build-gated. Build-gated rows name their epic in doneGate.
Owner is a role, never "team". A document flips its stateLabel claims only when its doneGate is met.
Rule of use (doctrine 9): no document may imply production capability that exists only as demo
surface. Docs-stay-current: a PR changing a seam, contract, or deployment surface without
touching its doc fails review.

## Absorbed rows (pre-existing docs tree; owned, not duplicated)

| audience | document | stateLabel | class | owner | doneGate | generatedFrom | notes |
|---|---|---|---|---|---|---|---|
| engineering | docs/ARCHITECTURE.md | mixed-labeled | authored-now | Overall Solution Architect | As-is + target sections marked with seams per D7; updated in place, never forked | hand-authored | Pre-existing; D7 engineering row extends it |
| engineering | docs/traceability.md | current-state | authored-now | every specialist (row author) | Every capability row has code path + passing test; backbone-gated rows marked | hand-authored | Pre-existing; conventions §15 governs |
| engineering | docs/build-narrative.md | current-state | authored-now | Documentation Specialist | Narrative matches verified evidence | hand-authored | Pre-existing |
| engineering | docs/conformance-plan.md | mixed-labeled | authored-now | Pipeline + FHIR pair | Conformance is an Inferno / Da Vinci activity; offline behavior never cited as conformance | hand-authored | Pre-existing; conventions §11 |
| engineering | docs/current-state.md | current-state | authored-now | Documentation Specialist | Statements match evidence.md; 223/223 count carried with as-of date | hand-authored | Pre-existing |
| engineering | docs/remaining-work-and-test-plan.md | current-state | authored-now | Documentation Specialist | 145-vs-223 drift fixed (X4 action, this run); O-items cross-referenced to plan §3.1 owners | hand-authored | Pre-existing; drift patch in x4-documentation.md §4.1 |
| enablement | docs/demo-plan.md | current-state | authored-now | Documentation Specialist | Click paths match the operator guide; Tier labels per screen | hand-authored | Pre-existing |
| engineering | AI-CODING-CONVENTIONS.md (repo root, v2) | current-state | authored-now | Overall Solution Architect | Gates wired and green (they are: check:sizes, check:all, pretest, CI, hook) | hand-authored | Binding standard, doctrine 10; v1 archived |
| engineering | AGENTS.md | current-state | authored-now | Overall Solution Architect | ≤150 lines; commands + repo map + read order current | hand-authored | Pre-existing (conventions §0) |
| engineering | src/lib/<domain>/README.md (existing modules, e.g. src/lib/policy/README.md) | current-state | authored-now | owning specialist per domain | Template §13.2 shape; ≤150 lines; updated with the module | hand-authored | Pre-existing per module |

## Executive and state program

| audience | document | stateLabel | class | owner | doneGate | generatedFrom | notes |
|---|---|---|---|---|---|---|---|
| executive | docs/executive/capability-brief.md | mixed-labeled | authored-now | Documentation Specialist | Extends D6; every capability carries its ledger tier | hand-authored | Written at D6 assembly (Phase 4) |
| executive | docs/executive/current-vs-target-ledger.md | mixed-labeled | authored-now | Documentation Specialist | Every row sourced to evidence.md; label audit passes | hand-authored | Full text: Annex 3B |
| executive | docs/executive/roadmap-one-pager.md | target-state | authored-now | Documentation Specialist | Phases match C9 P1/P2/P3 and the Phase-4 dependency order | hand-authored | Skeleton: Annex 3E.4 |
| executive | docs/executive/templates/quarterly-progress.md | target-state | build-gated | Documentation Specialist | Epic: first quarterly cycle. Done when first narrative issued from D1 sheet-3/4 coverage deltas, never from assertions | D1 coverage matrices | Template: §12, T5 |

## Engineering (new rows)

| audience | document | stateLabel | class | owner | doneGate | generatedFrom | notes |
|---|---|---|---|---|---|---|---|
| engineering | docs/onboarding.md | current-state | authored-now | Documentation Specialist | New engineer reaches green check:all from this doc alone; points to AI-CODING-CONVENTIONS.md as binding | hand-authored | Repo map, seam how-to, test strategy, demo-stays-green rules |
| engineering | docs/production-plan/adrs.md (D2) | target-state | authored-now | Solution Integration Architect | ADR-001..006 decided against the load model; migration seams named | hand-authored | Spine output, committed |
| engineering | docs/production-plan/contracts.md (D3) | target-state | authored-now | Solution Integration Architect | C1..C10 published; grep anchors conventions live | hand-authored | Spine output, committed |
| engineering | docs/api-reference/ (generated site or md) | current-state | build-gated | Pipeline + FHIR pair (generator); each route's owner (content) | Epic: API-reference wiring. Done when rendered from zod schemas via zod-openapi in CI; hand-written route docs fail review | src/lib/*/schema.ts | Covers the 21 existing routes first, then every new BFF route |
| engineering | docs/design/<engine>.md (per-engine design notes) | mixed-labeled | build-gated | owning specialist | Epic: each engine's build epic. Done with the engine: decisions, invariants, rejected alternatives | hand-authored | Template: §12, T3 |
| engineering | src/lib/<domain>/README.md (each NEW module) | current-state | build-gated | owning specialist | The module's epic DoD (conventions §16): README present, template shape, ≤150 lines | hand-authored | Template: conventions §13.2 |

## Operations / SRE

| audience | document | stateLabel | class | owner | doneGate | generatedFrom | notes |
|---|---|---|---|---|---|---|---|
| operations | docs/ops/runbook-framework.md | target-state | authored-now | Documentation Specialist | Skeleton per lane with named failure modes from golden-path hops; zero fictional commands | hand-authored | Skeleton: Annex 3E.1 |
| operations | docs/ops/observability.md | target-state | authored-now | Performance & Scalability Engineer | SLOs derived from load-model budgets; correlation-id doctrine stated | hand-authored | Skeleton: Annex 3E.2 |
| operations | docs/ops/runbooks/batch-dag-ops.md | current-state | build-gated | Pipeline + FHIR pair | Epic: first production DAG. Done when every step's failure path has been executed once (test or drill) and the commands are real | hand-authored | Template: §12, T2 |
| operations | docs/ops/runbooks/dlq-replay.md | current-state | build-gated | Agentic Systems Designer (stream lane) with Pipeline pair | Epic: backbone live (ADR-002). Done when a replay has been performed against a test topic with original eventIds preserved (C6) | hand-authored | T2 |
| operations | docs/ops/runbooks/backpressure-response.md | current-state | build-gated | Performance & Scalability Engineer | Epic: load-test gates (D4). Done when the documented response was exercised in a k6 run | hand-authored | T2 |
| operations | docs/ops/runbooks/hapi-cluster-ops.md | current-state | build-gated | Platform & Portability Engineer | Epic: HAPI posture per load-model §5. Done when failover + bulk-load window procedures executed clean | hand-authored | T2 |
| operations | docs/ops/runbooks/projector-rebuild.md | current-state | build-gated | Graph & Context Architect | Epic: rebuild-from-replay proof (ADR-001, DP-7). Done when a full rebuild from offset zero has run and the doc's commands are the ones used | hand-authored | T2; merge/unmerge rekey included |
| operations | docs/ops/runbooks/quarantine-remediation.md | current-state | build-gated | Pipeline + FHIR pair | Epic: staging tier (§4A stage 2). Done when a quarantined batch has been remediated end to end; PHI-safe reporting verified | hand-authored | T2; 30-day alarmed TTL stated |
| operations | docs/ops/runbooks/journey-workflow-ops.md | current-state | build-gated | Agentic Systems Designer | Epic: journey lane (Temporal, ADR-002). Done when stuck-workflow + escalation-SLA procedures exercised | hand-authored | T2; DP-3 escalation defaults |

## Deployment

| audience | document | stateLabel | class | owner | doneGate | generatedFrom | notes |
|---|---|---|---|---|---|---|---|
| deployment | docs/deploy/guide/ | target-state | authored-now (structure) | Platform & Portability Engineer | Structure renders from the D5 deploy.config.yaml schema; no hand-maintained copy of any generatable section | deploy.config.yaml | Doctrine 7/9; content stays target-state until first clean deploy |
| deployment | docs/deploy/environment-matrix.md | target-state | authored-now | Platform & Portability Engineer | Matrix matches ADR-004 layers (core/platform/app) x clouds (AWS, Azure first) | deploy.config.yaml | |
| deployment | docs/deploy/upgrade-rollback-template.md | target-state | authored-now | Platform & Portability Engineer | Template only; per-release instances are build-gated | hand-authored | T4 companion |
| deployment | docs/deploy/walkthroughs/aws.md | current-state | build-gated | Platform & Portability Engineer | Epic: AWS Terraform stack. Done when the stack first deploys clean and the walkthrough is the transcript of that deploy | hand-authored | T4 |
| deployment | docs/deploy/walkthroughs/azure.md | current-state | build-gated | Platform & Portability Engineer | Epic: Azure Terraform stack. Same gate | hand-authored | T4 |

## Compliance and audit

| audience | document | stateLabel | class | owner | doneGate | generatedFrom | notes |
|---|---|---|---|---|---|---|---|
| compliance | docs/compliance/posture.md | mixed-labeled | authored-now | Documentation Specialist | Grounded in tested consent/authz code; every target claim labeled; label audit passes | hand-authored | Full text: Annex 3C |
| compliance | docs/compliance/data-governance.md | mixed-labeled | authored-now | Documentation Specialist | C9 tier honesty scale explained; retention per DP-5 stated as target | hand-authored | Skeleton: Annex 3E.3 |
| compliance | docs/compliance/audit-evidence-catalog.md | current-state | build-gated | Solution Integration Architect | Epic: each control's build epic. A control enters the catalog only when its evidence is producible on demand (ADR-005 ledger query or O-5 report) | ADR-005 ledger + O-5 view-models | Populated as controls go live; O-5 pattern is the template |

## Enablement and field

| audience | document | stateLabel | class | owner | doneGate | generatedFrom | notes |
|---|---|---|---|---|---|---|---|
| enablement | docs/enablement/demo-operator-guide.md | mixed-labeled | authored-now | Documentation Specialist | Click paths verified against demo-plan.md; every screen carries its tier; honest-answer scripts match the ledger | hand-authored | Full text: Annex 3D |
| enablement | docs/enablement/capability-faq.md | mixed-labeled | authored-now | Documentation Specialist | Each FAQ answer traceable to a ledger row | hand-authored | Core Q&A inside Annex 3D §5 |
| enablement | docs/enablement/training/<module>.md | current-state | build-gated | owning specialist + Documentation Specialist | Epic: each engine's mock-replacement epic. Written when the engine replaces its mock (dual-mode green per C5) | hand-authored | T6 |

## Meta

| audience | document | stateLabel | class | owner | doneGate | generatedFrom | notes |
|---|---|---|---|---|---|---|---|
| engineering | docs/REGISTER.md (this file) | current-state | authored-now | Documentation Specialist | Register lint green (§11 checks); every doc under docs/ has a row; every row's doc exists or names its epic | hand-authored | The C8 artifact |
```

---

### Annex 3B. Current-vs-target honesty ledger (full text, `docs/executive/current-vs-target-ledger.md`)

```markdown
# ACE Platform: What Is Built Today vs What the Plan Builds

Audience: executive and state program. State label: mixed-labeled (every row labels
CURRENT and TARGET separately). Source of truth: the verified session evidence pack
(223/223 tests independently re-run in a clean environment). This document is the
plain-language twin of the engineering two-tier finding. It exists so that no demo
scene is ever mistaken for production capability, in either direction: real
engineering is not undersold, demonstration surface is not oversold.

## How to read this ledger

Every capability is graded on a four-value scale:

- **BUILT AND VERIFIED**: production-track code with passing tests. Real today.
- **BUILT, NOT YET VERIFIED**: real engineering exists but carries no tests. Per the
  house standard, "a capability without a green test is asserted, not verified."
- **DEMONSTRATION SURFACE**: the screen is real; the intelligence behind it is
  authored demonstration data. Nothing computes.
- **NOT YET BUILT**: absent, by design or by phase. The plan builds it.

Phases referenced: P1 Foundation (enrollment, claims, pharmacy feeds; durable
persistence). P2 Clinical + social streams (hospital events, clinical documents,
screening; graph and signal engine go live). P3 Full whole-person record.

## The ledger

| Capability | CURRENT (verified today) | TARGET (what the plan builds) | Phase |
|---|---|---|---|
| Identity matching | BUILT AND VERIFIED. A real matching engine links member records across sources using exact rules plus weighted probabilistic scoring (auto-link at 90, human review band at 60 to 90), with every decision audited. | Production identity semantics on top of the engine: source-ranked survivorship (which source wins per field), merge and unmerge of member records with full audit, provider identity anchored to NPI. | P1 |
| Consent enforcement | BUILT AND VERIFIED (pattern). The consent opt-out module is real, tested code: every change is attributed to an actor, never silent; access checks fail closed. It currently runs on an in-memory store. | The same tested pattern swapped onto a durable store, with purpose-scoped access on every read. The swap changes wiring only; callers are untouched. That swap discipline is itself the house pattern for productionizing every mock. | P1 |
| 42 CFR Part 2 (substance-use data protection) | NOT YET BUILT. No Part 2 segmentation exists in the code today. | Segmentation labels applied the moment data is normalized (never as a read-time afterthought), stored with the record, honored by every downstream consumer, with a second consent check at read time. SUD data flows exclusively through a segmented lane. | P2 labels; P3 full SUD lane |
| Prior authorization ("golden thread") | BUILT AND VERIFIED. The strongest engineering in the platform: orchestrator, stage machine, medical necessity evaluation, DTR questionnaire flow, backed by a real policy corpus (17 real payer policies, 19/19 accuracy anchors) and contract tests for the CMS-0057-F API shapes. | The same chain persisted durably (today its evidence lives in memory and does not survive a restart), driven end to end from member journeys, with gold-carding earned from real data. | P1 persistence; P2 journey integration |
| Network adequacy | BUILT AND VERIFIED (engine). Time/distance, provider ratios, wait-time, gap detection, augmentation modeling and an analyst copilot are real, tested computation. | The surrounding experience: four analytics dashboards, a county heatmap, a one-click compliance-readiness report, and integration so adequacy findings connect to referrals and prior auth. | P2 |
| Care plan generation | BUILT, NOT YET VERIFIED. A real 1,262-line generator across five modules produces plans from member context. It has zero tests; its clinical rigor is at rules/template level and is asserted, not verified. | A clinical acceptance oracle: physician-reviewed golden fixtures, safety invariants (no goal without an intervention, no intervention against an active contraindication, every recommendation cites its guideline), FHIR-conformant output, a full test suite. Until allergy data reaches coded quality, plans carry an explicit data-limitation flag. | P2 |
| Whole-person knowledge graph | DEMONSTRATION SURFACE. The graph screen renders an authored dataset of 52 nodes and 67 edges from an 804-line hand-built file. There is no graph database and no query execution. The five "lens" filters are labels, not queries. | A real graph, derived from the clinical record via events, answering those same five lenses as live queries against the member's actual data, rebuildable from the record at any time. The demo screen is kept and becomes the consumer of real results. | P2 |
| Signal Disposition Engine (coordinated outreach) | DEMONSTRATION SURFACE. The screen's results ("5 approved, 3 suppressed, 1 delayed, one coordinated touchpoint") are hardcoded. | A real engine deciding act / suppress / delay / bundle per member from live signals, under tunable policy held as data (contact caps, channel preference, consent scope), every decision explainable and audited. The demo screen's semantics are the acceptance test. | P2 |
| Agent coalition | DEMONSTRATION SURFACE. No agent runtime exists; scenes run on demo scenario data. | Three named agents (outreach, referral coordination, PA documentation), launched human-in-the-loop: they propose, humans approve in the existing work queue. Autonomy is per-agent configuration under governance, never a code change. | P2 first agents; P3 breadth |
| Data pipelines / record population | NOT YET BUILT. The clinical record contains 20 seeded resources shaped around one prior-auth journey. The rich member screens render from hardcoded files, not from the record. Pipeline-fed completeness today is zero. | Five-stage pipelines (land, validate, transform, load, propagate) for enrollment, claims, pharmacy, clinical documents, hospital events, screenings and community feeds, with quarantine, reconciliation and full provenance. Completeness is scored per domain on an honesty scale (coded data vs document-level vs claims-inferred) and reported only from the coverage matrix, never asserted. | P1 starts; P2/P3 deepen |
| Dashboards | DEMONSTRATION SURFACE. Numbers are computed inline per screen. | Dashboards read shared, precomputed view-models so screens and audit reports can never disagree. | P2 with G7 |
| Execution at scale | NOT YET BUILT (absent by design). The demo runs as a single dev process with in-memory state; no queues, no workers. The engines themselves are pure stateless functions, which is exactly the right shape for scale-out. | Three execution lanes (batch pipelines, event stream, durable journeys) sized by a published load model to county pilot (50K members) and state scale (7M members), with load-test gates before any scale claim. | P1 substrate; gates per phase |
| Cloud deployment | NOT YET BUILT. No infrastructure-as-code exists in any repo. | Terraform stacks for AWS and Azure first (Google fast-follow) driven by one configuration file; no proprietary cloud service in the core, so any hyperscaler is a target. | P1 onward |
| Verification base | BUILT AND VERIFIED. 223/223 unit tests across 33 suites, independently re-run; API contract tests; end-to-end browser tests; a live FHIR server in the demo stack. | The test base grows with every capability above; the demo walkthrough itself becomes an automated regression that blocks any change that would break it. | continuous |

## Three sentences to keep

1. The prior-auth golden thread, identity matching, consent enforcement, policy corpus
   and network adequacy engine are real, tested engineering today.
2. The knowledge graph, signal disposition, agent coalition and populated member
   record are today a faithfully designed demonstration of the target experience;
   the plan builds the engines behind those exact screens without breaking the demo.
3. Nothing in this program reports progress by assertion: completeness is scored
   against the published record-coverage matrix and the 16-step journey trace
   (steps currently RECONSTRUCTED pending re-supply of the source workbook), and a
   capability counts as built only when its tests are green.
```

---

### Annex 3C. Compliance and audit posture statement (full text, `docs/compliance/posture.md`)

```markdown
# ACE Security, Privacy and Audit Posture

Audience: compliance and audit. State label: mixed-labeled; every paragraph is
tagged CURRENT (verified in tested code) or TARGET (designed, binding on the build,
not yet implemented). Grounding rule: CURRENT claims cite tested code only; the
verified base is 223/223 unit tests across 33 suites plus route-level authorization
tests. No target control is presented as operating today.

## 1. Consent model

CURRENT. Consent enforcement exists as real, tested code in the provider-access
opt-out module (`src/lib/consent/providerAccessOptOut.ts`), which is the platform's
reference implementation for a swappable data source:
- Every consent state change requires an attributed actor; an unattributed change
  is rejected (the code throws when `recordedBy` is absent). Changes carry
  timestamps and an optional reason. Nothing is silent.
- Access checks fail closed and are exercised by tests: an opted-out member's
  provider-access read path returns 403 with a PHI-safe body.
- Absence of a consent record is a defined default, never an error, so behavior
  is deterministic and testable.
- The store behind the interface is in-memory today. This is a demo-mode store
  behind a production-shaped interface, by design.
CURRENT. A FHIR Consent resource is seeded for the demo member.

TARGET (P1). The in-memory store swaps for a durable store behind the same tested
interface (the platform's first production store swap follows this exact template).
TARGET (P1 onward). Every person-context read is scoped by requestor purpose plus
the member's consent state, enforced server-side before any data assembly; sections
a purpose does not justify are omitted, not blanked (contract C1).

## 2. 42 CFR Part 2 segmentation

CURRENT. Not implemented. No Part 2 segmentation, labeling or SUD-specific handling
exists in the codebase today. This document says so plainly because retrofitting
segmentation is a rebuild; it is therefore designed in from the start.

TARGET (P2 labels, P3 full lane), binding on the build:
- Segmentation labels are applied at transformation time, the moment inbound data
  is normalized, and become a property of the data itself; they are never a
  read-time afterthought (pipeline reference architecture, stage 3).
- Every domain event carries a consent context (`part2Restricted`, segment labels)
  in its envelope, so downstream consumers can honor restrictions by envelope
  inspection alone, without parsing clinical payloads (contract C2).
- Part 2 content projects into derived stores (graph, signals) only as restricted
  entries; consumers without Part 2 clearance never receive it.
- A second consent check runs at read time on top of the stored labels (C1).
- SUD data flows exclusively through the segmented lane; it is never surfaced to
  signals or agents without a consent check at read time.

## 3. Identity integrity

CURRENT. The identity match engine is tested production-track code: deterministic
rules short-circuit at exact match; probabilistic scoring uses declared weights;
thresholds are explicit (auto-link 90, human-review band 60 to 90); match decisions
are audited. Records in the uncertain band are held for human review rather than
guessed.

TARGET (P1). Survivorship (source-ranked golden values with per-field provenance,
rules held as configuration), merge/unmerge as audited events with downstream
stores rekeyed by replay (never in-place rewrites), and NPI-anchored provider
identity under the same discipline.

## 4. Provenance

CURRENT. Not pipeline-fed. The seeded record carries no load provenance because no
pipelines exist; the seed script is the only populator.

TARGET (P1 onward). Every pipeline load writes a FHIR Provenance resource in the
same transaction as the data it describes; raw inbound files are retained
immutably in a cataloged landing zone (checksummed, batch-tagged; default
retention 7 years, configurable per audit policy); every stored fact remains
source-attributed so the golden view can be recomputed under changed rules
without data loss.

## 5. Audit trails

CURRENT. The application emits PHI-safe audit events for privileged actions as a
coding invariant (references, codes and counts; never names, DOBs or free-text
clinical content), and this PHI-safety is asserted in BFF route tests. Route-level
authorization behavior (401/403) is tested. The evidence store behind the golden
thread is in-memory today: audit content is real but does not survive a restart.

TARGET (P1, ADR-005). An append-only evidence ledger (durable, ordered, attributed,
correlation-id-linked, PHI-safe) becomes the system of record for audit; record-
affecting entries are additionally projected as FHIR Provenance/AuditEvent, derived
from the ledger and rebuildable, never written independently. One member journey is
then traceable end to end: landed file, staging validation, identity resolution
(rule named), record load, event publication, every downstream decision (each
naming the policy that fired), each entry attributed and timestamped.

## 6. Access architecture

CURRENT, tested and enforced as a coding invariant: the browser calls only the
application's own API routes (BFF-only); engines are never exposed directly; no
secrets ship to the client; strict server-side typing with schema parsing at
boundaries. AI features in the codebase follow six guardrails: server-side only,
deterministic-first, human-gated, PHI-safe, labelled as decision-support, feature-
flagged with graceful degradation.

TARGET. The same invariants carried into every new surface, enforced by wired
gates (CI convention gates are live today; boundary lint lands per the tooling
roadmap).

## 7. Conformance honesty

CURRENT. The platform's offline demo behavior is never cited as regulatory
conformance. CMS-0057-F API shapes are exercised by Newman contract tests against
the demo stack; formal conformance is an Inferno / Da Vinci activity governed by
docs/conformance-plan.md and remains gated on backbone infrastructure.

## 8. What an auditor can verify today

1. Run the test suite: 223/223 across 33 suites, including consent opt-out
   behavior, authorization guards, PHI-safe response bodies and match-engine
   decisions.
2. Read the consent module and confirm attributed-mutation enforcement in code.
3. Confirm the two-tier honesty discipline in the repo's own documentation:
   demonstration surfaces are labeled as such; a capability without a green test
   is treated as asserted, not verified.
4. Confirm this document's TARGET items appear as gated acceptance criteria in
   the build plan (register: docs/REGISTER.md), not as claims of current operation.
```

---

### Annex 3D. Demo operator guide core (full text, `docs/enablement/demo-operator-guide.md`)

```markdown
# ACE Demo Operator Guide

Audience: enablement and field. State label: mixed-labeled (CURRENT describes the
demo as it runs today; TARGET describes what the build plan delivers). Companion:
the executive honesty ledger (docs/executive/current-vs-target-ledger.md); the
per-screen click detail lives in docs/demo-plan.md. This guide's job is that every
operator can run the demo safely and answer "is this built?" honestly in one breath.

## 1. The one rule

Never claim computation where there is presentation. The demo is honest by design:
Tier-A screens run real, tested engines; Tier-B screens present authored data that
shows the target experience. Both are legitimate to show; only mislabeling them
is a failure. When in doubt, use the scripts in §5.

## 2. The two tiers, operator's version

- LIVE ENGINE (Tier A): identity matching, consent opt-out, prior-auth golden
  thread (stages, medical necessity, DTR), policy corpus, network adequacy engine
  plus its analyst copilot, FHIR validation. These compute in real time against
  the seeded FHIR server; you can safely deviate from the script, retry inputs
  and let the audience drive.
- PRESENTATION (Tier B): whole-person knowledge graph, Signal Disposition Engine,
  agent coalition scenes, dashboards, the rich member-record screens. These render
  authored demonstration data. Stay on the click path; the depth is authored, so
  off-path exploration finds edges (an unauthored member, an empty drill-down).

## 3. Safe click paths (four-act arc)

Act I, Fragmented (journey steps 1 to 4):
- Identity resolution scene: LIVE ENGINE. The match engine really scores; the
  90/60 thresholds and the human-review band are real. Safe to re-run.
- Consent scene: LIVE ENGINE. Opt-out really flips access; the 403 is computed,
  not staged. Safe to toggle live if the script calls for it.
- Record view: LIVE SERVER, SPARSE RECORD. A real FHIR server holds ~20 seeded
  resources shaped around one prior-auth journey. CURRENT: do not free-navigate
  into record areas beyond the script (allergies, immunizations, encounters are
  not populated). TARGET: pipelines populate these domains in phases.

Act II, Coordinated (steps 5 to 8):
- Care gaps, SDOH screening, knowledge graph, Signal Disposition Engine:
  PRESENTATION. The graph's 52-node view and the SDE's "5 approved, 3 suppressed,
  1 delayed, one coordinated touchpoint" result are authored. Present them as the
  designed target experience; the SDE result is literally the engineering
  acceptance shape for the real engine. Stay on path.

Act III, Provable (steps 9 to 13):
- Care plan: REAL GENERATOR, UNVERIFIED. The plan on screen is computed by real
  code. If asked about clinical rigor, use script Q4; do not claim clinical
  validation.
- Referral + network adequacy: LIVE ENGINE for adequacy computation and copilot;
  the dashboard-style views around it are PRESENTATION.
- Prior authorization: LIVE ENGINE, the strongest scene in the demo. Audience
  members can drive it. Evidence chain caveat: CURRENT, evidence lives in memory
  for the session; TARGET, a durable ledger.
- Results flowing back / loop closure: PRESENTATION.

Act IV, Connected (steps 14 to 16):
- Agent coalition follow-up: PRESENTATION. No runtime exists. Emphasize the
  governance design: agents will launch human-in-the-loop, proposing into the
  same work queue the audience saw in Act III.
- Outcomes and measures: PRESENTATION.
- Financial reconciliation / golden thread close: LIVE ENGINE against seeded
  claims data.

## 4. The Mock Data toggle

CURRENT: a Mock Data toggle exists in the demo shell. For the rich member-record
screens it does not switch to live data, because no live pipeline source exists
yet; authored data is their only source. Leave the toggle ON for audiences.
The Tier-A scenes compute regardless of the toggle.
TARGET: the toggle becomes the platform's seam switch. As each engine lands behind
its interface, its screen must render correctly with the toggle ON (authored mode,
kept forever) and OFF (live mode), enforced by an automated dual-mode regression
that blocks any merge that breaks either mode. The list of seamed screens will be
a checked-in registry; until a screen appears there, assume OFF is not supported.

## 5. Honest answers to "is this built?"

Three formulations. Pick by tier, deliver without hedging:

- LIVE ENGINE: "Yes. That's tested production-track code; what you saw was
  computed just now. The remaining work for this capability is scale-out and
  durable persistence, not the engine."
- REAL BUT UNVERIFIED: "The engine is real; what you saw was computed. Its
  verification suite is part of the current build plan, and until that is green
  we treat its rigor as asserted rather than proven. That's our own standard."
- PRESENTATION: "That screen shows the designed target experience with authored
  data; the engine behind it is in the build plan. The screen you saw is kept
  as-is and becomes the consumer of the real engine, which is how we guarantee
  the demo never breaks while we build."

Per-capability quick answers:

- Q1 "Is the knowledge graph real?" "The visualization is real; the data behind
  it is authored (52 nodes, hand-built) and there's no graph database today. The
  plan derives the real graph from the clinical record, answering these same five
  lenses as live queries."
- Q2 "Does the Signal Disposition Engine work?" "The decision result on that
  screen is authored today. It's also the exact acceptance test for the real
  engine: act, suppress, delay, bundle per member under policy held as data."
- Q3 "Are the agents autonomous?" "No, and they won't start that way. There is
  no agent runtime today. The first three agents launch human-in-the-loop:
  they propose, a person approves. Autonomy is a governed configuration setting,
  never a code change."
- Q4 "Is the care plan clinically validated?" "The generator is real code, about
  1,300 lines. It has no test suite yet, so by our own standard its rigor is
  asserted, not verified. The build plan adds physician-reviewed fixtures and
  safety invariants before we claim more."
- Q5 "Is this the member's full record?" "No. Today's record is a seeded slice
  around one prior-auth journey, about 20 resources. The rich screens you saw
  are authored. Record completeness gets built and scored domain by domain on a
  published coverage matrix; we'll never claim it, we'll show the score."
- Q6 "Does it scale?" "The engines are stateless pure functions, which is the
  right architecture for scale. The runtime substrate (queues, workers, durable
  workflows) doesn't exist yet; it's the first thing the plan builds, with
  load-test gates before any scale claim."
- Q7 "Is it CMS-0057-F conformant?" "We exercise the API shapes with contract
  tests today. Formal conformance is a gated activity we have deliberately not
  claimed; our own docs forbid citing offline behavior as conformance."
- Q8 "Is prior auth real?" "Yes, end to end: orchestration, medical necessity,
  DTR, against 17 real payer policies, all tested. It's the strongest engineering
  in the platform today."
- Q9 "Is substance-use data protected under Part 2?" "Not yet; that code doesn't
  exist today and we won't pretend otherwise. It's designed in from the start of
  the pipeline build: data is labeled the moment it enters, and restrictions
  travel with it everywhere."

## 6. Never say

- Never present a Tier-B screen's numbers as computed.
- Never claim regulatory conformance from demo behavior.
- Never claim document-level or claims-inferred data as coded clinical data
  (the record honesty scale forbids it).
- Never say "the AI decided"; every AI feature is decision-support, labeled,
  human-gated, with a deterministic fallback.
- Never improvise an answer about compliance; hand off to the posture statement
  (docs/compliance/posture.md).
```

---

### Annex 3E. Authored-now skeletons (structure real, content gated)

State label for all of 3E: target-state skeletons. They contain named failure modes and structure only, zero fictional commands; the full documents are build-gated per the register.

**3E.1 `docs/ops/runbook-framework.md` (skeleton).** One runbook per operational surface, template T2 (§12). Framework sections per lane, with failure-mode inventory derived from the golden path:

| Lane | Runbook | Failure modes to cover (named now, procedures written when the lane lands) |
|---|---|---|
| Batch (DAG) | batch-dag-ops | step failure + retry with idempotency key; reconciliation gate mismatch (in != loaded + rejected, alarmed); landing catalog gap; $validate rejection spike; 4h window breach |
| Batch (staging) | quarantine-remediation | quarantine growth alarm; 30-day TTL expiry; PHI-safe rejection report handling; remediate-and-replay flow |
| Stream | dlq-replay | DLQ depth alarm; replay preserving original eventIds (idempotent consumers stay safe); poison message isolation |
| Stream | backpressure-response | consumer-lag SLO breach; batch-window lag exemption vs 1h post-window catch-up alarm; partition hot-spotting |
| Stream | projector-rebuild | full rebuild from offset zero; merge/unmerge rekey-by-replay; rebuild-vs-serve cutover |
| Journey | journey-workflow-ops | stuck workflow; escalation SLA breach (per-priority defaults, then care-team hierarchy, then audited park); timer storm |
| Store | hapi-cluster-ops | node failover; bulk-load window posture; Postgres connection-pool exhaustion |
| Identity | unmatched-work-queue | 60..90 band backlog; blocking-key candidate-cap alarm |

**3E.2 `docs/ops/observability.md` (skeleton).** SLOs are the load-model budgets, restated verbatim as monitors: person-context read p95 <= 300ms; graph lens p95 <= 2s; signal to disposition p95 <= 5s; ADT receipt to signal p95 <= 60s; 834 landed to loaded <= 4h; dashboard view-model read p95 <= 1s; consumer lag as a first-class SLO per projector group. Instrumentation doctrine: structured logging via the log interface only, correlation id minted at landing or BFF entry and propagated through every hop (the golden path's `corr-*` id is the worked example); engines expose counters/timings through the same interface; dashboards consume metric projections, never inline aggregation.

**3E.3 `docs/compliance/data-governance.md` (skeleton).** Sections: the C9 tier honesty scale explained for auditors (T1 coded / T2 document / T3 claims-inferred / T0 absent; T2/T3 never reported as T1); source-to-domain yield map (C9.2); retention (landing raw 7 years default configurable, quarantine 30-day alarmed TTL) labeled TARGET; single-tenant-per-state isolation posture; data-is-not-code (authored datasets live in versioned data files); the coverage matrix (D1 sheet 3) as the only completeness claim permitted.

**3E.4 `docs/executive/roadmap-one-pager.md` (skeleton).** Phases P1/P2/P3 in ledger language; the build order sentence (durable persistence + pipelines first, then graph, then signals, then adequacy experience, then integration, then care plan content, then agent runtime, proven by accessibility + test build-out); completeness reported only as coverage-matrix and trace-matrix scores.

---

## 4. Build Approach and Reuse Map

Reused (existing, named): the entire existing `docs/` tree (absorbed as register rows, updated in place, never forked); conventions v2 §13.2 README template (reused verbatim as T1); the conventions' Tier-A/Tier-B language (reused as the ledger's grading scale); `docs/demo-plan.md` (the operator guide defers click detail to it); the D2/D3 spine artifacts (cross-referenced, not restated); the O-5 compliance-report pattern (named as the audit-evidence-catalog template).

New, in order:
1. **Drift fix first** (§4.1): smallest change, immediate honesty payoff.
2. `docs/REGISTER.md` committed (Annex 3A).
3. Authored-now set committed (Annexes 3B, 3C, 3D, 3E) under the paths the register names.
4. Register lint + label audit checks wired (§11) so the register is enforced, not aspirational (gates over prose).
5. Build-gated templates handed to specialists (§12) for embedding in their epics.
6. Generation wiring (API reference spike, §14) lands with the Pipeline pair's first schema work.

### 4.1 The exact edit: 145-vs-223 drift in `docs/remaining-work-and-test-plan.md`

Constraint noted: this file lives in the canonical repo (`C:\GBS\Clients\State of NY\Finalrhtpdemo`), not in the staged working copy (verified absent from `/home/claude/diligence`). The edit is therefore specified as a verified-pattern patch; the applier confirms match count before applying.

Step 1, locate every occurrence:

```bash
rg -n "145" docs/remaining-work-and-test-plan.md
```

Step 2, apply, covering both known claim shapes:

- Wherever the count appears as a bare figure in prose (expected shape: `145 passing vitest tests` or `145 vitest tests passing`), replace the sentence's count claim with:

  `223 passing vitest tests across 33 suites (measured 2026-08 in an independent clean-environment run; update this figure only from a fresh vitest run, never by hand-projection)`

- Wherever the count appears as a ratio (possible shape: `145/145`), replace with:

  `223/223`

  and ensure the nearest sentence carries the same as-of parenthetical once (do not duplicate it per occurrence).

Step 3, guard against recurrence (doctrine 9, generatable content): append this line to the section that states the count:

  `Test-count figures in this document are measured values with an as-of date. A build-gated action (register row: docs/api-reference epic family) moves this count to a CI-generated badge so it can never drift again.`

Step 4, verify: re-run the Step-1 search; zero remaining `145` occurrences that refer to test counts (an occurrence of 145 in any other meaning, e.g. a line number, is left alone; the applier judges from context, which is why this patch names the claim, not just the digits).

Register linkage: the absorbed row for `remaining-work-and-test-plan.md` (Annex 3A) carries this fix as its done-gate.

---

## 5. File-Level Touchpoints

All new files are documentation under `docs/`; no production source files are touched by X4. No file exceeds any cap that applies (docs are not production code; feature READMEs, where X4 templates them, are capped at 150 lines per conventions §13.2).

New files this run: `docs/REGISTER.md`; `docs/executive/current-vs-target-ledger.md`; `docs/executive/roadmap-one-pager.md` (skeleton); `docs/compliance/posture.md`; `docs/compliance/data-governance.md` (skeleton); `docs/enablement/demo-operator-guide.md`; `docs/enablement/capability-faq.md` (extracted from Annex 3D §5); `docs/ops/runbook-framework.md` (skeleton); `docs/ops/observability.md` (skeleton); `docs/onboarding.md`; `docs/deploy/environment-matrix.md` + `docs/deploy/upgrade-rollback-template.md` (skeletons); template files under `docs/templates/` (T1..T9, §12).

Edited files: `docs/remaining-work-and-test-plan.md` (§4.1 patch only); `docs/ARCHITECTURE.md` (as-is + target seam markings, update-in-place per D7; content contributed at Phase 4 from spine artifacts, never forked). Data externalization: not applicable (no code); the register itself is the single source of truth for doc state, honoring single-source-of-truth discipline.

---

## 6. Golden-Path Participation

Per golden-path.md's participation map, X4 owns the evidence-chain narrative plus runbook skeletons for every hop's failure mode.

- Inputs at my hops: the hop-9 ledger chain (`pipeline.landed` through `care-plan.updated`, one correlation id) as published in golden-path.md; the per-hop failure modes implied by stages 1..5 and the projector/consumer hops.
- Outputs: (1) the compliance posture §5 TARGET narrative renders that exact chain in auditor language (Annex 3C, "one member journey is then traceable end to end"); (2) the runbook framework (Annex 3E.1) enumerates a named failure mode for every hop: hop 1 landing catalog gap, hop 2 quarantine flows, hop 3 unmatched-work-queue backlog + terminology unmappables (quarantined per entry), hop 4 reconciliation mismatch + $validate rejection, hop 5 relay/DLQ/replay + projector rebuild, hop 7 disposition policy audit, hop 8 work-queue review flow, hop 9 ledger query for audit.
- Payload-level statement: my artifacts consume the golden path's published JSON shapes as citations (correlation id `corr-a1c-journey-0042` is the worked example named in the observability skeleton); they emit no runtime payloads. A documentation deliverable that could not narrate this path would be incomplete; all three full-text annexes reference it.

---

## 7. Contracts Touched

| Contract | Touchpoint |
|---|---|
| C8 | Owned in full: the register (Annex 3A) is the C8 artifact; schema honored with one additive `notes` column per the evolution rule |
| C5 | The operator guide §4 states the dual-mode toggle contract in operator language and defers the seam list to `tools/demo-green/seams.json`; enablement training docs are gated on dual-mode green |
| C9 | The ledger and data-governance skeleton carry the tier honesty scale verbatim; T2/T3 never as T1 is restated as an operator "never say" |
| C1 | Posture statement §1 TARGET restates the consent-enforcement statement (purpose scoping, omitted-not-blanked) |
| C2 | Posture statement §2 cites the envelope's consentContext for Part 2 (envelope inspection, not payload parsing) |
| C6 | DLQ replay runbook row (original-eventId preservation) |
| C3 | Posture §1 and the ledger's consent row describe the seam-swap discipline as the productionization template |

Grep anchors: documentation does not carry code anchors; the register's `generatedFrom` column plays the equivalent role (rg the register for any source path to find its dependent docs). Code-side anchors (`SEAM:`, `CONTRACT:`) are named in the onboarding doc as the discovery mechanism.

---

## 8. Scale Posture

X4 ships no runtime component; scale posture is about the documentation system itself. Throughput: register lint, label audit and generated-doc freshness checks run in CI per PR alongside the existing convention gates; cost is seconds, no budget impact. Partitioning/idempotency/backpressure: not applicable; stated rather than silently skipped. Budgets: the observability skeleton restates all six DP-5 budgets verbatim, unmodified (no re-derivation attempted; that is spine-only).

---

## 9. Portability Posture

Zero protocol dependencies. All documentation is markdown in the repo, versioned with the code, rendered by CI tooling that runs in the container runtime already permitted by C7. The deployment guide depends on `deploy.config.yaml` as its generation source, which is exactly the doctrine-7 design; no hyperscaler-specific content lives outside the per-cloud walkthroughs, which are explicitly per-cloud by definition and build-gated on each stack's first clean deploy.

---

## 10. Convention Compliance

- File split: documentation files only; the one code-adjacent template (feature README, T1) enforces the conventions §13.2 cap of 150 lines.
- BFF route surface: none added.
- AI-guardrail posture: no AI features shipped by X4. The operator guide and posture statement restate the six guardrails as claims discipline ("never say the AI decided").
- Determinism: not applicable to prose; the drift patch (§4.1) makes the one nondeterministic prose value (test count) a dated measured value with a path to CI generation.
- Traceability rows: X4 adds rows to `docs/traceability.md` for its own checkable capabilities: register lint check, label audit check, docs-stay-current check, each with its test/check named (§11).
- DoD gates: each X4 epic's acceptance criteria are its register done-gates plus the §11 checks green.
- Ratchet: no code files touched; baseline unaffected.

---

## 11. Acceptance Tests

Named checks (wired as CI steps next to the existing convention gates; small scripts under `tools/docs/`):

1. `docs-register-lint`: every row parses against the C8 schema (audience in enum(6), stateLabel in enum(3), class in enum(2), owner non-empty and not "team", doneGate non-empty, generatedFrom non-empty); every file under `docs/` has a register row; every register row's document exists on disk or its doneGate names an epic.
2. `docs-label-audit`: every document under `docs/` opens with an audience line and a state label line; every `mixed-labeled` document contains at least one CURRENT and one TARGET marker; the ledger and posture statement contain zero unlabeled capability claims (heuristic: capability nouns from the ledger's row list must appear within a labeled block).
3. `docs-freshness-generated`: for every register row whose generatedFrom is a source path, regenerate and diff; a dirty diff fails (starts enforcing per source as each generator lands; the register row's class gates it).
4. `docs-stay-current`: PR-level check per C8: a diff touching a `SEAM:` anchor, a `CONTRACT:` anchor or `deploy.config.yaml` without a diff under `docs/` fails with the register row(s) named.
5. `docs-readme-cap`: every `src/lib/*/README.md` <= 150 lines (joins the size gate).
6. Drift-fix verification: the §4.1 Step-4 search returns zero test-count occurrences of 145.
7. Manual, per release: operator-guide click paths replayed against the C5 walkthrough suite's scene list; a scene the guide does not cover, or a guide path the suite does not exercise, is a finding.

---

## 12. Docs-Done Entries

### 12.1 X4's own register rows

All Annex 3A rows owned by "Documentation Specialist" are X4 epics; their doneGate column is the acceptance criterion. Epic grouping: E-X4-1 register + checks (rows: REGISTER.md plus §11 wiring); E-X4-2 authored-now set (rows: ledger, posture, operator guide, FAQ, onboarding, skeletons); E-X4-3 drift fix (row: remaining-work-and-test-plan.md); E-X4-4 template pack (this section's T1..T9 committed under `docs/templates/`).

### 12.2 Templates (the build-gated pack, committed under `docs/templates/`)

- **T1 Feature README** (= conventions §13.2, restated so specialists embed one reference): sections `purpose / public surface / invariants / what an agent may change freely / what an agent must never change / test commands`; <= 150 lines; updated in the same PR as the module.
- **T2 Runbook**: header (audience: operations; stateLabel; owning role; last-drilled date) then `symptom / detect (alert or query, real) / assess (blast radius, data-loss risk) / respond (numbered commands actually executed at least once) / verify (the check that says done) / escalate (role, not name) / evidence (ledger entries this incident writes)`. Rule: a runbook may not merge with placeholder commands; until then it stays a framework row (Annex 3E.1).
- **T3 Per-engine design note**: `context and load assumptions / decisions with rejected alternatives / invariants (grep anchors listed) / seam surface / failure modes feeding T2 / test map (unit, property, contract)`. Mixed-labeled by construction.
- **T4 Per-cloud deployment walkthrough**: generated skeleton from `deploy.config.yaml` (layer by layer per ADR-004: core, platform, app) plus hand-authored verification checkpoints; done-gate: the walkthrough is the transcript of the first clean deploy, re-verified per release.
- **T5 Quarterly progress narrative**: `coverage delta (D1 sheet 3: domain x tier movements) / trace-matrix delta (sheet 4: steps newly running on real engineering) / ledger rows that changed grade / risks and blockers (GB items) / next quarter's gated claims`. Rule: no progress statement without a matrix delta behind it.
- **T6 Training walkthrough (per module)**: `what changed from the demo (mock replaced by engine) / dual-mode behavior (toggle ON vs OFF) / new operator answers (FAQ deltas) / hands-on exercise against the live seam`. Gated on C5 dual-mode green for the module's screen.
- **T7 Audit-evidence-catalog entry**: `control / evidence source (ledger query or O-5 report id) / producible-on-demand proof (the query, run) / owning role / review cadence`. A control without a runnable evidence query does not enter the catalog.
- **T8 API-reference generator spec**: zod-openapi over `src/lib/*/schema.ts`, rendered in CI; the doc page carries route, schema-derived request/response, auth posture (401/403 behavior as tested), PHI-safety note. Hand-written route pages fail `docs-freshness-generated`.
- **T9 Agent page (generated from manifest)**: name, purpose, tool allowlist, autonomy tier, escalation gates, PHI posture, owning module, eval-suite link; rendered from the conventions §10.2 manifest, never transcribed.

### 12.3 Per-specialist docs-done packages (embed verbatim in your §12 and epic acceptance criteria)

Common gate, every epic, all specialists (add to the epic's DoD):
1. Feature README (T1) per new `src/lib/<domain>` module.
2. `docs/traceability.md` row(s): capability, code path, test file, backbone-gated marked.
3. API-reference entries for any new BFF route arrive by schema (T8), never hand-written.
4. Register updated: your build-gated rows' doneGates re-checked; a row's stateLabel claims flip only on gate-met.
5. If the epic replaces a mock: operator guide + FAQ delta (the honest answer changes) and a T6 training walkthrough; ledger row regrade proposed to the Documentation Specialist with the green test named.
6. If the epic adds a failure mode: its T2 runbook (or framework row, if the surface is not yet operable).

**Graph & Context Architect (G1):**
- Build-gated rows you own: `docs/design/graph.md` (T3, done with the projector epic); per-domain graph mapping spec pages generated from the mapping spec data (C10.2 format; hand-written copies forbidden); `docs/ops/runbooks/projector-rebuild.md` (T2; done-gate: full rebuild from offset zero executed, merge/unmerge rekey included); D3 screen dual-mode note in the operator guide (delta per §12.3 common gate 5).
- Docs-done criteria to embed: mapping spec pages regenerate clean in `docs-freshness-generated`; the five lens acceptance queries documented with their real result shapes; Part 2 restricted-node handling documented in the posture statement's §2 TARGET terms (propose the delta, X4 merges it).

**Pipeline + FHIR pair (G3 + X2):**
- Build-gated rows you own: per-adapter design notes (T3, one per source: 834, 837/835, pharmacy, CCD/QE, ADT, screening, referral webhook, CBO flat file); DAG documentation generated from DAG definitions (ADR-003, DAGs are data); `docs/ops/runbooks/batch-dag-ops.md` + `quarantine-remediation.md` (T2); the T8 generator wiring epic (you own the first schemas); coverage-matrix (D1 sheet 3) publication as a generated artifact, never hand-scored.
- Docs-done criteria to embed: every adapter note states its C9 yield (domain @ tier) and its reconciliation thresholds; the drift lesson applied: any count your docs state (records loaded, rejection rates) is generated or dated-measured, never hand-projected; "WPC screens render from the record, mock toggle off" lands as operator guide + ledger regrades for the record row (biggest honesty payoff in the program; coordinate the regrade with X4).

**Agentic Systems Designer (G2 + G4):**
- Build-gated rows you own: `docs/design/sde.md` and `docs/design/agent-runtime.md` (T3); disposition-policy reference generated from policy data (DP-2; a hand-written policy list fails freshness); T9 agent pages for the three named agents, generated from manifests; `docs/ops/runbooks/dlq-replay.md` + `journey-workflow-ops.md` (T2); eval-suite documentation per prompt (conventions §10.1).
- Docs-done criteria to embed: every disposition decision's explainability documented as the audit story (which policy fired, ledger entry shape); escalation defaults (SLA per priority, hierarchy, audited park) documented in the runbook, not only in code; the operator guide Q2/Q3 answers regrade when the SDE and first agents go live, with the acceptance-shape screen cited as the passing test.

**Care Plan pair (G5):**
- Build-gated rows you own: `docs/design/care-plan.md` (T3, covering the builder/validator/templates split); the acceptance-oracle documentation (golden fixtures with SME sign-off record per GB-3, property invariants listed, guideline citation source list); data-limitation flag documentation (the allergy honesty note from C9.4, in clinician-readable language); T6 training walkthrough when the plan surface goes dual-mode.
- Docs-done criteria to embed: O-7 content pages carry the not-SME-reviewed flag until GB-3 sign-off, visibly, in the rendered doc; the ledger's care-plan row regrades from "built, not yet verified" only when the oracle suite is green (name the suite in the traceability row); fixture provenance (who signed, when) is part of the fixture file, surfaced in the doc, never a separate spreadsheet.

**Spine/platform owners (X1 substrate, X3 deployment, for the finalizer to route):**
- Build-gated rows: `docs/ops/runbooks/backpressure-response.md`, `hapi-cluster-ops.md` (T2); `docs/deploy/walkthroughs/aws.md`, `azure.md` (T4); observability doc graduation from skeleton to current-state when monitors exist.
- Criteria: walkthroughs are deploy transcripts (gate as in Annex 3A); SLO monitors documented with their query, not their intent.

---

## 13. Effort S/M/L with Assumptions

| Epic | Effort | Assumptions |
|---|---|---|
| E-X4-1 register + §11 checks | S | ASSUMPTION: check scripts are plain node/bash in `tools/docs/`, joining the existing CI workflow; no new infra |
| E-X4-2 authored-now set (commit annexes to their paths, extract FAQ, onboarding doc) | S | Content is written here; remaining work is placement plus the onboarding doc. ASSUMPTION: demo-plan.md scene names reconcile with Annex 3D acts without rewrites |
| E-X4-3 drift fix | S | ASSUMPTION: the 145 claim appears <= 3 times in the file; applier has repo access |
| E-X4-4 template pack T1..T9 | S | Templates as specified in §12.2 |
| T8 generator wiring (with Pipeline pair) | M | ASSUMPTION: zod-openapi is compatible with the repo's zod version; spike SP-X4-1 answers this before commitment |
| Phase-4 assembly duties (ledger + posture label audit across all D7 docs) | M | Runs inside the finalizer's QA per plan §7 Phase 4 |

---

## 14. Spike Tickets

- **SP-X4-1 zod-openapi feasibility (timeboxed).** Question: does zod-openapi (or zod-to-openapi) render the repo's existing `schema.ts` shapes, including discriminated-union Result shapes, into a usable reference without schema rewrites? Output decides T8's generator choice.
- **SP-X4-2 docs-stay-current diff heuristic.** Question: can the §11 check 4 mapping (anchor diff to register row) be derived mechanically from `generatedFrom` plus a small anchor-to-doc map, or does it need per-row declared watch paths? Output: the check's config format.
- **SP-X4-3 label-audit heuristic strength.** Question: what false-positive rate does the §11 check 2 capability-noun heuristic produce on the committed annexes? Output: keep, tune, or demote to advisory.

---

## 15. Risks

1. **Fiction creep (highest).** Build-gated docs drift into authored-now prose as specialists document ahead of their builds. Mitigated by C8 done-gates + the T2 "no placeholder commands" rule + the adversarial documentation axes (doc bloat, target-state prose passable as current-state). Escalation: adversarial reviewer flags, mechanical re-run trigger.
2. **Ledger misuse in sales.** The honesty ledger quoted selectively (TARGET column read as roadmap commitment or CURRENT rows stripped of grade). Mitigated by the "three sentences to keep" block and the operator "never say" list; the RFI response stays a sales artifact outside the register. Escalation to owner if a derivative sales doc quotes the ledger without labels.
3. **Register rot.** The register stops matching the tree once five specialists commit docs. Mitigated by §11 checks 1 and 4 running per PR; the register is enforced, not curated.
4. **RECONSTRUCTED trace steps harden into fact.** Ledger and roadmap cite trace-matrix rows that are RECONSTRUCTED; if the owner's workbook differs, executive documents inherit the drift. Mitigated: the label travels into Annex 3B's closing sentence; reconciliation is a named follow-up when the workbook is re-supplied (phase0 item 6).
5. **Count drift recurs.** Fixed 145 becomes stale 223. Mitigated by the §4.1 Step-3 guard line plus the T8 path to a CI-generated figure; until generated, the as-of date makes staleness visible.
6. **Toggle honesty gap.** Operators show mock-OFF on unseamed screens once C5 lands partially. Mitigated: operator guide §4 binds OFF-mode claims to the seams registry; T6 training gated on dual-mode green per module.
