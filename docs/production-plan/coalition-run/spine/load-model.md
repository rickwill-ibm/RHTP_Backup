# Load Model (Phase-1 Spine, per DP-5)

Status: TARGET-STATE planning model. Governs ADR-001..006, worker sizing, partition counts, HAPI posture. Parameters come from plan §6A DP-5; utilization factors below are labeled ASSUMPTION and must be replaced with measured feed statistics when the first real feeds land (O-2). Budgets may only be re-derived by the spine, never dropped by specialists.

## 1. Population parameters (DP-5, binding)

| Parameter | Pilot | State |
|---|---|---|
| Members | 50,000 (county scale) | 7,000,000 (NY Medicaid scale) |
| Tenancy | Single-tenant per state deployment; isolation by deployment (X3), never code branching | same |
| Scale ratio | 1x | 140x |

## 2. Feed cadences and derived event rates

Cadences are DP-5. Per-member utilization factors are ASSUMPTION (Medicaid-typical planning values; replace with measured rates at first feed).

| Feed | Cadence | Factor (ASSUMPTION) | Pilot volume | State volume | Derived state rate |
|---|---|---|---|---|---|
| 834 full | Monthly | 1 record/member | 50K rec/run | 7M rec/run | 486 rec/s to meet the 4h budget |
| 834 delta | Weekly | 0.7% weekly churn | ~350/wk | ~49K/wk | trivial (<4 rec/s in a 4h window) |
| 837/835 claims | Weekly batch | 25 claims/member/yr | ~24K/wk | ~3.37M/wk | 234 rec/s in a 4h window |
| Pharmacy dispense | Daily batch | 12 fills/member/yr | ~1.6K/day | ~230K/day | ~16 rec/s in a 4h window |
| ADT (HL7v2) | Continuous stream | 3 events/member/yr | ~0.3/min avg | ~40/min avg; ~200/min daytime peak (peak factor 5, ASSUMPTION) | stream lane |
| QE CCD (Hixny-class) | Micro-batch, query-driven | ~1 CCD per care event | tracks ADT | tracks ADT (~200/min peak) | micro-batch lane |
| In-product screening | Continuous | 30% screened/yr incl rescreens | ~40/day | ~5.8K/day (~4/min) | stream lane |
| Referral webhooks | Continuous | tied to referral volume | <1/min | <20/min | stream lane |

### 2.1 Domain-event rate (backbone sizing driver)

Every committed record change emits at least one C2 event (§4A stage 5). Two traffic classes, declared in the envelope (`class` field):

- **Stream-class** (latency-budgeted: ADT, screening, referral status, PA status, consent, signals): state-scale peak ≈ 200 + 4 + 20 + overhead ≈ **<300 events/min peak**. The doctrine-4 gates (1K/min sustained, 5K/min burst, 10K/min headroom) therefore hold with >3x margin at state scale. CONFIRMED, no re-derivation needed.
- **Batch-class** (claims/834/pharmacy load windows): weekly claims load emits ~2 events per loaded resource (resource event plus derived shadow event, ASSUMPTION) ≈ 6.7M events per state-scale window ≈ **~470 events/s (~28K/min) during load windows**. Batch-class events are exempt from the stream latency budgets by declaration; projectors are permitted to lag during load windows provided the 4h batch budget and the post-window catch-up alarm (lag drained within 1h of window close) hold. This exemption is binding contract text (C6 §traffic classes).

The linear-scale argument to 100K/min (doctrine 4): rate scales by adding partitions plus consumer pods; nothing in the design holds cross-member state, so the ceiling is partition count times per-partition throughput. 96 partitions x 2K msg/min/partition conservative = 192K/min mechanical headroom at state scale.

## 3. Partition counts

Sizing rule (binding): partitions >= peak rate divided by conservative per-partition ordered throughput (2K msg/min with idempotent processing, ASSUMPTION), times 4 headroom, rounded up. Partition key is memberId everywhere (C6); per-member ordering is what the SDE and merge/unmerge replay (DP-7) require.

| Topic | Pilot | State |
|---|---|---|
| domain-events (all C10 types) | 12 | 96 |
| signals (SDE intake) | 6 | 48 |
| dispositions/touchpoints | 6 | 24 |
| DLQ (per topic, mirrored keying) | 1:1 with parent | 1:1 with parent |

Partition counts are set at topic creation for the state deployment target so rekeying is never needed mid-flight; pilot uses the smaller counts because the deployment is separate (single-tenant doctrine).

## 4. Worker sizing logic

All workers are stateless (evidence: engines are pure functions; the substrate is the greenfield). Sizing logic, not fixed fleets:

- **Loader/transform workers (batch lane):** 834 full file at state scale needs 486 rec/s. Per-worker throughput ASSUMPTION 35 rec/s (transform + validate + upsert + outbox commit). Floor: 16 loader workers at state scale, 2 at pilot. Horizontal only; no vertical dependency.
- **Match-scoring workers (DP-7 path):** blocking keys (DOB, zip, phonetic last name) bound candidates to <=50 per inbound record (ASSUMPTION, alarmed if exceeded). Scoring cost ~0.1ms/pair pure TS (matchEngine.ts is dependency-free Levenshtein plus weighted rules) gives ~200 rec/s/core. 834 full-file peak needs 3 cores; posture: worker_threads pool of 4 per pod, 2 pods state, 1 pod pilot.
- **Stream consumers:** one consumer group per projector (graph, SDE intake, metrics), consumers <= partitions. State: 8 consumers per group covers 300/min peak with two orders of magnitude margin; the count exists for partition parallelism during batch-class windows, not steady load.
- **Journey lane (Temporal-class):** workflow count tracks open journeys, not events. ASSUMPTION 2% of members in an active multi-day journey: pilot 1K, state 140K open workflows; well inside a small self-hosted Temporal cluster (Postgres-backed) per published Temporal-class sizing. Two workers pilot, four state.

## 5. HAPI posture (doctrine 4, made concrete)

- **Pilot:** 2 clustered HAPI JPA nodes behind a load balancer; Postgres 4 vCPU with tuned connection pool; validation performed at pipeline stage 4 ($validate as an async boundary step, never inside the synchronous write path); all read traffic that has a projection (person-context, graph, dashboards) reads CQRS projections, so HAPI serves loads plus canonical-record reads only.
- **State:** 4 to 8 HAPI nodes; Postgres 16 vCPU, partitioned large tables, WAL and index tuning; bulk loads via batched transaction bundles sized to the 4h windows; same CQRS rule. HAPI search is never on the person-context hot path.
- HAPI remains a seam (doctrine 6); managed FHIR adapters are conformance-gated roadmap items (ADR-004).

## 6. DP-5 budgets, confirmed

Each budget confirmed or re-derived with one-line rationale. All six CONFIRMED as stated; none re-derived.

| Budget (p95) | Verdict | Rationale |
|---|---|---|
| Person-context read <= 300ms | CONFIRMED | Served from a memberId-keyed Postgres projection (single-digit ms query) plus authz/consent filtering; HAPI search never on this path. |
| Graph lens query <= 2s | CONFIRMED | Per-member subgraph is bounded (order 10^2..10^3 nodes; demo reference 52/67), depth <= 3 traversal over partitioned graph tables; comfortably inside 2s. |
| Signal -> disposition <= 5s | CONFIRMED | Per-member signal-batch fold over in-memory policy data; cost is one queue hop plus a policy read, both sub-second at <300/min stream peak. |
| ADT receipt -> signal <= 60s | CONFIRMED | Stages 2..5 run as stream consumers with per-hop budgets <5s at 200/min peak; 60s end-to-end holds with >2x margin. |
| 834 batch landed -> loaded <= 4h | CONFIRMED | 7M records at 486 rec/s sustained across 16 loader workers (35 rec/s each, ASSUMPTION per-worker rate; the worker floor is the derived commitment). |
| Dashboard view-model read <= 1s | CONFIRMED | Metric projections are precomputed by the metrics projector; the read is a keyed query, never inline aggregation (the G6 lesson). |

Retention (DP-5, restated as binding): landing zone raw 7 years default, configurable per audit policy; quarantine TTL 30 days with alarmed expiry. Load-test gates (doctrine 4): 1K/min sustained, 5K/min burst, 10K/min headroom, encoded in D4 k6 scenarios against stream-class traffic; batch gates are the window budgets above.
