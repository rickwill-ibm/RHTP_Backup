# D4: Load-Test Specification (k6 scenarios + gates)

Status: TARGET-STATE test specification with honestly labeled runnability. CURRENT state (evidence pack): the app runs `next dev` with in-process Map stores; no queue, no workers, no pipelines, no projections; HAPI FHIR JPA runs as a single Docker node; person-context, graph lens, SDE, dashboards-from-view-models, and every pipeline are unbuilt. Therefore almost every scenario below is gated on the build that makes its subject exist. Each scenario carries a runnability label:

- **NOW**: runnable against the current dev-mode app plus the existing HAPI Docker container, today, as harness proof or baseline capture.
- **AFTER X1**: requires the execution substrate (Redpanda backbone per ADR-002, workers, Postgres projections, Temporal) and the component under test to exist. Sub-labels name the specific build dependency where it is narrower than all of X1.

Budgets come from DP-5 as confirmed by the load model §6. Specialists may not weaken them; only the spine re-derives (plan §6A). Scale gates come from doctrine 4. The absorbed test plan from `docs/remaining-work-and-test-plan.md` §3 (route-level 401/403/400/422/200 + PHI-safe assertions per BFF route, axe-core Playwright checks, policy corpus-accuracy and adequacy seed-spread regression guards) is adopted by reference as the functional companion to this performance spec; those tests are Playwright/vitest scope, not k6, and are listed in §10.

## 0. Common harness conventions

- **Tooling.** k6 OSS for all HTTP scenarios. Event-lane scenarios use xk6-kafka (Kafka API only, C7-clean) to produce onto the backbone and measure end-to-end latency via custom Trend metrics computed from envelope timestamps read back through probe endpoints. ASSUMPTION: xk6-kafka is acceptable tooling; it speaks the Kafka wire protocol and introduces no proprietary control-plane dependency.
- **Latency probes.** Where the measured path ends off-HTTP (a disposition decided, a signal raised), the system under test exposes a PHI-safe ops probe (`/api/ops/probe/latency?correlationId=...`) returning the recorded pipeline hop timestamps from the evidence ledger (ADR-005). k6 computes `Trend` values from these. The probe is a build-gated deliverable of the substrate work and a prerequisite for scenarios 3, 4, and the scale gates. Probes are BFF routes behind the authz guard, codes-and-timestamps only.
- **Environment parity rule.** Budget verdicts count only when run against a production-shaped deployment (containerized services, Postgres projections, Redpanda, clustered HAPI per load model §5) provisioned by the D5 IaC. A budget met on a laptop proves nothing; a budget met on the pilot stack is the gate.
- **Data seeding.** All scenarios seed from `tools/seed/gen-feed-fixtures/` (G3 §3.10): deterministic generators for 834/837/CCD/ADT/flat-file fixtures and synthetic member populations, any member shape, never Maria-specific. Standard populations: `pop-50k` (pilot scale) and `pop-1m` (state-scale sample; full 7M only for the 834 window test where volume is the subject). Populations include a consent mix (opt-outs present), a Part 2-labeled fraction, and a 60..90 possible-match fraction so consent filtering, segmentation drops, and identity holds are exercised under load, not just in unit tests. ASSUMPTION: 5% opt-out, 3% Part 2-labeled, 2% possible-match band; tune with real feed statistics per the load model's replace-with-measured rule.
- **Thresholds abort on breach.** Every scenario sets `abortOnFail: true` with a `delayAbortEval` long enough to pass warmup, so CI runs fail fast and red gates block merge (the C5 discipline applied to performance).
- **Metrics tagging.** Every request carries `tags: { scenario }` so thresholds bind per scenario when suites are combined.

---

## 1. Scenario S1: person-context read (budget: p95 <= 300ms)

**Runnability: AFTER X1 + G1 person-context projector and endpoint (amendment-001 §1: G1 owns the C1 serving layer).**

**Purpose.** Prove the C1 read path (`GET /api/person-context/{memberId}`) holds 300ms p95 including authz, consent filtering, and Part 2 read-time exclusion, served from the memberId-keyed Postgres projection with HAPI never on the path (load model §6 rationale).

**k6 sketch.**

```js
export const options = {
  scenarios: {
    person_context: {
      executor: 'ramping-arrival-rate',
      startRate: 5, timeUnit: '1s',
      preAllocatedVUs: 50, maxVUs: 200,
      stages: [
        { target: 20, duration: '2m' },   // warmup
        { target: 100, duration: '10m' }, // sustained: ~6K reads/min, ASSUMPTION for pilot UI load
        { target: 200, duration: '3m' },  // burst
      ],
    },
  },
  thresholds: {
    'http_req_duration{scenario:person_context}': ['p(95)<300', 'p(99)<1000'],
    'http_req_failed{scenario:person_context}': ['rate<0.001'],
    'checks{scenario:person_context}': ['rate>0.999'],
  },
};
export default function () {
  const memberId = pickWeighted(members);  // zipf-ish access, hot members exist
  const res = http.get(
    `${BASE}/api/person-context/${memberId}?sections=demographics,coverage,conditions,gaps,sdoh,careTeam&purpose=care-coordination`,
    { tags: { scenario: 'person_context' }, headers: auth() });
  check(res, {
    'status 200 or 403-optout': (r) => r.status === 200 || r.status === 403,
    'tier labels present': (r) => r.status !== 200 || /"tier":/.test(r.body),
    'no Part 2 leak for this purpose': (r) => r.status !== 200 || !/part2/.test(sectionSecurityLabels(r)),
  });
}
```

**Data seeding.** `pop-50k` loaded through real pipelines (or, before P2 feeds exist, through `tools/seed/load-bundle.mjs` at fixture scale with projections rebuilt from replay); projection warm; opt-out and Part 2 fractions present so the consent code path is on the measured path.

**Pass gate.** p95 < 300ms and p99 < 1s over the sustained stage at pilot request rate; zero consent-leak check failures (a single leak fails the run regardless of latency).

**Failure diagnosis hints.** p95 blown: check for HAPI on the read path (a FHIR search in the trace means the CQRS rule broke); check projection query plan (must be a keyed lookup, not a scan); check authz/consent evaluation doing per-section store reads instead of one batched read; check Next.js route running dev-mode (parity rule violated). p99-only blown: Postgres connection-pool exhaustion or GC pauses in the BFF; check pool size vs VU count.

---

## 2. Scenario S2: graph lens query (budget: p95 <= 2s)

**Runnability: AFTER X1 + G1 graph projector and lens query layer (ADR-001 Postgres graph tables).**

**Purpose.** Prove the five DP-1 lens queries (plus the declared additions: around-event time-window, household lens per amendment-001 §5) answer within 2s p95 over per-member subgraphs of order 10^2..10^3 nodes, depth <= 3, via `GET /api/person-context/{memberId}/lens/{lensId}`.

**k6 sketch.**

```js
export const options = {
  scenarios: {
    graph_lens: {
      executor: 'constant-arrival-rate',
      rate: 30, timeUnit: '1m',            // lens queries are analyst-paced, ASSUMPTION
      duration: '15m', preAllocatedVUs: 20, maxVUs: 60,
    },
  },
  thresholds: {
    'http_req_duration{scenario:graph_lens}': ['p(95)<2000', 'p(99)<5000'],
    'http_req_failed{scenario:graph_lens}': ['rate<0.001'],
  },
};
export default function () {
  const lens = pick(['care-journey', 'sdoh-barriers', 'care-team', 'utilization', 'interventions',
                     'around-event', 'household']);
  const res = http.get(`${BASE}/api/person-context/${pick(members)}/lens/${lens}`,
    { tags: { scenario: 'graph_lens' }, headers: auth() });
  check(res, { '200': (r) => r.status === 200,
               'nonempty result': (r) => JSON.parse(r.body).nodes.length > 0 });
}
```

**Data seeding.** Synthetic members with deliberately fat subgraphs: a `pop-graph-heavy` fixture cohort at the 10^3-node upper bound (the demo's 52/67 reference instance is the floor, not the test case), including dated edges spanning 3+ years so temporal filtering is exercised, plus household-linked members for the household lens.

**Pass gate.** All lens types under 2s p95 at the heavy-cohort bound; recursive-CTE depth verified <= 3 in the query plan.

**Failure diagnosis hints.** One lens slow, others fine: that lens's query shape (household lens crosses partitions by design; check its declared partition scope). All slow: missing member-partition index on edge tables, or the projector writing unindexed; check table bloat after replay-heavy test days (VACUUM posture). Timeout spikes after merges: rekey-by-replay running concurrently; expected during rekey, but the lens read must degrade to lag, not error.

---

## 3. Scenario S3: signal to disposition (budget: p95 <= 5s)

**Runnability: AFTER X1 + G2 SDE stream consumer.**

**Purpose.** Prove the SDE folds a per-member signal batch to a disposition (act / suppress / delay / bundle) within 5s p95 of the `signal.raised` event landing on the signals topic, under realistic cross-signal fatigue-rule load.

**k6 sketch.**

```js
import { Writer } from 'k6/x/kafka';
import { Trend } from 'k6/metrics';
const dispositionLatency = new Trend('signal_to_disposition_ms', true);
export const options = {
  scenarios: {
    sde: {
      executor: 'constant-arrival-rate',
      rate: 300, timeUnit: '1m',           // state-scale stream peak per load model §2.1
      duration: '30m', preAllocatedVUs: 30, maxVUs: 100,
    },
  },
  thresholds: {
    'signal_to_disposition_ms': ['p(95)<5000', 'p(99)<15000'],
    'checks{scenario:sde}': ['rate>0.999'],
  },
};
export default function () {
  const evt = signalFixture(pick(members));       // C2-valid signal.raised, class: stream
  writer.produce({ messages: [{ key: evt.memberId, value: JSON.stringify(evt) }] });
  const hop = pollProbe(evt.correlationId, 20_000); // evidence-ledger hop timestamps
  dispositionLatency.add(hop.dispositionDecidedAt - hop.signalRaisedAt);
  check(hop, { 'disposition explainable': (h) => !!h.policyId,
               'per-member order held': (h) => h.sequenceMonotone === true });
}
```

**Data seeding.** Disposition policy data loaded (contact-frequency caps, channel preferences, consent scope per DP-2); members pre-loaded with signal history so fatigue rules actually fire; a signal mix spanning the DP-2 taxonomy (gaps, ADT, screening, referral stall, denial, PA status) so the fold path is heterogeneous. The "5 approved, 3 suppressed, 1 delayed" acceptance shape must be reproducible from a named fixture member.

**Pass gate.** p95 < 5s at 300/min sustained; every disposition names its policy (explainability is a hard check); zero per-member ordering violations.

**Failure diagnosis hints.** Latency scales with signal history length: the fold is re-reading full history per signal instead of its own projection; check the SDE's fold-state store. p95 fine but p99 blown: consumer-group rebalances (check partition assignment stability) or policy data being re-fetched per event instead of cached-with-invalidation. Ordering check failures: someone keyed a topic by something other than memberId, or a consumer commits out of order; this is a C6 defect, not a tuning item.

---

## 4. Scenario S4: ADT receipt to signal (budget: p95 <= 60s)

**Runnability: AFTER X1 + G3 ADT stream adapter (stages 2..5) + SDE intake.**

**Purpose.** Prove the full stream-lane traversal: ADT message received at ingress, landed, validated, normalized, identity-resolved, loaded with Provenance, outbox-relayed as `encounter.admitted`, consumed by SDE intake, `signal.raised` emitted, all within 60s p95 at daytime peak with per-hop budgets < 5s (load model §6).

**k6 sketch.**

```js
const adtToSignal = new Trend('adt_to_signal_ms', true);
const hopBudget = new Trend('max_hop_ms', true);
export const options = {
  scenarios: {
    adt: {
      executor: 'ramping-arrival-rate',
      startRate: 40, timeUnit: '1m',       // state avg
      preAllocatedVUs: 20, maxVUs: 80,
      stages: [
        { target: 40, duration: '10m' },
        { target: 200, duration: '20m' },  // daytime peak, load model §2
        { target: 40, duration: '10m' },
      ],
    },
  },
  thresholds: {
    'adt_to_signal_ms': ['p(95)<60000'],
    'max_hop_ms': ['p(95)<5000'],
    'checks{scenario:adt}': ['rate>0.99'],
  },
};
export default function () {
  const msg = adtFixture(pick(members));   // HL7v2 A01/A03 mix, known-identity majority
  http.post(`${INGRESS}/api/ingest/adt`, msg.payload, { tags: { scenario: 'adt' }, headers: auth() });
  const hops = pollProbe(msg.correlationId, 90_000);
  adtToSignal.add(hops.signalRaisedAt - hops.receivedAt);
  hopBudget.add(hops.maxSingleHopMs);
  check(hops, { 'loaded with provenance': (h) => h.recordLoaded,
                'possible-match parked not loaded': (h) => !h.loadedUnderGuessedIdentity });
}
```

ASSUMPTION: ingress is the REST relay form (SP-4 pending); if MLLP wins, the injector becomes a thin MLLP producer feeding the same measurement path.

**Data seeding.** `pop-50k` with anchored identities; 2% of injected ADT deliberately in the 60..90 match band to assert the park-not-load path under load (parked messages are excluded from the latency Trend but counted in a separate `adt_parked` Counter with its own alarm expectation).

**Pass gate.** p95 < 60s end-to-end and every hop < 5s p95 through the full peak stage; zero guessed-identity loads.

**Failure diagnosis hints.** End-to-end blown but hops fine: queueing between hops (consumer lag; check consumer count vs partitions and the outbox relay's confirm-sequence critical section under amendment-001 §2 step 3: the per-member advisory lock serializing unrelated members means the lock scope is wrong). Stage-4 hop blown: $validate on the synchronous path (load model §5 violation) or HAPI write latency (check node count and Postgres pool). Stage-3 hop blown: match-engine candidates exceeding the <=50 blocking bound (the alarm should already be firing).

---

## 5. Scenario S5: 834 landed to loaded (budget: <= 4h for the state-scale full file)

**Runnability: AFTER X1 + G3 834 adapter + dag-834-full on the pilot IaC stack. A pilot-scale (50K) rehearsal runs first; the 7M-record run is a state-stack gate.**

**Purpose.** Prove the batch lane loads a full 834 file inside the window at the derived rate (486 rec/s sustained across the 16-worker floor at state scale), with diff-load semantics, exact reconciliation, and the post-window projector catch-up alarm honored (lag drained within 1h of window close, C6 traffic classes).

**k6 sketch.** k6 orchestrates and asserts; the DAG does the work.

```js
const windowMs = new Trend('batch_window_ms', true);
const loadRate = new Trend('load_rec_per_s', true);
export const options = {
  scenarios: {
    batch_834: { executor: 'per-vu-iterations', vus: 1, iterations: 1, maxDuration: '6h' },
  },
  thresholds: {
    'batch_window_ms': ['p(95)<14400000'],          // 4h
    'load_rec_per_s': ['avg>486'],                   // state scale; 50K rehearsal asserts avg>35/worker
    'checks{scenario:batch_834}': ['rate==1'],
  },
};
export default function () {
  const batch = http.post(`${BASE}/api/ops/pipeline/trigger`,
    JSON.stringify({ dag: 'dag-834-full', fixture: 'gen-834-full-7m' }),
    { tags: { scenario: 'batch_834' }, headers: auth() });
  const done = pollBatchClosed(batch.json('batchId'), 6 * 3600_000);
  windowMs.add(done.closedAt - done.landedAt);
  loadRate.add(done.loaded / ((done.closedAt - done.landedAt) / 1000));
  check(done, {
    'reconciliation exact': (d) => d.in === d.loaded + d.rejected,
    'diff-load: no-op members emit no events': (d) => d.eventsEmitted <= d.changedRecords * 2,
    'projector catch-up <= 1h': (d) => d.projectorLagDrainedMs <= 3600_000,
    'batch-class events labeled': (d) => d.streamClassEventsDuringWindow === 0,
  });
}
```

**Data seeding.** `gen-feed-fixtures` produces a 7M-member 834 full file (state gate) and a 50K file (pilot rehearsal), with a controlled changed-record fraction (ASSUMPTION 3% month-over-month change) so diff-load event volume is predictable, plus an injected 0.3% malformed-entry fraction to prove quarantine does not stall the window.

**Pass gate.** Window < 4h; reconciliation equality exact (a mismatch fails regardless of speed); catch-up alarm satisfied; event count consistent with diff-load (an emit-all explosion is an amendment-001 adjudication (b) violation, escalated, not tuned around).

**Failure diagnosis hints.** Rate below floor: count actual loader workers (16 at state scale is the commitment); measure per-worker rec/s vs the 35 ASSUMPTION; if per-worker rate is the shortfall, SP-2's $validate batching is the first suspect (check batched vs per-entry validation), then HAPI bulk-bundle sizing, then outbox-commit contention (amendment-001 §2 intent pattern adds a Postgres round-trip per record; batch intents per bundle). Window fine but catch-up blown: projector consumer count below partition parallelism during the window burst (~28K/min batch-class per load model §2.1).

---

## 6. Scenario S6: dashboard view-model read (budget: p95 <= 1s)

**Runnability: AFTER X1 + G1 metrics projector (amendment-001 §1: metrics projector build is G1) + at least one dashboard swapped to view-models.**

**Purpose.** Prove dashboard reads are keyed queries against precomputed metric projections, never inline aggregation (the G6 lesson), holding 1s p95 during a batch load window (the hostile case: projections under write pressure).

**k6 sketch.**

```js
export const options = {
  scenarios: {
    dashboards: {
      executor: 'constant-arrival-rate',
      rate: 120, timeUnit: '1m', duration: '20m',   // ASSUMPTION: pilot ops-user pool
      preAllocatedVUs: 20, maxVUs: 60,
    },
  },
  thresholds: {
    'http_req_duration{scenario:dashboards}': ['p(95)<1000', 'p(99)<3000'],
    'http_req_failed{scenario:dashboards}': ['rate<0.001'],
  },
};
export default function () {
  const vm = pick(['adequacy-summary', 'adequacy-county', 'pipeline-health', 'population-gaps']);
  const res = http.get(`${BASE}/api/view-models/${vm}?region=${pick(regions)}`,
    { tags: { scenario: 'dashboards' }, headers: auth() });
  check(res, { '200': (r) => r.status === 200,
               'freshness declared': (r) => !!r.headers['X-Projection-As-Of'] || /"asOf"/.test(r.body) });
}
```

**Data seeding.** Metric projections built from a `pop-50k` pipeline load; the scenario is co-scheduled with a running dag-claims-weekly load (via the S5 trigger mechanics) so reads are measured under projector write load, per the stale-screens risk (G3 §15.6).

**Pass gate.** p95 < 1s including during the co-scheduled load window; every response declares its freshness (declared staleness is acceptable, undeclared is a defect).

**Failure diagnosis hints.** Slow only during load windows: reads and projector writes contending on the same table without the projection's read-model separation, or missing covering index. Slow always: the endpoint is aggregating inline (grep the route for GROUP BY over event-scale tables; that is the banned pattern resurfacing).

---

## 7. Scale gates SG-1/2/3: 1K/min sustained, 5K/min burst, 10K/min headroom

**Runnability: AFTER X1 (backbone + at least the graph, SDE-intake, and metrics projectors consuming). These gates test the substrate, not any single feature.**

**Purpose.** Doctrine 4's stream-class gates. State-scale organic peak is < 300/min (load model §2.1), so these run at 3x..30x organic peak to prove the linear-scale posture: partitions + stateless consumers, no cross-member state, budgets intact under load.

**k6 sketch.** One script, three scenarios, xk6-kafka producing C2-valid stream-class events across the full C10 event-type mix, keyed by memberId across `pop-50k`.

```js
export const options = {
  scenarios: {
    sustained_1k: {
      executor: 'constant-arrival-rate', rate: 1000, timeUnit: '1m',
      duration: '60m', preAllocatedVUs: 50, maxVUs: 150, exec: 'produceEvent',
    },
    burst_5k: {
      executor: 'ramping-arrival-rate', startRate: 1000, timeUnit: '1m',
      stages: [{ target: 5000, duration: '2m' }, { target: 5000, duration: '15m' },
               { target: 1000, duration: '2m' }],
      preAllocatedVUs: 100, maxVUs: 400, exec: 'produceEvent', startTime: '65m',
    },
    headroom_10k: {
      executor: 'ramping-arrival-rate', startRate: 1000, timeUnit: '1m',
      stages: [{ target: 10000, duration: '3m' }, { target: 10000, duration: '10m' }],
      preAllocatedVUs: 200, maxVUs: 800, exec: 'produceEvent', startTime: '90m',
    },
  },
  thresholds: {
    'consumer_lag_events{gate:sustained}': ['p(95)<1000', 'max<5000'],
    'signal_to_disposition_ms{gate:sustained}': ['p(95)<5000'],
    'adt_to_signal_ms{gate:sustained}': ['p(95)<60000'],
    'consumer_lag_events{gate:burst}': ['max<50000'],
    'lag_drain_after_burst_ms': ['max<600000'],     // burst lag drains within 10 min, ASSUMPTION
    'dropped_or_dlq_unexpected': ['count==0'],
    'ordering_violations': ['count==0'],
  },
};
```

Consumer lag and drain metrics are scraped from the backbone's lag SLO metric (C6) via an ops probe each iteration.

**Pass gates.**
- SG-1 sustained: 60 min at 1K/min with all DP-5 stream budgets simultaneously green and lag bounded.
- SG-2 burst: 15 min at 5K/min; budgets may degrade but nothing drops, ordering holds, lag drains within the stated window after the burst.
- SG-3 headroom: 10 min at 10K/min; the system stays up, consumers lag-not-drop, no ordering violations, recovery to steady state after. Budget compliance is NOT required at 10K/min; survival and integrity are.
- All three: zero unexpected DLQ entries (deliberately injected poison in the soak test is the only sanctioned DLQ traffic), zero ordering violations.

**Failure diagnosis hints.** Lag grows linearly at sustained rate: consumer count below partition count, or a consumer doing synchronous per-event I/O that batches would fix. Burst drops: producer-side buffer exhaustion in the injector (raise preAllocatedVUs) before blaming the broker. Headroom collapse localized to one projector: that projector holds per-event state it should fold in its store; the others proving fine is the linear-scale argument working.

---

## 8. Event-backbone soak test (per-member ordering, DLQ drill, replay drill)

**Runnability: AFTER X1 (backbone + outbox relay + at least one projector). This is the C6/C10.2/amendment-001 §2-3 proof.**

**Purpose.** A 24h soak at organic state-scale rate (300/min stream-class) with three embedded drills, proving the guarantees the budgets rest on.

**Structure.**

1. **Soak base load.** xk6-kafka produces mixed C10 events at 300/min for 24h against `pop-50k`. A verifier consumer (test-only, its own consumer group) records `(memberId, sequence)` pairs.
   - Threshold: `ordering_violations: ['count==0']` where a violation is any observed per-member sequence regression. Cross-member ordering is explicitly not asserted (C10.2).
   - Threshold: `duplicate_effects: ['count==0']`: redelivery is expected (at-least-once); a duplicate that produces a second state effect in a projector store is the defect.
2. **DLQ drill (hour 6).** Inject 50 poison events (schema-invalid payloads that pass envelope validation). Assert: each lands on the parent topic's mirrored-key DLQ; the consumer does not stall its partition; DLQ depth alarm fires; the replay tool re-publishes remediated copies with the original eventId; idempotent consumers apply each exactly once. Pass: 50 in DLQ, 50 remediated, zero partition stalls, zero double-effects. This drill is the acceptance run for the DLQ replay runbook (D7 build-gated doc); the runbook's doneGate cites this drill.
3. **Replay/rebuild drill (hour 12).** Stop one projector (graph), truncate its store, rebuild via the outbox-table rebuild publisher (amendment-001 §3: rebuild streams from the outbox table, never broker retention). Assert: rebuilt store state is byte-equal to a pre-drill snapshot projection (the `rebuildFromReplay.contract` test executed at soak scale); live flow for other projectors is unaffected; rebuild completes within an operational bound (ASSUMPTION: 2h for the 50K population, tune with measurement).
4. **Merge drill (hour 18, DP-7).** Emit `identity.member.merged` for 20 fixture pairs mid-flow. Assert: projectors rekey by replay, no in-place key rewrites (verified by store audit), per-member ordering holds across the merge for the survivor id, and a subsequent unmerge for 5 of the pairs restores both identities with the amendment-001 §4 UC-03 criterion (no resource from A's sources attached to B).

**Data seeding.** `pop-50k`, event mix weighted per the C10 catalog, poison fixtures and merge pairs from gen-feed-fixtures.

**Pass gate.** All four elements green in one continuous 24h run. A soak that only passes with drills disabled has not passed.

**Failure diagnosis hints.** Ordering violations clustered at drill boundaries: the relay's confirm-sequence critical section vs the rebuild publisher racing (both must respect the per-member FIFO of amendment-001 §2 step 4). Rebuild slow: outbox table missing the (memberId, sequence) index, or the rebuild publisher paging instead of streaming. Merge-drill failures: a projector keyed a cache by raw source id somewhere; the crosswalk (amendment-001 §4) is the fix locus.

---

## 9. HAPI cluster baseline test

**Runnability: single-node baseline NOW; clustered posture AFTER X1 (D5 IaC provisions the 2-node pilot cluster per load model §5).**

**Purpose.** Establish measured HAPI throughput and latency floors that the S5 window math and the stage-4 loader posture stand on, before pipelines exist to depend on them. This is the one scenario with a NOW half because the HAPI Docker container already runs in the repo.

**NOW (single node, dev Docker).** k6 `constant-vus` suite against the existing container:
- Transaction-bundle write throughput: POST batched transaction bundles (sizes 10/50/100/200) of gen-feed-fixtures US Core resources; record `Trend('bundle_commit_ms')` and derived resources/s per bundle size. This measures the load model's batched-bundle assumption and feeds SP-2.
- $validate cost curve: `$validate` per entry vs batched (sizes 10/100/500), the SP-2 measurement, expressed as k6 thresholds only as regression floors after first capture (`'validate_batch100_ms': ['p(95)<measured*1.2']`).
- Canonical-record read: GET Observation/Patient by id at 100/min; baseline only, no budget (C1 never reads HAPI, but canonical reads exist).

```js
export const options = {
  scenarios: {
    hapi_write: { executor: 'constant-vus', vus: 8, duration: '10m', exec: 'writeBundles' },
    hapi_validate: { executor: 'constant-vus', vus: 4, duration: '10m', exec: 'validateBatches',
                     startTime: '10m' },
  },
  thresholds: {
    'bundle_commit_ms{size:100}': ['p(95)<5000'],   // ASSUMPTION starter floor; replace with measured
    'http_req_failed': ['rate<0.01'],
  },
};
```

**AFTER X1 (clustered pilot: 2 HAPI nodes, LB, tuned Postgres 4 vCPU).** Re-run the same suite plus:
- Sustained mixed load: writes at the pilot 834-window rate (50K in <= 4h implies ~3.5 rec/s pilot; run at 10x = 35 rec/s to bank headroom) concurrent with canonical reads; thresholds: write p95 within 2x single-node baseline, zero errors across an induced single-node kill (LB failover check mid-run).
- Pass gate: cluster sustains the pilot window rate with one node down (the resilience floor the ops runbook will cite).

**Data seeding.** gen-feed-fixtures US Core bundles, synthetic members, no PHI.

**Failure diagnosis hints.** Write throughput plateaus with added VUs: Postgres connection pool or HAPI JPA batch settings (tune per load model §5 before adding nodes; nodes do not fix a pool ceiling). $validate dominating: confirm terminology validation is not remote-fetching value sets per call (cache or preload the C4 profile package). Failover errors: LB health-check interval vs HAPI startup time.

---

## 10. Environment prerequisites (honest ledger)

| Scenario | Needs before it can run | Label |
|---|---|---|
| S9a HAPI single-node baseline | Existing HAPI Docker + gen-feed-fixtures generators (small G3 pre-work; the generators themselves have no substrate dependency) | NOW |
| k6 harness smoke: existing BFF routes (mock mode) at nominal rate, no budget assertions, proving auth, tags, CI wiring | Current dev app only. CURRENT app is `next dev`; results are harness proof, never budget evidence (parity rule) | NOW |
| S1 person-context | X1 substrate; G1 person-context projector + endpoint; pipeline-fed or fixture-loaded population with projections | AFTER X1 |
| S2 graph lens | X1; G1 graph projector + lens layer (ADR-001) | AFTER X1 |
| S3 signal to disposition | X1; G2 SDE consumer + policy data; ops latency probe | AFTER X1 |
| S4 ADT to signal | X1; G3 ADT adapter chain + SDE intake; SP-4 ingress decision; probe | AFTER X1 |
| S5 834 window | X1; G3 834 adapter + dag-834-full; pilot IaC stack (state gate needs the state-sized stack) | AFTER X1 |
| S6 dashboards | X1; G1 metrics projector; first view-model-swapped screen | AFTER X1 |
| SG-1/2/3 scale gates | X1; backbone + >=3 projectors consuming | AFTER X1 |
| Backbone soak + drills | X1; outbox relay; rebuild publisher; replay tool; work-queue merge fixtures | AFTER X1 |
| S9b HAPI cluster | D5 IaC pilot stack (2-node HAPI, LB, tuned Postgres) | AFTER X1 |

Shared prerequisites for every AFTER X1 row: production-shaped deployment from the D5 IaC (parity rule), the PHI-safe ops latency probe, gen-feed-fixtures populations, and CI wiring that runs k6 suites with `abortOnFail` gating merges the same way C5 does.

**Absorbed functional test plan (adopted by reference, not k6 scope).** Route-level 401/403/400/422/200 + PHI-safe response assertions per BFF route (vitest/Newman); axe-core Playwright checks per surface (X5/O-9); regression guards: policy corpus-accuracy and adequacy seed-spread. These run in CI alongside, and independently of, the performance suites above.

**Sequencing note for the finalizer.** The NOW items (harness smoke, HAPI single-node baseline, fixture generators) are deliberately front-loaded: they de-risk SP-2 and the S5 window math before any substrate spend, and they make every AFTER X1 scenario a config change rather than a new build.
