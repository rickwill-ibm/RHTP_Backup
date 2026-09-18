# Pipeline reference architecture (`src/lib/pipeline`)

The five-stage pipeline of plan §4A, as real code. Every feed, every domain, both
lanes. Adapters are generic over records — no persona is hardcoded (plan §1.2).

## The five stages

| Stage                  | Contract                   | Input -> Output                                              | Idempotency key                |
| ---------------------- | -------------------------- | ------------------------------------------------------------ | ------------------------------ |
| 1. Land                | `landStage`                | `LandInput` -> `LandedBatch` (checksum, cataloged, verbatim) | `land:<system>:<feed>:<batch>` |
| 2. Stage + validate    | `stageValidate(adapter)`   | `LandedBatch` -> staged + PHI-safe quarantine                | `stage:<batchId>`              |
| 3. Transform + enrich  | `transformEnrich(adapter)` | `RawRecord` -> `NormalizedRecord` \| quarantine              | `transform:<feed>:<sourceRef>` |
| 4. Conform + load      | `conformAndLoad`           | `NormalizedRecord[]` -> intents committed + recon gate       | `conform:<batchId>`            |
| 5. Project + propagate | `projectAndPropagate`      | affected members -> C2 events published                      | `propagate:<memberId>`         |

Stages 1-3 are pure synchronous functions over `(input, deps)`. Stages 4-5 carry
I/O over the outbox/FHIR seams. `runPipeline` composes all five end to end.

Deps (`PipelineDeps`) inject the clock/rng seam (`src/lib/clock.ts`) and the
identity-resolution seam, so nothing reads a global and identity attaches to the
anchored member, never the raw source id.

## The three representative adapters (arrival modes)

| Adapter                 | Format        | Mode                  | Domain / tier    | Event                                            | Provenance                                   |
| ----------------------- | ------------- | --------------------- | ---------------- | ------------------------------------------------ | -------------------------------------------- |
| `eligibility834Adapter` | X12 834       | **batch**             | Coverage / T1    | `coverage.enrolled`                              | payer-authoritative                          |
| `adtEncounterAdapter`   | HL7v2 ADT     | **stream**            | Encounter / T1   | `encounter.*`                                    | qe-adt-feed                                  |
| `cboSdohAdapter`        | flat-file CSV | **batch (SFTP drop)** | SDOH / T1        | `sdoh.screening.completed`                       | community-reported                           |
| `medicationAdapter`     | FHIR JSON     | **batch (bundle)**    | Medications / T1 | `medication.prescribed` / `medication.dispensed` | prescriber-authoritative / pharmacy-dispense |

New domains are added through the golden checklist in
[`adapters/_TEMPLATE.md`](./adapters/_TEMPLATE.md) — the medications adapter is its
worked reference example.

## Lane-agnostic transforms (the anti-divergence gate)

There is exactly ONE transform implementation per domain — the adapter's
`validate` + `normalize` — run through ONE `runTransform`. It is packaged **twice**
from that one implementation:

- `batchStep(adapter)` — a DAG step over a whole landed batch, with a reconciliation gate.
- `streamConsumer(adapter)` — a consumer over one message.

`packageBothLanes(adapter)` returns both side by side (the packaging seam). Because
both lanes call `runTransform`, batch and stream cannot diverge — the unit test
asserts they produce identical output for identical input. Divergence is a defect
class, banned by construction.

## Staging + quarantine + reconciliation

Structural validation (stage 2) and profile `$validate` (stage 4) route rejects to
a **quarantine lane** as PHI-safe records: reason codes and field paths only, never
payload values. The **reconciliation gate** asserts `countIn === loaded + rejected`
per batch (`assertBalanced` throws on an unbalanced batch — bad records never
silently vanish and never poison a load).

## Segmentation-at-transform

`applySegmentation` runs inside `runTransform`, so consent + 42 CFR Part 2 labels
are a property of the data from the moment it is normalized (§4A stage 3), not a
read-time afterthought. Adapters attach PHI-safe segmentation _hints_ (codes); the
`SEGMENTATION_RULES` table (data, not code) maps them to durable labels carried on
the record and echoed into the C2 envelope's `consentContext`, so projectors drop
Part 2 content by envelope inspection alone (C10.1).

## Propagation

Stage 5 rides `src/lib/outbox` (ADR-006). See that folder's README. The loader is
the outbox writer; dual-write is banned.
