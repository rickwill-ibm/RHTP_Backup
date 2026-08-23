# Iteration 1 — Wave A report: pipeline + propagation

Scope built: the §4A five-stage pipeline, three representative source adapters,
lane-agnostic transforms, staging + quarantine + reconciliation, segmentation-at-
transform, and the ADR-006 outbox-intent propagation mechanism. Verify status at
the end. Nothing outside this wave's scope (O-1 evidence store, O-2 loaders, the
two security fixes) was touched.

## Modules created

### `src/lib/pipeline/` (feature-first; types.ts, index.ts, README.md)
| File | Role |
|---|---|
| `types.ts` | Five-stage contract types, `PipelineDeps` (clock/rng + identity seam), `DomainAdapter`, records, quarantine, reconciliation |
| `stages.ts` | Stages 1-3 as `StageContract` objects (`landStage`, `stageValidate`, `transformEnrich`), `defaultPipelineDeps`, identity resolver |
| `transform.ts` | `runTransform` (the one transform core) + `batchStep` / `streamConsumer` / `packageBothLanes` (the packaging seam) + `reconcile` / `assertBalanced` |
| `segmentation.ts` | `applySegmentation`, `SEGMENTATION_RULES` (data-driven Part 2 / BH labels) |
| `load.ts` | Stage 4 `conformAndLoad` (profile gate + intent commit + recon gate) and stage 5 `projectAndPropagate` (pump the outbox) |
| `pipeline.ts` | `runPipeline` — all five stages composed end to end |
| `adapters/eligibility834.ts` | 834 eligibility BATCH adapter → Coverage T1 |
| `adapters/adtEncounter.ts` | ADT encounter STREAM adapter → Encounter T1 |
| `adapters/cboSdoh.ts` | CBO flat-file SDOH adapter (SFTP drop) → SDOH T1, community-reported |

### `src/lib/outbox/` (feature-first; types.ts, index.ts, README.md)
| File | Role |
|---|---|
| `types.ts` | C2 event, `OutboxIntentInput/Row`, and the four seams (`OutboxStore`, `FhirApplier`, `EventPublisher`, alarm/quarantine) |
| `envelope.ts` | `buildEnvelope` + `validateEnvelope` (hand validator matching the C2 JSON Schema; no zod dep), deterministic `uuidV4(rng)` |
| `memoryOutboxStore.ts` | in-memory store (mock mode) |
| `pgOutboxStore.ts` | Postgres store + DDL (`ensureOutboxSchema`); runs on pg-mem and real pg |
| `memberLock.ts` | per-member partition-affine single writer (the critical section) |
| `sequencing.ts` | shared `confirmAndPublish` / `failIntent` (one code path for writer + sweep) |
| `writer.ts` | `OutboxWriter`: enqueue (intent commit) + pump (apply → confirm → publish, FIFO) |
| `sweep.ts` | `OutboxSweeper`: reconciliation sweep for orphaned/pending intents |

## The five-stage mapping (§4A)

| Stage | Code | Idempotency key |
|---|---|---|
| 1 Land | `landStage` — checksum, cataloged, verbatim payload | `land:<system>:<feed>:<batch>` |
| 2 Stage + validate | `stageValidate(adapter)` — structural validation, PHI-safe quarantine lane | `stage:<batchId>` |
| 3 Transform + enrich | `transformEnrich(adapter)` = `runTransform` — normalize + identity-anchor + segment | `transform:<feed>:<sourceRef>` |
| 4 Conform + load | `conformAndLoad` — profile `$validate` gate + reconciliation gate + intent commit | `conform:<batchId>` |
| 5 Project + propagate | `projectAndPropagate` — pump the outbox; C2 events in per-member sequence | `propagate:<memberId>` |

Stages 1-3 are pure sync functions over `(input, deps)`; deps injects clock/rng
from `src/lib/clock.ts` and the identity-resolution seam, so identity attaches to
the anchored member, never the raw source id. No persona is hardcoded (plan §1.2):
adapters are generic over records.

## Adapters (three arrival modes)

- **834 eligibility — BATCH (X12).** Parses INS loops → `Coverage` T1,
  `coverage.enrolled`, provenance payer-authoritative. Incomplete loop (missing
  HD) → quarantine.
- **ADT encounter — STREAM (HL7v2).** One message → one `Encounter` T1,
  `encounter.admitted/discharged/transferred`, provenance qe-adt-feed. A
  chemical-dependency hospital service (PV1-10 = CD) attaches a Part 2 hint.
- **CBO SDOH — FLAT FILE (CSV over simulated SFTP drop).** Rows → `Observation`
  T1, `sdoh.screening.completed`, provenance community-reported. Malformed/absent
  Z-code → quarantine.

Quarantine records are PHI-safe: reason codes and field paths only, never payload
values (asserted by the adapter tests scanning for synthetic names / PHI keys).
The reconciliation gate asserts `countIn === loaded + rejected` per batch and
throws `ReconciliationError` on imbalance.

## How lane-agnosticism is proven

There is exactly ONE transform implementation per domain (the adapter's
`validate` + `normalize`), run through ONE `runTransform`. `packageBothLanes`
returns it packaged twice — `batchStep` (DAG step over a batch, with the recon
gate) and `streamConsumer` (one message). The anti-divergence gate
(`tests/pipeline/transform.test.ts`) asserts, for identical single-record input,
`batchStep(...).normalized[0]` deep-equals `streamConsumer(...).record` — for both
the 834 and ADT adapters. Divergence is impossible because both lanes call the
same function.

Segmentation-at-transform: `applySegmentation` runs inside `runTransform`, so
consent + 42 CFR Part 2 labels are set the moment the record is normalized and
ride the C2 envelope's `consentContext` (verified end-to-end: the SUD ADT
publishes an event with `part2Restricted: true` + `42-CFR-Part-2`).

## Outbox semantics (ADR-006 + amendment-001 §2)

Dual-write is banned; the loader IS the outbox writer. Per member:
1. **Intent commit** — `enqueue` writes a `pending` row transactionally, unique on
   `idempotencyKey` (a re-submit is a no-op).
2. **Idempotent FHIR apply** — `pump` PUTs to the deterministic id; retry-safe; no
   event yet.
3. **Confirm + sequence + publish** — on confirmed FHIR commit the row is marked
   `confirmed`, assigned the next per-member `sequence` in the `MemberLock`
   critical section, and the C2 event is published, then marked `published`.
   **Events emit only after confirm; sequence order = confirm order = publish
   order per member.**
4. **Per-member FIFO** — a transient failure halts that member's drain (others
   proceed); a terminal failure lets later intents pass. The S4 inversion class is
   structurally impossible.
5. **Reconciliation sweep** — `OutboxSweeper` recovers orphaned `pending` intents:
   confirms if the FHIR write landed (crash before confirm), else retries; budget
   exhaustion → `failed` + alarm + quarantine item. Sweep shares the `MemberLock`,
   so it never races a live drain.

The `outbox_intent` table is append-mostly, the sanctioned per-member ordered
event history (amendment §3). `SEAM: cdc-relay` — a Debezium-class reader could
replace the writer without touching producers/consumers.

## Tests (pg-mem here, testcontainer for CI)

- **pg-mem-backed (runs here, real SQL, no Docker):**
  `tests/outbox/outboxStore.contract.test.ts` runs the store contract against BOTH
  the memory and pg-mem stores; `writer.test.ts` (intent → confirm → event order,
  idempotent retry) and `sweep.test.ts` (orphan recovery) run headline flows on
  pg-mem; `pipeline.test.ts` runs all five stages end-to-end on pg-mem.
- **CI testcontainer (skips with a clear reason without Docker):**
  `tests/integration/outbox.testcontainers.test.ts` runs the same flow against
  real Postgres (`@testcontainers/postgresql`, `postgres:16-alpine`); it
  `describe.skipIf(!dockerAvailable())` and logs why.
- **Adapter + transform units:** normalization for all three adapters, PHI-safe
  quarantine, the batch-vs-stream anti-divergence gate, segmentation-at-transform,
  reconciliation gates.
- Fixtures: `tests/pipeline/fixtures/*.json|csv` (synthetic 834, ADT, SDOH CSV).

**36 new test cases** (34 runnable + 2 testcontainer, skipped here with reason).

## C9 tiers delivered

- Domain 2 Coverage/eligibility — **T1 @834** (P1 target).
- Domain 3 Encounters — **T1 events @ADT** (stream, P2 target).
- Domain 13 SDOH — **T1 @CBO flat-file**, provenance-tagged community-reported
  (P3 flat-file path).

All three carry their tier onto the C2 envelope `source.tier`; Part 2 content is
labeled at transform and flagged on the envelope for envelope-only projector
drops (C10.1).

## Verification

- `npx tsc --noEmit` → 0 errors.
- `npx vitest run` → 578 passed, 6 expected-fail (pre-existing), 71 skipped; no
  prior test broken.
- `bash check-file-sizes.sh` → PASS, ratchet intact (every new file ≤400 / tests
  ≤500 / READMEs ≤150).
