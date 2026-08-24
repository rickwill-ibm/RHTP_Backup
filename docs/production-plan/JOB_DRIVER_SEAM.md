# Job-Driver Seam — Production Batch Orchestration (Airflow-ready)

**Status:** Design (captured against the Agentic Build Framework). **Phase:** WPC-01 Phase 5 (follows Phase 3 aggregator + Phase 4 read-rewire).
**Seam family:** `dataMode` (mock | seeded | production). **Non-negotiable:** the mock demo (`npm run dev`, `NEXT_PUBLIC_USE_MOCK_DATA=true`) never grows a batch-orchestrator dependency.

## 1. Why this exists

"Orchestration" means three different things in this platform. Conflating them is how a batch scheduler ends up wrongly wired to real-time or clinical paths.

| Meaning | What it is | Right tool | Airflow? |
|---|---|---|---|
| **Agentic care orchestration** | The governed agent coalition running care plans (Layer 1) — consent-gated, human-in-the-loop clinical decisioning | The app's governed agent runtime | **No** — never a data-pipeline concern |
| **Event / stream processing** | The outbox → `runProjectionOnce` → graph drain (Phase 1 shared stores; `bootstrap.ts` loop; ops route) | Durable queue + worker, or Temporal | **No** — sub-minute event work; DAG overhead is a poor fit |
| **Batch data orchestration** | Nightly CBO SDOH SFTP pickups, FHIR bulk `$export` ingestion, projection rebuilds/backfills, DEQM/HEDIS measure runs, RADV/encounter extracts | **Airflow** (or Dagster/Prefect/cron) | **Yes** — this seam |

This seam is **only** for the third row.

## 2. Principle: Airflow *drives*, it does not *own*

The pipeline stays orchestrator-agnostic. Airflow is one **external caller** of an ops surface — never an import in the deployable app. That keeps two invariants true:

1. The mock/seeded demo runs the same jobs **in-process**, zero infra.
2. Airflow is swappable for Dagster / Prefect / Temporal / cron without touching pipeline code.

This is the same philosophy as the `dataMode` seam and `setProductionHolisticAggregator`: the production driver is registered at the composition root; absent it, production **fails closed**.

## 3. The seam — three small pieces

### 3.1 `Job` — a named, idempotent, retryable batch unit

We already have the bodies (`runPipeline`, `runProjectionOnce`, measure computation); a `Job` gives them stable identities and an idempotency contract.

```ts
export interface JobContext {
  now(): number;
  stores: ProjectionStores;        // the process-shared stores (Phase 1)
  dataMode: DataMode;
  logger: JobLogger;
}
export interface JobResult<O> {
  ok: boolean;
  output?: O;
  idempotencyKey: string;          // e.g. sha256(fileBytes)+jobName — retries/backfills never double-apply
  metrics: Record<string, number>; // rowsLanded, edgesApplied, drainLagMs, members, quarantined
}
export interface Job<I, O> {
  readonly name: string;           // stable id: 'ingest.cbo-sdoh', 'projection.drain', 'measures.deqm', 'projection.rebuild'
  run(input: I, ctx: JobContext): Promise<JobResult<O>>;
}
```

Idempotency backstop already exists: the outbox's `maxAttempts` + quarantine dedupe means a re-run of `ingest.cbo-sdoh` over the same drop is safe.

### 3.2 `JobDriver` — what triggers jobs (the swap point)

```ts
export interface JobDriver {
  readonly id: string;
  trigger(jobName: string, input: unknown): Promise<JobRunHandle>;
  status(handle: JobRunHandle): Promise<JobRunStatus>;
}
```

Two implementations behind the seam:

- **`InProcessJobDriver`** (mock/seeded default) — runs the job inline against the shared stores. This is what today's `bootstrap.ts` drain loop and Phase 2's `devIngestion` seeder *become*. Demo stays zero-infra.
- **`HttpOpsJobDriver`** (production contract) — thin client for the ops job surface (below). Airflow does not use this class; **Airflow speaks HTTP to the same surface directly.** The class exists for in-cluster callers and tests.

### 3.3 `JobRegistry` + fail-closed registration

Mirrors `setProductionHolisticAggregator`: `registerJob(job)` into a registry; production throws a typed `JobNotRegisteredError` / `ProjectionStoresNotConfiguredError` if a required job or the shared stores are absent. Never a silent no-op.

## 4. The ops job surface (what Airflow calls)

```
POST /api/ops/jobs/{jobName}/run     → { runId }        # resolve job from registry, run vs shared production stores
GET  /api/ops/jobs/runs/{runId}      → JobRunStatus      # Airflow polls
```

- Extends the existing `api/ops/projection/run` entry rather than replacing it.
- Response body carries the `JobResult.metrics` so Airflow logs + lineage capture real numbers, not just exit codes.

### 4.1 Security — first-class, not an afterthought

The moment anything can POST "ingest this file" / "drain", the endpoints need **authn/authz**: service token or mTLS, request signing, IP allowlist, and per-job authorization. Today the ops route is effectively open. **"Protect the ops job surface" is a required deliverable of this phase**, gated, not optional.

### 4.2 Observability

Every run emits structured metrics (`rowsLanded`, `edgesApplied`, `drainLagMs`, `members`, `quarantined`, `idempotencyKey`) in the ops response. This is what makes backfills, SLA alerts, and lineage meaningful to a payer data-engineering team.

## 5. dataMode alignment

| Mode | Driver | Job surface | Behavior |
|---|---|---|---|
| `mock` / `seeded` | `InProcessJobDriver` | inline | Jobs run in-process; demo green, zero infra |
| `production` | ops surface live | `POST /api/ops/jobs/...` | Airflow drives on schedule; **fail-closed** if registry/stores unregistered |

## 6. Airflow, concretely (ops artifacts, not app code)

DAGs live in the deployment/ops repo, not `src/`. They speak HTTP to the ops surface via `SimpleHttpOperator`; retries, SLAs, and backfill windows are configured **in Airflow**.

- `sdoh_nightly` — SFTP sensor (CBO drop) → `POST ingest.cbo-sdoh` → `POST projection.drain` → `POST measures.deqm`
- `fhir_bulk_export` — Da Vinci / bulk `$export` poll → `POST ingest.fhir-bulk` → `POST projection.drain`
- `projection_backfill` — parameterized date range → `POST projection.rebuild`

Because these are HTTP-only, Airflow never imports TypeScript and can be replaced wholesale.

## 7. Alternatives considered

- **Dagster** — software-defined assets map cleanly onto "the projected graph" and "the DEQM measures" as materializable assets with lineage; lighter local-dev story. Strong technical fit.
- **Prefect** — similar modern ergonomics.
- **Temporal** — the better fit for the **event/stream** row (durable, stateful, retry-heavy) and for long-running saga-style care-plan actions — explicitly *not* this seam.
- **Airflow** — chosen as the reference because it is the incumbent in most payer data-engineering shops; its edge here is organizational familiarity more than technical superiority. The HTTP-driven design means the choice is reversible.

## 8. Non-goals

- Not the driver for the near-real-time outbox → projection drain (queue/worker or Temporal).
- Not the orchestrator for the governed agent care coalition (the app owns that).
- Not an app-code dependency: no Airflow/Python import ever lands in `src/`.

## 9. Where it sits in WPC-01

- **Phase 1** (done) — process-shared projection stores (composition root).
- **Phase 2** (done) — `devIngestion` seeds the shared graph via the real pipeline. **This is the in-process reference for `ingest.cbo-sdoh` + `projection.drain`.**
- **Phase 3** — whole-person aggregator behind the `wpcRecord` seam.
- **Phase 4** — rewire reads through the seam, fail-closed on empty.
- **Phase 5 (this doc)** — job-driver seam: `Job` / `JobDriver` / `JobRegistry`, `InProcessJobDriver` (refactor `bootstrap` + `devIngestion` onto it), the `api/ops/jobs/*` surface + auth, the `HttpOpsJobDriver` contract, example Airflow DAGs as ops artifacts, and gates for wiring + production fail-closed.

## 10. Contracts / gates to add (Phase 5)

- **Wiring (E14):** every registered `Job` reachable from the ops-route entry; no orphan jobs.
- **Fail-closed:** production with an unregistered job or unset shared stores throws (tested), never silently no-ops.
- **Idempotency:** re-running a job over the same input applies zero net new mutations (tested against the shared graph).
- **Demo-intact:** mock/seeded still runs jobs in-process; no ops-surface dependency in the demo path.
- **Auth:** the ops job surface rejects unauthenticated/unauthorized calls (tested).
