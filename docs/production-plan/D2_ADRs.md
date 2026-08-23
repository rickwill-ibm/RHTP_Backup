# ADR-001..006 (Phase-1 Spine, decided against the load model)

All six are DECIDED here per plan §5. Every decision names its migration seam; every seam carries a `SEAM:` grep anchor plus a contract test that runs the same suite against mock and real implementations (conventions v2 §13.3, §14.3). Current state throughout: none of this substrate exists in the repo (evidence: no queue, cache, worker, IaC assets; in-process Map stores; file-based state). Everything below is target state.

---

## ADR-001: Graph store

**Context.** The demo graph is an 804-line hardcoded dataset (52 nodes, 67 edges, five Cypher lens filters as UI labels, no store, no execution). DP-1 fixes the ontology seed and makes the five lens filters the acceptance queries. The load model shows: writes arrive as domain events at <300/min stream peak plus batch windows; reads are per-member, depth-bounded (<=3) lens queries over subgraphs of order 10^2..10^3 nodes; budget 2s p95. There is no population-scale cross-member traversal requirement in any direction pack.

**Options.** (a) Event-sourced TypeScript projection into Postgres graph tables (node, edge relations, member-partitioned, recursive CTE traversal). (b) Dedicated graph DB (Neo4j-class) fed by the same projector.

**DECISION: (a) Postgres-backed property-graph projection.** Rationale against the load model: lens queries are predefined, per-member, depth-bounded; Postgres answers them in tens of milliseconds at this subgraph size, 100x inside the 2s budget. Option (b) adds a store outside the five permitted protocol dependencies (C7), a second operational surface, a second backup/HA posture, for zero measured query need. The projector consumes C10 domain events, is rebuildable from record replay (non-negotiable per DP-7 merge semantics), and Part 2 data projects only as restricted nodes.

**Migration seam.** `src/lib/graph/index.ts` exposes a lens-query interface (typed lens queries, never raw SQL or Cypher, per C1). `SEAM: graph-store`. If population-scale traversal ever becomes a requirement, a Neo4j-class adapter implements the same interface behind the same contract test; the projector rebuilds it from replay, so migration is a rebuild, not an ETL.

**Consequences.** One store technology to operate; graph is derived state, never source of truth; the D3 screen consumes real lens results through the seam with the mock dataset remaining a selectable mode; the 804-line data file retires into `data/*.json` fixtures, closing a frozen convention violation by extraction.

---

## ADR-002: Execution substrate

**Context.** Three lanes (doctrine 3). Load model: stream-class traffic <300/min peak at state scale; batch-class bursts ~28K/min during load windows; per-member ordering required; journey lane holds up to ~140K open long-lived workflows at state scale. Doctrine 5 bans proprietary control planes in core; the durable workflow engine must be self-hostable.

**Options.** Queue: Kafka-API broker (Redpanda, MSK, Event Hubs Kafka mode) vs Postgres-backed queue to start. Workflow: Temporal-class self-hosted vs pg-boss state machines to start.

**DECISION: Kafka-API backbone from day one; Temporal (self-hosted, Postgres-persisted) for the journey lane.** Rationale against the load model: the batch-class window rate (~470 events/s with replay plus rebuild-from-replay traffic on top) is the sizing driver, not steady stream load; projector rebuild (ADR-001, DP-7 merge) requires cheap full-topic replay, which is native to a Kafka-API log and awkward in a Postgres queue that deletes on ack. Partitioned ordering by memberId is native. Starting Postgres-backed then migrating would put a queue migration in front of the first merge/unmerge replay proof; the cost saved does not justify it. Redpanda is the self-hosted reference (single binary, Kafka API, no ZooKeeper); MSK and Event Hubs Kafka mode are IaC-layer swaps because core code speaks only the Kafka API (C7). Temporal wins the workflow slot: self-hostable on the same Postgres, mature timers plus human-in-the-loop waits (72h scheduling windows, DP-3 escalation SLAs); pg-boss state machines would reinvent exactly the durable-timer semantics Temporal ships.

**Migration seam.** Core code depends on a thin backbone interface (`src/lib/server/backbone/index.ts`, publish/subscribe/replay, C6 semantics). `SEAM: event-backbone`. Broker choice is IaC configuration. Journey lane: workflows are defined against a workflow façade so a customer-mandated engine swap is an adapter, though Temporal-class remains the only supported core posture (doctrine 5 bans Step Functions or Durable Functions in core).

**Consequences.** One more platform component to operate from phase 1 (Redpanda), accepted for replayability; DLQ plus replay tooling become D7 runbook subjects; in-memory Map stores retire in the ADR-005 seam-swap order; local dev runs the backbone via docker compose alongside the existing HAPI container.

---

## ADR-003: Pipeline orchestration

**Context.** §4A binds five stages, lane-agnostic transforms, an explicit staging tier. Batch feeds: 834, 837/835, pharmacy, CBO flat files, HMIS extracts. Doctrine 3: Airflow is the reference orchestrator; streams never run in Airflow.

**Options.** (a) Steps-as-containers with Airflow as reference orchestrator plus adapters only on customer mandate. (b) Standardizing hard on one orchestrator's native operators.

**DECISION: (a) Steps-as-containers, Airflow reference, adapter posture.** Each step is a container with declared inputs/outputs plus an idempotency key; DAG definitions live in the repo as data; Airflow (MWAA on AWS, ADF-managed Airflow on Azure) executes them. Native-operator lock-in (b) would put a proprietary control plane inside pipeline logic, violating doctrine 5. Stages 2..4 are pure transform functions packaged twice from one implementation: DAG step containers for batch, stream consumers for the stream lane; divergence is banned by construction (one transform codebase, two thin harnesses).

**Batch/stream boundary rule (binding).** A feed runs in the stream lane when any consumer holds a per-event latency budget under 15 minutes (ADT, screening, referral webhooks, PA status); everything else is batch or micro-batch. Airflow never hosts a stream consumer; the backbone never hosts a multi-hour batch dependency graph.

**Migration seam.** The step contract (container image, declared I/O manifest, idempotency key) is orchestrator-neutral; an ADF-native or Step Functions adapter renders the same DAG definitions if a customer mandates it. `SEAM: dag-orchestrator`.

**Consequences.** Specialists write adapter specs plus DAG definitions inside this shape, never a competing architecture; reconciliation gates (counts in = loaded + rejected, alarmed) are step outputs; quarantine is a first-class lane with a 30-day alarmed TTL.

---

## ADR-004: Deployment target model

**Context.** Phase 0 confirmed no existing IaC anywhere; X3 is greenfield. Approval gate D fixes AWS + Azure first, Google fast-follow. Doctrine 7 phases the configurator honestly.

**Options.** Per-cloud bespoke stacks vs one Terraform module tree with per-cloud implementations of a fixed module interface.

**DECISION: One Terraform repo, three layers, per-cloud modules implementing a fixed interface; AWS + Azure first.** Layers: `core` (network, Kubernetes cluster, Postgres, S3-compatible object storage, Kafka-API broker), `platform` (HAPI cluster, Temporal, Airflow, observability), `app` (services, BFF, projectors). `deploy.config.yaml` (cloud, region, managed-vs-self per tier) selects module implementations and drives CI (v1); the admin-console Deployment screen (v2) renders and drives the same engine, never a second one. Managed-FHIR services (HealthLake, Azure Health Data Services) are conformance-gated adapters on the roadmap per doctrine 6; the conformance suite gates any swap.

**Migration seam.** The module interface itself is the seam: adding GCP is a fourth implementation directory, zero core-code change, because core depends only on the five C7 protocols.

**Consequences.** All hyperscaler specifics live in IaC; D5 documents the schema plus module layout; deployment guides render from `deploy.config.yaml` (doctrine 9, no hand-maintained copies); per-cloud validated walkthroughs stay build-gated docs until each stack first deploys clean.

---

## ADR-005: Evidence and state persistence (O-1)

**Context.** `defaultEvidenceStore()` and its siblings are in-memory Maps; O-1 makes durable evidence the first production store swap, proving C3. Consumers: golden thread evidence chain, GB-7 security review, audit. The consent module is the house seam exemplar to follow.

**Options.** (a) Append-only Postgres event table. (b) FHIR-persisted (AuditEvent / DocumentReference in HAPI). (c) Hybrid.

**DECISION: (a) as system of record, with record-affecting entries additionally projected to FHIR Provenance/AuditEvent; that projection is derived state, not dual mastering.** Rationale: the evidence ledger must outlive and stand apart from the clinical record (GB-7 audit posture; evidence about pipeline loads, dispositions, agent actions is not clinical content); an append-only Postgres table with monotonic sequence, attributed actor, correlation id, PHI-safe payload gives cheap ordered scans plus retention control the load model needs at batch-window write rates; pure FHIR persistence (b) would push operational audit through HAPI's write path during the very load windows being evidenced. The FHIR projection exists so record-native consumers (Provenance per load, C4) see evidence in-band; it is rebuilt from the ledger, never written independently (dual-write ban applies here too).

**Migration seam.** `EvidenceStore` interface in `src/lib/evidence/` modeled directly on `ProviderAccessConsentStore` (id field, attributed mutations, mock Map implementation stays as the selectable mode). `SEAM: evidence-store`. This swap is the template: every remaining in-memory Map retires in the seam-swap order the spine publishes (consent store, gold-card roster, denial rates, then feature stores), each with the same mock-vs-real contract test.

**Consequences.** First concrete proof of C3 in production; GB-7 gets an ordered, attributed, PHI-safe audit substrate; retention policy is table-level, configurable per the 7-year default.

---

## ADR-006: Change propagation / CDC (§4A stage 5)

**Context.** Every committed record change must emit a C2 domain event; dual-write from pipelines to record and graph is banned. Options must cohere with ADR-001/002.

**Options.** (a) Transaction outbox at the load boundary. (b) FHIR Subscription (R4B/R5 topic-based). (c) Store-level CDC (Debezium-class on the HAPI Postgres).

**DECISION: (a) Transaction outbox.** The stage-4 loader commits the FHIR resource write and the outbox row in one transaction; a relay publishes outbox rows to the Kafka-API backbone in commit order per member. Rationale: (b) HAPI's R4B topic-based Subscription support is not mature enough to carry pipeline metadata (batch id, tier label, consent labels, causation id) that the C2 envelope requires; the event would need re-enrichment, reintroducing a second write path. (c) Debezium couples the platform to HAPI's internal table schema, which is not a stable contract and breaks doctrine 6 (the FHIR store is a seam; a managed-FHIR swap would strand store-level CDC entirely). The outbox is portable across any FHIR store implementation because it lives in the pipeline's own schema, is transactional with the load, and replays naturally.

**Migration seam.** The relay is a thin process behind `SEAM: cdc-relay`; a Debezium-class reader consuming the same outbox table could replace the bespoke relay without touching producers or consumers. Internal platform writers that do not pass through stage 4 (SDE dispositions, care-plan writes, consent changes, merge events) use the same outbox pattern in their own transaction scope; there is exactly one way events are born.

**Consequences.** Exactly-once-per-commit event birth; ordering guaranteed per member by partition key plus commit-order relay; projectors consume independently and rebuild from replay; the record remains the single source of truth with the graph and every projection derived.
# Spine Amendment 001 (Phase-3 reconvene, binding)

Status: TARGET-STATE amendments to the spine set, issued against `/home/claude/coalition/adversarial-verdict.md`. Where this file conflicts with adrs.md, contracts.md, trace-matrix.md, load-model.md, or any specialist output, this file wins. All five specialists inherit these rulings as contract text; none may re-litigate them.

---

## 1. C1 implementation ownership (verdict S1, findings item 1)

**DECISION: the entire C1 implementation layer is owned by the Graph & Context Architect (G1): the person-context read model (projector), the person-context endpoint, the O-6 provider-context endpoint, plus the metrics projector.**

Rationale (two sentences): G1 already owns a stage-5 projector (the graph projector), the lens route, the view-model registry, plus the O-3 view-model discipline per plan §3.1, so person-context and metrics projection extend a pattern G1 has already designed rather than grafting a serving layer onto a pipeline scope that ends at event publish. The pipeline pair remains measured against C9.4 MVR scores through feeds and events only; giving it the read side would blur the stage-5 boundary that keeps producers and consumers independently rebuildable.

Boundary rules: the pipeline pair delivers the domain events plus the outbox library (§2); G1's projectors consume the backbone exactly as any other projector, rebuild from replay per C10.2, never read another projector's store. Language-concordance ranking (UC-35/36) is G7 adequacy logic per DP-6, delivered as a shared view-model that G1's provider-context endpoint serves; neither side reimplements the other.

Matrix-row ownership updates (supersede trace-matrix.md component lists where they differ):
- Row 7: unchanged (G1), now explicitly including the person-context projector and endpoint build.
- Row 10: components become "G7 adequacy logic + O-6 shared provider model; G1 serves the provider-context endpoint; G3 referral path".
- Rows 5, 8, 15 (dashboard/metric consumption): metrics projector build is G1; feed events remain G3.
- D1 sheet 3: MVR scores become measurable; the scoring harness reads through G1's projectors.

## 2. ADR-006 atomicity over the FHIR REST seam (verdict S2, adjudication f)

The one-transaction sentence in ADR-006 is **superseded**. The binding pattern, inherited identically by the stage-4 loader and every internal writer (G5 care-plan writes, agentic disposition writes, PA-lifecycle persistence):

1. **Intent commit (transactional anchor).** The application Postgres holds the outbox. The writer commits an intent row transactionally there first: `status=pending`, the full C2 payload, a deterministic FHIR resource id, the idempotency key, actor, correlationId. For internal writers this commit shares the transaction with any app-side state change (the BFF route's transaction scope, per adjudication f: G5 §3.1 form is correct; the stage-4 loader is a batch container no route can call).
2. **Idempotent FHIR apply.** The FHIR write follows over REST as PUT to the deterministic id (or conditional create), safe to retry any number of times. No event exists yet.
3. **Confirm + sequence + publish.** On confirmed FHIR commit (2xx with version id) the writer marks the intent `confirmed` and only then assigns the final per-member sequence, in a per-member critical section (advisory lock on memberId, or partition-affine single writer). The relay publishes confirmed rows in sequence order. **Events emit only after confirmed FHIR commit; sequence order = confirm order = publish order per member.**
4. **Per-member FIFO.** Pending intents for one member drain in intent order; a later intent never enters step 2 before every earlier intent for that member is confirmed or terminally failed. This makes the S4 class of inversion structurally impossible.
5. **Reconciliation sweep.** A sweep visits `pending` intents older than a threshold (default 5 minutes, ASSUMPTION), queries the FHIR store at the deterministic id, then confirms (write landed, crash before confirm) or retries; intents exhausting the retry budget move to `failed` with an alarm plus a quarantine work item. An orphaned FHIR write without an intent cannot occur because every write path begins at step 1.
6. **Colocated fast path.** Where HAPI's Postgres and the application Postgres are one cluster, an implementation may collapse steps 1..3 into one transaction behind the same interface; the intent pattern is the contract, colocation is a permitted specialization that a managed-FHIR swap simply stops using.

Sequencing consequence (binding on the finalizer): the outbox library (G3 build step 2) precedes G5 E3 and agentic E5.

## 3. Outbox retention as the replay source (verdict S3, adjudication c)

**RATIFIED with corrections.** The outbox table is declared append-only with retention aligned to the audit policy (7-year default, configurable, matching DP-5 landing retention). It is the **sanctioned per-member ordered event history**: per-member replay (projector rekey on merge/unmerge, targeted rebuild) reads the outbox table by memberId plus sequence, never scans the topic. G1's assumption is therefore ratified as contract, no longer an ASSUMPTION.

Corrections to C6: broker topic retention is an operational buffer, default 90 days (ASSUMPTION, tunable), sized for consumer lag plus DLQ replay, never for history. "Offset-zero topic replay" in C6 is re-scoped: **full projector rebuild streams from the outbox table through a rebuild publisher**, not from broker retention. Relationship to landing-zone replay: the landing zone remains the disaster-recovery source of truth; if the outbox itself must be rebuilt, G3's dag-replay re-derives it from landed data. Three layers, one direction: landing rebuilds outbox; outbox rebuilds projections; the topic buffers live flow. G1 SP-2 and G3 SP-7 merge into one joint spike executing this section.

## 4. Compliance orphans (verdict §4, findings item 8)

**UC-64 break-glass access. Owner: spine C1 contract (this amendment) + G1 build (serving surface) + authz guard extension.** Direction: add an `emergency-treatment` requestor purpose to C1. It grants a time-boxed override token (default 4h, config data), requires mandatory free-text reason capture at invocation, widens consent filtering only per an explicit policy matrix (42 CFR 2.51 medical-emergency provision governs any Part 2 widening; the matrix is data, reviewed by compliance before enablement), writes a distinct `break-glass` audit class to the ADR-005 ledger, and auto-creates a post-hoc review item in the existing work queue. Feature-flagged, disabled by default, HITL review of every invocation.

**UC-17 Part 2 re-disclosure scrubbing. Owner: pipeline pair (G3), as one egress-scrubbing library at the extract/report boundary.** Direction: a single library applies segmentation scrubbing to every egress path (drop Part 2-labeled content where consent for the disclosure purpose is absent; attach the 2.32 re-disclosure notice where consented content flows); O-5's report generator is its first consumer; any future QARR path must consume it. **Binding interim rule (resolves S5): no population-level extract or report path ships, in any phase, until it consumes this library.** X4 records the rule in the compliance posture document.

**UC-03 record-side unmerge re-attachment. Owner: G3, under a DP-7 semantics extension the spine issues here.** Direction: every loaded resource already carries source attribution (Provenance) plus a crosswalk row (source record to anchored member) persisted at stage 3/4; `identity.member.unmerged` triggers a record-repair DAG that selects every FHIR resource whose provenance sources belong to the departing identity, re-subjects each to the correct Patient via idempotent PUT at the deterministic id, emits the corresponding correction events through the §2 outbox, and verifies the UC-03 acceptance criterion (no resource from member A's source feeds remains attached to member B) as the DAG's reconciliation gate. Projection-side rekey (already designed by G1) consumes the resulting events; landing-zone replay is the fallback where a crosswalk row is missing.

## 5. Remaining spine findings: resolved or deferred

- **S4 sample-data sequence bug: FIXED in place.** contracts.md C2 ADT sample sequence corrected from 117 to 115 (it commits before the observation's 116); the sample set is now monotone per member across contracts.md and golden-path.md.
- **S6 household-link timing: RESOLVED.** C9 row 19 P1 target amended to "partial T1 @834 dependent linkage" (related-person.linked emitted from 834 dependent segments); owner G3, nearly free, unblocks UC-68's enrollment-cycle need. P2/P3 columns unchanged.
- **Adjudication (a): RATIFIED.** Escalation ladders are role-rank configuration data evaluated over care-team membership (10@T1 suffices; no C9 tier ever promises a reporting hierarchy); the degraded P1 posture (one audited hop, then park) is DP-3-conformant; pilot roster deployments get P1 attribution via the O-2 loader.
- **Adjudication (b): RATIFIED with the corrected rationale.** 834 diff-load is the doctrine-conformant default (a no-op upsert is not a change; §4A stage 5 requires events per change); emit-all is the deviation requiring spine re-derivation of the batch-class budget; G3 strikes its order-of-magnitude sentence; G3 R8 goes to the owner as a decision item. load-model.md §2.1 is annotated accordingly by this amendment.
- **Adjudication (e): RATIFIED as C10 annotations.** referral.stalled has one emitter: the pipeline outbox, for platform-reported stalls only; internally inferred stalls are SDE signals (signal.raised with a stall signalType), never a record-domain event. Canonical signal topology: intake consumes domain-events, maps via the taxonomy, publishes signal.raised to the signals topic, folds from its own projection; g2g4 §3.1.2 step 1 is superseded by its own §6. G1 completes its edge taxonomy before any mapping module builds.
- **Adjudication (f): RATIFIED.** Internal-writer outbox (§2) for care-plan and PA persistence; dependency order per §2 above.
- **G3-b (834 possible-match band): RESOLVED.** The 60..90 band on 834 records routes to steward review like every other feed; an 834 no-match below the band may create a new anchored identity; within the band it never does.
- **G3-c (UC-45): RESOLVED.** Idempotency keys gain a second, claim-identity-scoped dedupe check (payer claim id + adjustment sequence) applied at stage 3, so resubmissions across batches converge; G3 specifies the key form.
- **UC-43 discrepancy gate: ASSIGNED to G3.** One reconciliation rule joining pa.* outcomes against claim adjudication outcomes, alarmed on approved-then-denied discrepancies; feeds the golden thread.
- **G1-d / verdict item 12 (keystone ranking, hypothesis-edge workflow): ASSIGNED to G1.** Keystone ranking is a query-layer capability: deterministic scoring over BLOCKS assertions with weights as data (graph informs, never acts, per DP-1); the hypothesis-edge confirm/reject lifecycle is G1-owned state whose review surface reuses the existing work queue (no second inbox). Both are P2 acceptance items for trace step 7's "keystone barrier legible" claim.
- **UC-19 / UC-65 (query additions): ASSIGNED to G1.** An around-event time-window query type joins the lens set; a household lens is added as the stated exception to the single-partition claim, which is re-worded to "per-lens declared partition scope". The acceptance-query set is stated as five demo lenses plus declared additions (resolves G1-a).
- **UC-67 (proxy requestor model): PARTIALLY RESOLVED, remainder deferred.** C1 gains additive requestor classes `member` and `proxy` (v1.1, additive per evolution rules); minor-consent segmentation label content is policy, not machinery, so the rule-set content is DEFERRED to owner plus compliance input, with the generic label machinery (G3 segmentation rules as data) ratified as the landing place.
- **UC-46 (attribution/milestone packet): DEFERRED, named.** F3-adjacent; parked alongside QARR reporting with the O-5 generated-from-view-models pattern named as the template. Rationale: ledger and graph primitives exist; packaging is reporting scope the owner has parked, and §4's interim scrubbing rule bounds the compliance exposure meanwhile.
- **F1 owner escalation: DEFERRED to the owner, explicitly.** The spine disposition (gap derivation inside G2 scope) stands as the working plan; the finalizer surfaces the escalation (G2 scope growth vs unparking a G6 slice) rather than treating it as owner-approved.
- **Verdict item 9 (four one-per-specialist rubric failures):** G1's outbox interface is resolved by §3; G3's projection ownership by §1; the G2G4 citation-provenance sentence and the G5 §1 persistence wording are specialist revision notes, corrected at Phase-4 merge, no rerun.
- **Verdict item 11 (X4 Phase-4 obligations): CARRIED unchanged** to the finalizer (capability-brief row closes at D6 assembly; RECONSTRUCTED label survives every derivative; label audit runs across all D7 documents).

---

## Amendment effects table

| File and section | Effect |
|---|---|
| spine/adrs.md, ADR-006 "DECISION" + "Consequences" | Superseded by §2 (intent pattern; one-transaction wording void; colocated fast path) and §3 (retention) |
| spine/contracts.md, C6 "Replay of a full topic from offset zero" | Superseded by §3 (rebuild streams from the outbox table; topic retention 90-day buffer) |
| spine/contracts.md, C2 ADT sample | Corrected in place (sequence 117 to 115) per §5 S4 |
| spine/contracts.md, C9.1 row 19 | P1 target superseded by §5 S6 (partial T1 @834 dependent linkage) |
| spine/contracts.md, C1 | Extended additively: emergency-treatment purpose (§4 UC-64); member and proxy requestor classes (§5 UC-67); serving ownership per §1 |
| spine/contracts.md, C10.1 | Annotated per §5 adjudication (e): referral.stalled single emitter; canonical signal-intake topology |
| spine/load-model.md, §2.1 batch-class derivation | Annotated per §5 adjudication (b): 834 window assumes diff-load; emit-all requires spine re-derivation |
| spine/trace-matrix.md, rows 5, 7, 8, 10, 15 component lists | Ownership superseded by §1 |
| spine/manifests.md, §1 G1 and §2 G3 design obligations | Extended: G1 adds person-context projector, endpoints, metrics projector, keystone ranking, hypothesis lifecycle, query additions; G3 adds egress-scrubbing library, record-repair DAG, UC-43 gate, claim-identity dedupe, 834 dependent linkage |
| g1-graph.md, §3.6 item 2; §3.7 single-partition claim; §3.9 metrics-projector assignment; §3.5 lens count | §3.6 ratified as contract (§3); §3.7 re-worded per §5 UC-65; §3.9 superseded by §1 (G1 builds it); lens set stated as five plus declared additions |
| g3-pipelines.md, §3.12 "spine's projection layer"; §3.2.A no-match rule; the order-of-magnitude sentence; §5/§13 | §3.12 superseded by §1; §3.2.A superseded by §5 G3-b; sentence struck per adjudication (b); §5/§13 gain the §5-assigned epics (scrubbing library, record-repair DAG, UC-43 gate, dedupe key, 834 dependents) |
| g2g4-agentic.md, §3.1.2 step 1; escalation-ladder wording; §2 provenance sentence | Step 1 superseded by its own §6 per adjudication (e); ladder becomes role-rank config per adjudication (a); provenance sentence corrected at merge (verdict item 9) |
| g5-careplan.md, §1 persistence wording | Superseded by its own §3.1 per adjudication (f); outbox library precedes G5 E3 |
