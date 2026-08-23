# Graph & Context Architect Output: G1 (graph projector, query layer, D3 seam) plus G7 dashboard view-model discipline (O-3/O-4/O-5)

Specialist: Graph & Context Architect. Bound by DP-1, DP-7 (merge/rekey semantics), C10.2, ADR-001, C9.4 graph MVR, conventions v2. All target-state content below is labeled TARGET. All current-state content cites evidence.md.

---

## 1. Matrix Row

### Row G1: Knowledge graph, population, query layer

| Column | Content |
|---|---|
| Current state | Tier B presentational. The graph is a hardcoded 804-line TypeScript dataset (52 nodes, 67 edges, five Cypher lens filters rendered as UI labels; no graph store, no Cypher execution). Node data mixes semantics with presentation (color, radius, pulse). The dataset is REPRESENTATIVE of one member journey; the trace matrix row 7 is RECONSTRUCTED. |
| Code evidence | `src/lib/wholePersonGraphData.ts:1-805` (nodes 85-446, edges 449-624, lensDefinitions 637-735, activeSignals 752-804). File is in the frozen quality baseline (over the 400-line cap; inline data). |
| Target architecture | TARGET. Postgres-backed property-graph projection per ADR-001: `graph_nodes` / `graph_edges` tables, member-partitioned, dated validity intervals, restricted-node columns for Part 2. A graph projector consumes C10 domain events from the backbone (consumer group `graph-projector`), applies per-domain mapping specs, checkpoints per partition. Query layer answers the five lens filters as typed queries (recursive CTE, depth <= 3) behind `SEAM: graph-store`. C1 serves `/api/person-context/{memberId}/lens/{lensId}`. Rebuild from replay is a supported operation; merge/unmerge rekeys by replay per DP-7. The D3 screen consumes real lens results; the demo dataset moves to `data/graph/wholePersonGraph.mock.json` as the permanently selectable mock mode. |
| Dependencies | ADR-002 backbone (events to consume), ADR-006 outbox (event birth plus the per-member replay source), G3 stage 5 (events exist only when pipelines load the record), C9 phase P2 for graph MVR domains, identity merge events (DP-7 build, G3 stage 3 scope), gap-derivation projector (trace finding F1, G2 scope) for CareGap nodes. |
| Phase real | P2 (graph MVR domains reach required tiers in P2 per C9.1; projector plus store code lands in P1 behind the seam, fed by P1 batch domains first). |

### Row G7 (view-model discipline slice only; engine and pipelines belong to other owners)

| Column | Content |
|---|---|
| Current state | Dashboards compute per-screen inline numbers (evidence.md Tier B list). Network adequacy engine itself is Tier A. |
| Code evidence | evidence.md: "Dashboards: per-screen inline numbers"; adequacy engine cited as Tier A (time/distance, ratios, wait-time, gaps, augmentation, analyst copilot). |
| Target architecture | TARGET. A shared view-model contract: the metrics projector materializes named, versioned view-model tables; dashboards (O-3 four ported providernet_analytics views, O-4 county choropleth) read them via BFF routes; the O-5 compliance report generates from the same view-models, so screen and audit evidence cannot disagree (DP-6). No dashboard computes aggregates inline (conventions v2 §8.3). |
| Dependencies | Metrics projector build (Pipeline pair per §3.1 owner split), adequacy engine outputs, C1 provider-context extension (O-6, spine-owned model). |

---

## 2. Current State Evidence

Cited from evidence.md; not re-derived.

1. Knowledge graph is Tier B: `src/lib/wholePersonGraphData.ts` is an 804-line hardcoded dataset, 52 nodes, 67 edges, 5 Cypher lens filters as UI labels, no graph store, no Cypher execution.
2. The file is a frozen convention violation (66-file baseline; inline data; over cap). The ratchet forbids adding code to it; G1 retires it by extraction.
3. WPC screens render from hardcoded TS, not from the FHIR record; pipeline-fed completeness today is zero. Therefore the graph projector has nothing real to consume until G3 stage 5 emits events; every acceptance claim below is gated on that.
4. Substrate absent by design: no queue, no workers, in-process Map stores. The projector's runtime substrate is ADR-002 target state.
5. Dashboards are per-screen inline numbers (the G6 lesson motivating the G7 view-model discipline).
6. The house seam exemplar is `src/lib/consent/providerAccessOptOut.ts` (C3); the graph store seam replicates its shape.
7. Anchor-file observation used as design input (verified by direct read of the staged file, consistent with evidence.md): the demo dataset carries per-node `lens` membership arrays, `locked` (42 CFR Part 2), `consentPending`, `validUntilDays` temporal hints, and edge properties with `since` dates and `confidence`. These are the semantic seeds the target ontology generalizes. Presentation fields (color, radius, pulse, strokeWidth, cluster) are demo-surface concerns that do not enter the projected store.

---

## 3. Target Architecture

Everything in this section is TARGET state. Design sits entirely inside ADR-001 (Postgres projection), §4A stage 5, C10, DP-1, DP-7. No deviations; none needed.

### 3.1 Ontology (DP-1: seed fixed, generalized, never Maria-shaped)

The demo's 25 concrete node types generalize into a bounded node taxonomy. The demo instance is the reference fixture, not the schema. Per the §1.2 rule, no node or edge type may encode a journey shape, a specific condition, a specific barrier, or a specific state program; those are values, not types.

| Taxonomy node type | Generalizes demo types | Keyed by | Notes |
|---|---|---|---|
| Person | Member, Dependent | anchored memberId (DP-7) | Any person on the record; role is a property, never a type |
| RelatedPerson | Dependent, HouseholdUnit membership | RelatedPerson resource ref | Household links are edges between Person nodes plus a Household grouping node |
| Household | HouseholdUnit | household id | Grouping node; composition is properties |
| CareTeamMember | Provider, Agent (the demo's human "agents": CHW, care manager, dispatcher) | NPI or practitioner ref (DP-7 provider identity) | The demo labels humans as Agent; target ontology places humans here |
| Organization | CriticalAccessHospital, PharmacyTouchpoint (facility aspect) | NPI/org ref | Facility class (CAH, pharmacy) is a property |
| Condition | Episode | Condition resource ref | Episode grouping is a property set; tier label carried (T1 vs T3 shadow) |
| CareGap | CareGap | gapId from care-gap.* events | Status open/closed; measure system+code as properties |
| SDOHBarrier | SDOHNode, SeasonalBarrier, CaregiverBurden | barrier condition ref or derived id | Gravity-coded where available (Z-codes); severity a property |
| Event | implicit episodes/timeline | resource ref | Subtyped by property: encounter, labResult, dispense, procedure, immunization |
| ScreeningResult | ScreeningResult, BHScreening | QuestionnaireResponse ref | BH instances carry restriction labels |
| Intervention | referral/benefit actions | ServiceRequest ref, program action id | Referrals, benefit enrollments in flight |
| CoveragePA | Insurance, EligibilityStatus, PA lifecycle | Coverage ref, PA id | Coverage state and PA state as dated properties |
| ProgramStatus | BenefitStatus, WICStatus, BHProgramStatus, HousingStatus, LIHEAPStatus | program code + memberId | Program is a coded property (the demo's five separate types collapse; a new program is data, not a new type) |
| Consent | Consent | Consent ref, scope id | Scope, status, target person |
| ChannelConstraint | ChannelHistory, WorkScheduleConstraint, DigitalDivide aspects | derived id | Outreach-relevant constraints; consumed by SDE via its own read, present in graph for context lenses |
| AgentAction | Agent action edges (ACTIONED, DISPATCHED_TO) | disposition/touchpoint event id | Platform agent actions (G4) and SDE decisions, always with provenance; the graph records that an action happened, it never triggers one (role separation, DP-1) |
| ChildDevelopment | ChildDevelopment | derived from screening/condition refs | Developmental flags as properties on ScreeningResult or Condition; retained as a distinct type only if the D3 screen needs it, else folded (see spike SP-4) |

Edge taxonomy, generalized the same way. Two assertion kinds, structurally distinct (DP-1 rule 2):

- **Associative edges (default):** HAS_GAP, HAS_CONDITION, HAS_EVENT, HAS_BARRIER, HAS_SCREENING, COVERED_BY, TREATED_BY, MEMBER_OF_HOUSEHOLD, CAREGIVER_FOR, PARENT_OF, PICKS_UP, HAS_CONSENT, ELIGIBLE_FOR, REFERRED_TO, ON_WAITLIST, EVIDENCES, CONFIRMS, QUANTIFIES, PERFORMED_BY, ACTED_ON.
- **Causal edges (provenance mandatory):** BLOCKS, WOULD_RESOLVE, WOULD_REDUCE, WOULD_ADDRESS, COMPOUNDS, DRIVES, DELAYS, DEPRIORITIZES, EXACERBATES, SUPERSEDED_BY. A causal edge row without provenance is rejected at write time (store-level constraint plus zod parse). Provenance shape: `{assertedBy: 'screening-instrument'|'clinician'|'agent-hypothesis'|'measure-engine'|'policy-rule', sourceRef, assertedAt, basis}` with `agent-hypothesis` rendered as hypothesis in every consumer surface.

Temporality (DP-1 rule 1): every edge carries `effectiveAt` (domain time, from the event's occurredAt) and a validity interval `validFrom`/`validTo` (null validTo = still valid). Stateful facts (coverage, consent, program status, care team attribution) close their interval on the superseding event. This is what makes the journey reconstructable and what serves the C1 `asOf` parameter.

### 3.2 Store schema (ADR-001 option a, made concrete)

Postgres tables in the platform schema (not HAPI's), member-partitioned (declarative partitioning by hash(member_id); partition count aligned with backbone planning, see §8):

```
graph_nodes(
  member_id text, node_id text, node_type text,
  properties jsonb, tier text,                  -- T1|T2|T3 from source.tier
  restricted boolean default false,             -- Part 2
  segment_labels text[],
  valid_from timestamptz, valid_to timestamptz,
  source_event_id uuid, source_sequence bigint, updated_at timestamptz,
  primary key (member_id, node_id))

graph_edges(
  member_id text, edge_id text,
  src_node_id text, dst_node_id text, edge_type text,
  assertion_kind text check (assertion_kind in ('associative','causal')),
  provenance jsonb,                             -- mandatory when causal (CHECK)
  effective_at timestamptz, valid_from timestamptz, valid_to timestamptz,
  restricted boolean default false, segment_labels text[],
  properties jsonb, source_event_id uuid, source_sequence bigint,
  primary key (member_id, edge_id))

graph_checkpoints(
  consumer_group text, topic text, partition int,
  committed_offset bigint, last_event_id uuid, updated_at timestamptz,
  primary key (consumer_group, topic, partition))
```

Indexes: `(member_id, node_type)`, `(member_id, src_node_id)`, `(member_id, dst_node_id)`, partial index on `restricted`. Lens traversal is a per-member recursive CTE from the Person node, depth <= 3, filtered by lens edge/node type sets; the load model confirms tens of milliseconds at subgraph order 10^2..10^3, far inside the 2s budget.

The store is derived state, never a source of truth (§4A stage 5). No writer other than the projector and the rekey/rebuild tool touches these tables.

### 3.3 Projector (C10 consumer)

One consumer group (`graph-projector`) on the domain-events topic. Per event: zod-parse the envelope (C2), dedupe on eventId against `source_event_id` bookkeeping, dispatch to the mapping registry by eventType, apply node/edge upserts idempotently in one transaction with the checkpoint advance. Per-member ordering comes free from the memberId partition (C6); the projector holds no cross-member state, so consumers scale to partition count.

Part 2 posture: the graph projector is a Part 2-cleared projector by design (DP-1: Part 2 data projects only as restricted nodes). It inspects `consentContext` on the envelope (never the payload) and copies `part2Restricted`/`segmentLabels` onto the projected rows. Restriction is therefore a property of the projected data from the moment it exists, mirroring the §4A transformation-time rule. Read-time enforcement is separate and additive (§3.5).

Batch-class handling: during load windows the projector is permitted to lag (C6 traffic classes); lag is drained within 1h of window close, alarmed. Stream-class events honor the DP-5 budgets.

### 3.4 Per-domain mapping specs (C10.2 format: event type -> node/edge, dating, labels, provenance)

Specs are code modules (one per domain, each well under the cap) plus a generated human-readable table (doctrine 9: generated, never hand-maintained). The P2 set below covers every domain the graph MVR requires (C9.4: 1@T1, 2@T1, 3@>=T3, 4@>=T3, 12@T1, 13@T1, 17@T1) plus the domains the five lenses need. Domains marked P3 project later, additively (C10 evolution rule).

| Domain / event types | Node upserts | Edge upserts | Dating and labels |
|---|---|---|---|
| Identity: identity.member.anchored, identity.traits.updated | Person (properties: demographic golden view refs, never raw source ids) | none | validFrom = occurredAt; traits update properties in place (same node key) |
| Identity: identity.member.merged / unmerged | none directly | none directly | Triggers rekey-by-replay, §3.6; never an in-place mapping |
| Coverage: coverage.enrolled/changed/terminated | CoveragePA (coverage aspect) | Person COVERED_BY CoveragePA | Interval closed on changed/terminated; renewal horizon a property (generalizes the demo's validUntilDays) |
| Encounters: encounter.admitted/discharged/transferred/ed-arrival/recorded | Event (subtype encounter; tier from envelope: T1 ADT stream, T3 claims shadow) | Person HAS_EVENT Event; Event PERFORMED_BY CareTeamMember/Organization when resolvable | effectiveAt = occurredAt; admit/discharge close intervals on the same encounter node |
| Conditions: condition.recorded/resolved | Condition (tier labeled T1 or T3) | Person HAS_CONDITION Condition | resolved closes validity; T3 shadow nodes never silently upgrade; a later T1 recording for the same condition supersedes by coded identity with both provenances retained |
| Medications: medication.prescribed/dispensed | Event (subtype dispense) for dispenses; prescription as property-bearing Event | Person HAS_EVENT; PICKS_UP edge only from an asserted source (e.g. pharmacy roster or screening), never inferred silently | dispense dates ground adherence context; adherence computation itself belongs to SDE/metrics, not the graph |
| Labs/vitals: observation.recorded | Event (subtype labResult; code, value, tier) | Person HAS_EVENT Event; Event EVIDENCES CareGap when a gap event names it (provenance: measure-engine) | golden-path hop 5b exactly |
| Procedures: procedure.recorded | Event (subtype procedure) | Person HAS_EVENT | tier per envelope |
| Care team: care-team.attributed/changed | CareTeamMember (NPI-anchored per DP-7), Organization | Person TREATED_BY CareTeamMember (interval); CareTeamMember MEMBER_OF Organization | changed closes prior attribution interval |
| Care plan: care-plan.created/updated, goal.set/met, task.created/completed | Intervention nodes for plan-ordered interventions; goals as properties on Intervention or CareGap linkage | Person HAS_INTERVENTION; Intervention ADDRESSES CareGap/SDOHBarrier (causal, provenance: the plan's citation per DP-4) | goal.met closes; plan lineage via source_event_id |
| Referrals: referral.initiated/accepted/stalled/completed | Intervention (subtype referral) | Person REFERRED_TO Intervention; Intervention DIRECTED_TO CareTeamMember/Organization | status transitions update properties and intervals; stalled is a property the SDE reads, not a graph-raised signal |
| SDOH: sdoh.screening.completed, sdoh.barrier.identified/resolved | ScreeningResult; SDOHBarrier (Gravity/Z-coded) | Person HAS_SCREENING; Person HAS_BARRIER; ScreeningResult CONFIRMS SDOHBarrier (associative); SDOHBarrier BLOCKS CareGap ONLY when asserted (causal, provenance: screening answer, clinician, or agent hypothesis) | barrier.resolved closes validity; the demo's keystone-barrier legibility emerges from real BLOCKS assertions, never from a hardcoded chain |
| BH incl SUD: bh.event.recorded | ScreeningResult/Condition/Event per payload kind, `restricted = part2Restricted`, labels copied | edges inherit the stricter restriction of their endpoints | envelope-only inspection; restricted rows serve only per §3.5 |
| Consent: consent.granted/revoked, consent.optout.recorded/revoked | Consent | Person HAS_CONSENT Consent | revocation closes interval; consent state also gates reads (§3.5), the node is context only |
| PA lifecycle: pa.submitted/pended/approved/denied/goldcard.applied | CoveragePA (PA aspect, per PA id) | Person HAS_PA; CoveragePA AUTHORIZES Intervention when linked | full lifecycle as dated status transitions (trace step 12) |
| Claims/financial: claim.adjudicated, payment.posted | property updates on linked Event/CoveragePA nodes only | none new | the golden thread ledger, not the graph, is the financial evidence chain; graph carries linkage context only |
| Assessments: assessment.submitted | ScreeningResult | Person HAS_SCREENING | provenance: patient-reported |
| Household: related-person.linked/unlinked | Household, Person (stub for the related person if known) | CAREGIVER_FOR / PARENT_OF / MEMBER_OF_HOUSEHOLD per relationship code | cross-member rows written to both members' partitions in the one event transaction (see §3.7) |
| Care gaps (derived, F1 projector in G2 scope): care-gap.opened/closed | CareGap | Person HAS_GAP; evidence edges per event evidenceRefs (provenance: measure-engine) | opened/closed transitions dated; the graph never computes measures (role separation) |
| SDE out: disposition.decided, touchpoint.executed | AgentAction | AgentAction ACTED_ON CareGap/SDOHBarrier/Intervention; AgentAction PERFORMED_BY CareTeamMember or platform agent id | provenance mandatory (policyId from the disposition payload); powers the agents lens honestly |
| P3 additive: immunization.recorded, allergy.recorded/resolved, document.attached | Event/Condition/Document stub nodes | HAS_EVENT etc. | registered later under the C10 registration rule; no lens depends on them in P2 |

Mapping-spec deployment note: which domains are enabled per deployment is configuration data (`data/graph/mappings.enabled.json`), so a state can phase domains without a deploy.

### 3.5 Query layer and C1 serving

Typed lens queries only (ADR-001 seam: never raw SQL or Cypher across the interface). The five demo lens filters are the acceptance queries (DP-1 rule 3), generalized to any member:

| Lens id | Semantics (generalized from the demo lensDefinitions) |
|---|---|
| all | Full member subgraph, depth <= 3 from Person |
| clinical | Conditions, care gaps, medications/dispenses, care team, PA; cross-domain causal blockers (BLOCKS into clinical targets) included at reduced prominence |
| behavioral | BH screenings, BH-relevant barriers/conditions, program status; restricted nodes subject to §read-time policy |
| social | SDOH barriers, screenings, household/caregiver edges, program and benefit context, causal resolution chains (WOULD_RESOLVE into barriers/gaps) |
| eligibility | Coverage, eligibility/program status, eligible-not-enrolled deltas with forward WOULD_RESOLVE edges |
| agents | AgentAction nodes and their targets, care-team management edges, last-action recency |

Lens definitions are data (`data/graph/lenses.json`: per lens, included node types, included edge types, depth, prominence rules), zod-validated at load. Adding a lens is a data change plus an acceptance query, not an engine change. The demo's Cypher strings retire into the mock fixture as display artifacts only.

Serving path (C1): browser -> `GET /api/person-context/{memberId}/lens/{lensId}?asOf=...` -> BFF route -> authz guard (Tier-A pattern) -> consent scoping -> lens engine -> store. Budget: graph lens query p95 <= 2s (load model: confirmed with two orders of magnitude of headroom). `asOf` filters on validity intervals.

Read-time Part 2 enforcement (additive on top of stored labels, per C1): when requestor purpose plus consent scope do not permit restricted content, restricted nodes return as presence-only stubs `{nodeId, nodeType, locked: true}` with no properties, matching the demo's lock affordance; edges to restricted nodes are suppressed except the anchoring HAS_* edge. ASSUMPTION: presence-only disclosure of a restricted node's existence is acceptable under the deployment's Part 2 interpretation; this is flagged for compliance review (risk R5) with the stricter alternative (full omission) available as configuration.

Response shape is semantic only: node/edge types, properties, tiers, restriction flags, provenance, dates. No colors, radii, or pulse flags cross the API; presentation mapping lives in the screen (§3.8).

### 3.6 Rebuild from replay, merge/unmerge rekey (DP-7)

Two replay sources, one semantics:

1. **Full rebuild:** replay the domain-events topic from offset zero (C6 supported operation) into a fresh shadow schema (`graph_nodes_rebuild`, ...), then atomically swap (view/schema rename). Used for mapping-spec upgrades, disaster recovery, projector-bug remediation.
2. **Per-member rebuild:** the ADR-006 outbox table is the durable, ordered, per-member event history in Postgres. The rekey tool reads outbox rows for a memberId in sequence order and replays them through the same mapping registry. This avoids full-topic scans for single-member operations. ASSUMPTION: outbox retention covers full member history (append-only, retained per the 7-year default); confirmed with the Pipeline pair as a cross-specialist interface note, escalation if outbox truncation is ever proposed.

Merge (identity.member.merged, survivorId + mergedId): the projector (a) tombstones both members' subgraphs (marks, does not delete, for audit), (b) enqueues a rekey job, (c) the job replays both identity histories under the survivor key through the standard mappings, with per-event memberId rewritten to survivorId at replay time by the identity crosswalk the merge event carries. Ordering across the two source histories follows (recordedAt, sequence). No in-place key rewrites, ever (DP-7). Unmerge is the same job class in reverse using the crosswalk recorded at merge time. Both are audited to the ADR-005 ledger (`graph.rekeyed`, counts, correlation id). Lens reads during a rekey serve the tombstoned subgraph with a `rebuildInProgress` flag rather than a hole; the rekey window at per-member event volumes is seconds. ASSUMPTION on volume: <= 5K events per member lifetime at Medicaid-typical utilization.

**Rebuild-from-replay proof (the acceptance artifact):** a CI-runnable proof harness: (1) apply a fixture event stream (representative, multi-domain, including a merge mid-stream) through the live projector path; (2) rebuild from the same stream into the shadow schema; (3) canonical-serialize both graphs (sorted node/edge sets, volatile fields excluded) and assert checksum equality; (4) property test (fast-check): for any valid event-stream permutation that preserves per-member order, the resulting graph is identical. This is the mechanical form of C10.2's rebuild requirement and the DP-7 justification for it.

### 3.7 Cross-member edges (household)

Household relationship events carry both member ids. The handling projector writes the edge row under both members' partitions in the one event transaction, so every per-member lens query stays single-partition. Ordering is guaranteed only on the event's own partition key; the reciprocal row is eventually consistent within that same transaction commit (immediate in practice; both rows are one Postgres transaction). Merge rekey re-derives both sides from replay.

### 3.8 D3 screen seam (mock toggle stays selectable)

The 804-line file retires by extraction, closing its frozen violation:

- Data moves to `data/graph/wholePersonGraph.mock.json` (nodes, edges, lens display metadata, active-signal display fixtures). Seed/template data files are cap-exempt by glob.
- `mockGraphStore` implements the same `GraphStore` interface, serving the mock fixture through the identical lens engine path (C3 rule 3: mock is a mode, not a stub; id: `mock-whole-person-graph`).
- The screen consumes lens results via the BFF route in both modes; the Mock Data toggle selects the store implementation server-side. Dual-mode rendering is registered in `tools/demo-green/seams.json` (C5).
- Presentation mapping (nodeType -> color/radius, edgeType -> stroke, restricted -> lock icon, causal+hypothesis -> dashed) moves to a screen-side view module. Mock fixtures keep their exact current visuals so the demo stays green pixel-for-affordance.
- The screen's active-signal rail is SDE surface: in real mode it reads SDE outputs through the SDE's own seam (G2 scope); in mock mode it renders the fixture signals. The graph store never fabricates signals (role separation).

### 3.9 G7 dashboard view-model discipline (O-3/O-4/O-5)

Owned here as discipline and contract; the metrics projector build and the adequacy data feeds are the Pipeline pair's scope (§3.1 owner split). Binding rules for every G7 surface:

1. **Named view-models, materialized by the metrics projector**, one registry (`src/lib/viewmodels/registry.ts` listing id, version, source events/tables, refresh cadence, owning projector). The four ported providernet_analytics views (O-3), the county choropleth aggregates (O-4), the compliance-readiness dataset (O-5) are each a registered view-model.
2. **Dashboards read, never compute.** BFF route per view-model (`GET /api/viewmodels/{id}?params`), keyed reads, p95 <= 1s (DP-5 budget; load model confirms as precomputed keyed queries). No aggregate math in components or routes (conventions §8.3).
3. **The O-5 report is generated from the same view-models** as the screens, rendered to the report format, so screen and audit evidence cannot diverge (DP-6). The report generator cites view-model id plus version in its output.
4. **Thresholds are data** (DP-6): adequacy thresholds live in versioned config data consumed by the metrics projector, never constants in view code.
5. Drill-down (O-4 county -> detail) is parameterized reads of the same view-models, not ad-hoc queries.

View-model contract shape (zod-schema'd, versioned, additive evolution like C10): `{viewModelId, version, asOf, params, rows[]}`. Copilot `focusCounties` (O-4 note in §3.1) drives parameters into the same read path.

---

## 4. Build Approach and Reuse Map

Reused (named Tier-A code and patterns):

- `src/lib/consent/providerAccessOptOut.ts`: the C3 seam shape replicated for `GraphStore` (interface, id-carrying implementations, mock as permanent mode, attributed mutations for rekey operations, typed coded errors).
- Authz guard pattern (Tier A): wraps every C1 lens route; consent scoping per the C1 enforcement statement.
- Identity match engine outputs (Tier A): the projector consumes anchored memberIds only; it never resolves identity itself.
- `BackboneNotConfiguredError` pattern: real-mode store refuses loudly when the backbone/store is unconfigured; the screen degrades to mock mode by explicit toggle, never silently.
- Structured logging interface (conventions §8) with correlation ids propagated from event envelopes into projection audit entries.

New build, in order (each step leaves the demo green):

1. **B1** Extract mock dataset to `data/graph/wholePersonGraph.mock.json`; introduce `GraphStore` interface + `mockGraphStore`; point the D3 screen at the BFF lens route backed by mock; register in `seams.json`. The 804-line file is deleted; baseline shrinks.
2. **B2** Postgres schema + `postgresGraphStore` + lens engine (recursive CTE) behind the same interface; contract test suite runs against mock and real (C3 rule 7).
3. **B3** Projector core: consumer group, envelope parsing, dedupe, checkpointing, mapping registry.
4. **B4** Mapping modules, P1 domains first (identity, coverage, encounters T3, conditions T3, care team, PA, financial linkage), then P2 domains (ADT encounters T1, labs, SDOH, referrals, consent, BH restricted, care gaps, SDE out) as their feeds land per C9.1.
5. **B5** Rebuild harness + merge/unmerge rekey job + proof suite.
6. **B6** C1 lens endpoints hardened (authz, consent scoping, asOf, Part 2 stubs).
7. **B7** G7 view-model registry, contract, BFF read routes; adequacy view-models filled jointly with the Pipeline pair's metrics projector.

---

## 5. File-Level Touchpoints

All new files under the 400-line cap; no additions to any baseline file; data externalized. Proposed layout:

```
src/lib/graph/
  types.ts                     domain shapes, node/edge taxonomy, Result types
  schema.ts                    zod: envelope-consumption guards, lens params,
                               lens result, mapping-spec config, provenance
  index.ts                     public surface only
  README.md                    <=150 lines, conventions §13.2 template
  store/
    graphStore.ts              GraphStore interface (SEAM: graph-store)
    postgresGraphStore.ts      real implementation
    mockGraphStore.ts          fixture-backed implementation
    migrations/                SQL migrations for §3.2 tables
  projector/
    projector.ts               consume loop, dedupe, checkpoint
    mappingRegistry.ts         eventType -> mapping dispatch
    rekey.ts                   merge/unmerge replay job
    rebuild.ts                 full-rebuild shadow-swap
    mappings/
      identity.ts  coverage.ts  encounters.ts  conditions.ts
      medications.ts  labs.ts  procedures.ts  careTeam.ts
      carePlan.ts  referrals.ts  sdoh.ts  behavioral.ts
      consent.ts  pa.ts  financial.ts  assessments.ts
      household.ts  careGaps.ts  agentActions.ts
  query/
    lensEngine.ts              typed lens execution, depth-bounded CTE
    lensLoader.ts              loads/validates data/graph/lenses.json
    redaction.ts               Part 2 read-time stubbing policy

src/lib/viewmodels/
  types.ts  schema.ts  index.ts  README.md
  registry.ts                  view-model registry (id, version, source, owner)

src/app/api/person-context/[memberId]/lens/[lensId]/route.ts
src/app/api/viewmodels/[id]/route.ts

data/graph/wholePersonGraph.mock.json      extracted demo instance (cap-exempt)
data/graph/lenses.json                     lens definitions as data
data/graph/mappings.enabled.json           per-deployment domain enablement

tools/graph/rebuild.ts                     ops CLI (full + per-member rebuild)
tests/graph/ ...                           see §11
tools/demo-green/seams.json                + whole-person-graph entry
```

Retired: `src/lib/wholePersonGraphData.ts` (deleted after B1; baseline shrinks by one). The D3 screen page keeps its file; its data import swaps to the BFF hook (one-line class of change; if that page is itself baselined, the swap is the permitted extraction-plus-one-line-edit form).

Estimated largest file: `lensEngine.ts` ~300 lines. Every mapping module is small (one domain each, ~80-180 lines). No file approaches the cap; if the CTE builder grows, it splits into `lensEngine.ts` + `traversal.ts` before the limit (stated up front per doctrine 10).

---

## 6. Golden-Path Participation

Owned hop: **5b (graph projection)**, plus lens serving for C1 consumed at any point after it.

Inputs at hop 5b (payload level):

- `observation.recorded` (C2 envelope, class stream, tier T1, `payload.observationRef: Observation/obs-a1c-20260402`, code LOINC 4548-4, valueQuantity 7.2%).
- `care-gap.closed` from hop 5a (payload gapId, measure HEDIS GSD, evidenceRefs naming the observation, causationId = the observation eventId).

Outputs at hop 5b (store level, exactly the spine's stated shape generalized):

- Node upsert `Event{nodeId: obs-a1c-20260402, subtype: labResult, code: 4548-4, value: 7.2, tier: T1, validFrom: 2026-04-01}`.
- Edge upsert `(Person mem-7f42a9) -HAS_EVENT{effectiveAt: 2026-04-01}-> (Event obs-a1c-20260402)`: associative, dated.
- Edge upsert `(Event) -EVIDENCES{assertionKind: causal, provenance: {assertedBy: measure-engine, sourceRef: care-gap.closed eventId, assertedAt: 2026-04-02}}-> (CareGap gap-gsd-2026-mem-7f42a9)`.
- Node update `CareGap.status -> closed`, validity interval closed at the gap event's occurredAt.
- Checkpoint advance; `graph.projected` evidence entry to the ADR-005 ledger with correlation id `corr-a1c-journey-0042`.

Downstream: the clinical lens for this member now answers with the closed gap, its evidencing lab, dated; the D3 lens "care gaps in context" serves real data; hop 9's evidence chain includes `graph.projected`. The path holds for any member, any lab, any measure: nothing above names a person, a condition, or a journey shape.

---

## 7. Contracts Touched

| Contract | Touchpoint | Grep anchor |
|---|---|---|
| C1 | Lens endpoints `/api/person-context/{memberId}/lens/{lensId}`, asOf support, consent-scoped responses, tier labels on every section | `// CONTRACT: C1` in the route + lensEngine |
| C2 | Envelope consumption: zod parse, eventId dedupe, consentContext inspection (envelope only, never payload for restriction) | `// CONTRACT: C2` in projector.ts |
| C6 | Consumer group `graph-projector`, per-partition ordering reliance, DLQ posture, full-topic replay for rebuild | `// CONTRACT: C6` in projector.ts |
| C9.4 | Graph MVR (1@T1, 2@T1, 3@>=T3, 4@>=T3, 12@T1, 13@T1, 17@T1); lens completeness reported only against MVR-fed domains | stated in README + traceability rows |
| C10 | Mapping spec format (§3.4 is the C10.2-format instance), rebuild semantics, registration rule (graph reads no other projector's store), additive evolution | `// CONTRACT: C10` in mappingRegistry.ts |
| C3 | GraphStore seam replicating the consent exemplar; contract tests mock AND real | `// SEAM: graph-store` |
| C5 | `seams.json` entry; dual-mode Playwright coverage of the D3 screen | seams registry entry |
| C7 | Protocol dependencies: Postgres wire + Kafka API only (subset of the five) | §9 |
| C8 | Docs-done rows in §12 | register rows |

---

## 8. Scale Posture

- **Throughput:** stream-class peak <300 events/min state scale; batch-class windows ~28K/min. Projection work per event is one transaction of 1..4 row upserts; a single consumer sustains thousands/min. Consumer group sized to partition parallelism per the load model (8 consumers state) for batch-window drain, not steady load.
- **Partition key:** memberId (C6), which is exactly the store's partition key, so a consumer's writes never contend across consumers.
- **Idempotency:** dedupe on eventId; upserts keyed by (member_id, node_id/edge_id) are naturally idempotent; redelivery is safe (at-least-once).
- **Backpressure:** consumer lag is the SLO metric (C6); batch-class lag permitted during windows with the alarmed 1h catch-up (load model §2.1); stream-class events keep their budgets because batch and stream ride declared classes and the projector processes in partition order with class-aware alarm thresholds.
- **Budget compliance (none dropped, none re-derived):** graph lens query <=2s p95 (load model: CONFIRMED, depth<=3 CTE over bounded subgraph); dashboard view-model read <=1s p95 (CONFIRMED, precomputed keyed reads); person-context read <=300ms unaffected by this design (lens endpoints are separate, budgeted at 2s).
- **Rekey volume:** merges occur in the 60..90 possible-match band resolution flow; ASSUMPTION <=0.5% of members/year require merge, each a seconds-scale per-member replay; no bulk rekey path needed at these volumes (alarmed if a batch of merges exceeds a configured rate).
- **Linear-scale argument:** stateless consumers, member-partitioned store, no cross-member state anywhere in the projector; scale = partitions x per-partition throughput (doctrine 4).

---

## 9. Portability Posture

Protocol dependencies: **Postgres wire** (graph tables, checkpoints, outbox reads for per-member replay) and **Kafka API** (event consumption, full-topic replay). Both inside C7's five. No graph database, no proprietary query service, no cloud-specific store (ADR-001 rationale honored). The Neo4j-class contingency remains an adapter behind `SEAM: graph-store`, rebuilt from replay if ever justified, per ADR-001's migration seam. Object storage, OIDC, container runtime are not directly touched by this design beyond the shared substrate.

---

## 10. Convention Compliance

- **File split stated up front:** §5 layout; every file under 400 lines; largest projected ~300; mapping modules one domain each.
- **Baseline respected:** `wholePersonGraphData.ts` is never extended; it is deleted by extraction (baseline shrinks). The D3 page swap is the permitted one-line-edit form if that page is baselined.
- **Data is not code:** mock graph, lens definitions, mapping enablement all in `data/` (cap-exempt), zod-validated at load.
- **BFF-only:** browser reaches lens and view-model data exclusively via `/api/person-context/*` and `/api/viewmodels/*`; UI never imports `src/lib/graph` internals (public-surface rule, boundaries lint).
- **AI-guardrail posture:** no LLM anywhere in G1. The graph is deterministic projection and query. Agent-hypothesis causal edges originate from G2/G4 under their guardrails; the graph stores them labeled as hypothesis and renders them as such (decision-support labeling honored downstream).
- **Determinism:** projector and lens engine take injected clock/IO deps; mapping functions are pure (event in, row-op list out); same event stream in per-member order yields the identical graph (this is what the rebuild proof asserts). Mutations idempotent per §8.
- **Typed errors:** expected outcomes as values (empty lens result, member not found as a defined value, `rebuildInProgress` flag); infra failures as coded errors (`GraphStoreUnavailableError`, `BackboneNotConfiguredError` reuse).
- **Observability:** structured logging with correlation id from the envelope; projector exposes lag, apply-rate, rekey counters through the log/metrics interface; dashboards read metrics, never compute (self-applied G6 lesson).
- **Traceability rows** (to append to `docs/traceability.md`): graph store seam + mock mode; projector P1 domains; projector P2 domains; lens query layer + C1 endpoints; rebuild-from-replay proof; merge/unmerge rekey; Part 2 restricted projection + read-time redaction; G7 view-model registry + read routes. Each row lands with its test file; backbone-gated rows marked (projector rows are Tier-B backbone-gated; mock lens path is Tier-A offline).
- **DoD gates as acceptance criteria** on every epic: tsc 0, vitest green, lint clean, size gate 0, `check:all` exit 0.
- **Grep anchors:** `SEAM: graph-store`, `CONTRACT: C1/C2/C6/C10`, `INVARIANT: BFF-only` on both route files, `INVARIANT: graph-derived-state` on the store (no writer but projector/rekey).

---

## 11. Acceptance Tests

Named suites (tests/graph/ unless noted):

1. `lens.acceptance.test.ts`: the five lens filters answered from a projected store built by replaying a multi-domain fixture event stream; assertions on node/edge sets, dating, tier labels. THE DP-1 rule-3 gate. Runs against mock AND real store (contract test per seam).
2. `graphStore.contract.test.ts`: C3-style contract suite, identical assertions against `mockGraphStore` and `postgresGraphStore`.
3. `projector.idempotency.test.ts`: redelivered events produce no state change; out-of-order cross-member delivery produces identical per-member graphs.
4. `projector.mapping.<domain>.test.ts` (per mapping module): event fixtures -> expected row ops; causal edges without provenance rejected.
5. `rebuild.proof.test.ts`: canonical-checksum equality of live-applied vs rebuilt graph; fast-check property: any per-member-order-preserving permutation of the fixture stream yields an identical graph.
6. `rekey.merge.test.ts`: merge event mid-stream -> survivor-keyed graph equals the graph produced by replaying the combined history under the survivor id; unmerge restores; both audited; tombstone visible during rekey with `rebuildInProgress`.
7. `part2.restriction.test.ts`: bh restricted event -> restricted rows with labels; lens read without permitted purpose returns presence-only stubs, no properties, suppressed non-anchoring edges; permitted purpose returns full nodes; audit event emitted per read.
8. `route.lens.test.ts` (BFF): 401/403/400/422/200 matrix, PHI-safe bodies, consent opt-out short-circuit 403, asOf behavior, tier labels present (absorbed test plan pattern).
9. `viewmodels.contract.test.ts`: registry entries schema-valid; view-model read route keyed, versioned, <=1s budget assertion in k6 (D4 hook); O-5 report generator consumes the identical view-model rows as the O-3 screen fixture (divergence test fails if the report computes independently).
10. Dual-mode demo-green additions (C5, Playwright): whole-person-graph screen renders all five lenses mock ON and mock OFF; lock affordances present on restricted nodes; no error boundary; axe-core pass on the screen (O-9).
11. Property tests (fast-check, engines): traversal never exceeds declared depth; restriction is monotone (a restricted endpoint never yields an unrestricted edge); validity intervals never overlap for the same stateful fact.

No prompts exist in G1; no eval suites required.

---

## 12. Docs-Done Entries

Register rows (C8 schema):

| audience | document | stateLabel | class | owner | doneGate | generatedFrom |
|---|---|---|---|---|---|---|
| engineering | docs/graph/mapping-specs.md | target-state until P2 feeds land, then current-state | build-gated (epic E3) | Graph & Context Architect | generated table matches mapping modules in CI; drift fails build | src/lib/graph/projector/mappings/* |
| engineering | src/lib/graph/README.md | mixed-labeled | build-gated (E1) | Graph & Context Architect | README template complete; agent reaches working context from README + types + index | hand-authored |
| engineering | src/lib/viewmodels/README.md | mixed-labeled | build-gated (E7) | Graph & Context Architect | registry documented; the read-never-compute rule stated with lint pointer | hand-authored |
| operations/SRE | docs/runbooks/graph-projector.md (lag, DLQ replay, rebuild, rekey ops) | target-state | build-gated (E5) | Graph & Context Architect with X4 template | runbook exercised once against a real rebuild + a real DLQ replay in staging | hand-authored from X4 skeleton |
| compliance/audit | Part 2 graph handling section in the security/privacy posture statement | current-vs-target labeled | authored-now content handed to X4 | X4 with G1 input | describes stored-label + read-time model exactly as built; R5 assumption flagged | hand-authored |
| enablement/field | demo operator guide entry: graph screen mock/real toggle, honest answer for "is this a graph database" | current-state | authored-now handed to X4 | X4 with G1 input | matches ADR-001 wording | hand-authored |
| engineering | docs/traceability.md rows (§10 list) | per row | build-gated per epic | Graph & Context Architect | test named in row passes | hand-authored rows |

---

## 13. Effort S/M/L with Assumptions

| Epic | Size | Assumptions |
|---|---|---|
| E1 Mock extraction + GraphStore seam + D3 screen on BFF lens route (B1) | M | ASSUMPTION: the D3 page's data import is swappable without restructuring its layout logic; presentation-mapping extraction is mechanical. Demo-green suite exists to verify (C5). |
| E2 Postgres store + lens engine + contract tests (B2) | M | ASSUMPTION: recursive CTE at depth 3 over 10^3-node subgraphs needs no materialized closure table (load model supports; spike SP-1 verifies before hardening). |
| E3 Projector core + P1/P2 mapping modules (B3+B4) | L | Largest surface: ~19 mapping modules plus registry. ASSUMPTION: C10 payload schemas stabilize before mapping build starts (spine artifact); churn there re-opens modules. Gated on backbone (ADR-002) existing in dev compose. |
| E4 C1 lens endpoints + consent scoping + Part 2 redaction (B6) | M | ASSUMPTION: authz guard + consent store expose the purpose/scope check as a reusable server-side call (they do per C1 statement); R5 compliance answer may adjust redaction config, not code. |
| E5 Rebuild harness + merge/unmerge rekey + proof suite (B5) | M | ASSUMPTION: outbox retained append-only per §3.6 (interface note to Pipeline pair); merge crosswalk shape delivered by the DP-7 identity build (G3 stage 3 scope). |
| E6 Dual-mode demo-green + axe additions | S | Rides C5 machinery; assertions structural only. |
| E7 View-model registry + contract + adequacy view-model reads (B7) | M | Joint with Pipeline pair (metrics projector is theirs). ASSUMPTION: the four providernet_analytics views' aggregate definitions are recoverable from the existing adequacy engine outputs without new source data beyond O-2 feeds. |

---

## 14. Spike Tickets

| Spike | Question it answers | Timebox output |
|---|---|---|
| SP-1 CTE performance | Does a depth-3 recursive CTE over a 10^3-node member subgraph with lens-type filtering stay under 100ms p95 on the pilot Postgres posture, or do we need a per-member closure/adjacency cache? | Query plans + k6 numbers on generated synthetic subgraphs at 10^2, 10^3, 10^4 nodes |
| SP-2 Per-member replay source | Confirm outbox-as-replay-source mechanics with the Pipeline pair: read API, sequence semantics across merged identities, retention guarantee | One-page interface note both specialists sign; escalation if retention conflicts |
| SP-3 Part 2 presence-stub compliance | Is presence-only disclosure of a restricted node acceptable, or must redaction be full omission (config default decision) | Compliance-reviewed answer recorded in the posture statement; config default set |
| SP-4 D3 payload compatibility | Exact semantic-payload -> visual mapping needed by the existing force layout (incl whether ChildDevelopment stays a node type or folds into properties); confirms E1 sizing | Mapping table + a rendered spike branch of the screen on mock-via-BFF |
| SP-5 asOf lens semantics | Point-in-time queries over validity intervals: does asOf apply to edge validity only, or also to node property history (which would need a history table)? Current design: interval-only, no property history. Validate against the C1 consumer expectations | Decision note; if property history is required it is an additive table, not a redesign |

---

## 15. Risks

Ranked.

1. **R1 Upstream event starvation.** The graph MVR needs P2 feeds (ADT, screening, referrals, gap events). If G3 slips, the projector is built but the lenses answer thinly. Mitigation: doctrine 1 (mock mode stays selectable; demo green regardless); C9.4 completeness reporting makes thinness visible honestly instead of hidden. No escalation needed; sequencing is already O-1/O-2-first.
2. **R2 F1 dependency (care gaps).** CareGap nodes and the clinical lens's core insight depend on the gap-derivation projector assigned to G2 by trace finding F1. If that assignment is rejected, the graph has no `care-gap.*` events to project. Mitigated by the spine's F1 disposition; ESCALATION path already defined there (unpark a G6 slice). G1 consumes the events either way; ownership, not shape, is the open item.
3. **R3 Merge-rekey correctness.** Wrong rekey silently corrupts context for merged members. Mitigated by DP-7's replay-only rule, the tombstone-plus-rebuild design, the rekey acceptance test, and the ADR-005 audit trail; the rebuild proof is the standing regression.
4. **R4 Ontology drift toward the demo instance.** Pressure to make lenses reproduce Maria's exact screen invites journey-shaped types (the demo's five program-status node types were the warning). Mitigated by §1.2 (binding), the generalized taxonomy in §3.1 (programs as data), and the adversarial axis for representative-use-case violations.
5. **R5 Part 2 presence-stub interpretation.** Presence-only disclosure may be unacceptable in a given deployment. Mitigated: redaction policy is configuration with full-omission available; SP-3 resolves the default; flagged for compliance review in the D7 posture statement. ASSUMPTION labeled in §3.5.
6. **R6 View-model discipline erosion.** New dashboard work bypassing the registry re-creates inline math. Mitigated by the boundaries lint (UI cannot import graph/metrics internals), the registry as the only read path, and test 9's screen-vs-report divergence check; adversarial review carries the G6-lesson axis.
7. **R7 Lens-latency surprise at outlier subgraphs.** A pathological member (very high utilization) could exceed the 10^3-node planning bound. Mitigated: depth cap is enforced structurally; SP-1 measures at 10^4; budget has two orders of magnitude of headroom per the load model; alarm on subgraph-size outliers rather than silent truncation.
