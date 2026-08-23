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
