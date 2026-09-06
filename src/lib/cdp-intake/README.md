# cdp-intake — CDP Assembly intake front-edge (net-new, deletable)

**Purpose.** Turn a folder of representative multi-source client data into calls on the
platform's EXISTING pipeline front doors, issuing a PHI-safe receipt on the way. This is
the upstream "point at a folder → standardize / normalize / validate / enrich / map"
layer for the CDP Assembly demo. It adds no processing logic — the adapters, semantic
binding, EMPI, risk/terminology enrichment, WPC record and KG all already exist.

**Public surface** (`index.ts`)
- `runIntake(dir, dispatch, opts)` — the pure orchestrator.
- `readFolder` / `readManifest` — folder source (Node fs).
- `classify` / `isUnclassified` — manifest-authoritative classification.
- `buildReceipt` / `sha256` — the intake receipt.
- `registerFormat` / `formatSpec` / `formatForFilename` — the extensible format table.
- Types: `IntakeDispatch`, `IntakeRunResult`, `SourceLoadOutcome`, `IntakeReceipt`, …

**Invariants**
- The core imports NO engine at runtime — only type-only shapes. The real front doors
  (`ingestBundleJson`, `runPipeline`) are bound at the edge and passed in as
  `IntakeDispatch`. This is what keeps the layer pure, testable, and deletable.
- Nothing in `pipeline/`, `identity/`, or `runtime/` imports `cdp-intake` — a CI grep
  enforces the one-way dependency (new → existing only).
- Ordering is deterministic and **anchor-first**: batch (demographics-bearing) loads run
  before stream/micro-batch, because the stream door's identity pre-resolution gate never
  mints a blind identity from a subject-only record.
- The receipt carries counts / ids / hashes only — never payload values (PHI-safe, mirrors
  `QuarantineRecord` discipline).

**What an agent may change freely**: the format registry (add NCPDP/CDA/…), the manifest
convention, the sample sources. **Must not change**: the one-way dependency rule, the
anchor-first ordering, or reach into the EMPI/pipeline internals.

**Rollback**: delete `src/lib/cdp-intake/`, delete `src/app/api/cdp-intake/`, remove the
one flag-guarded mount. No pipeline/identity edits to revert.

**Test commands**: `npx vitest run tests/cdpIntake`.

## Manifest (`index.json` in the source folder)

```json
{
  "sources": [
    { "file": "member.fhir.json", "sourceSystem": "BENNETT_EHR",
      "format": "fhir-json", "adapter": "fhir-bundle", "arrivalMode": "batch" },
    { "file": "eligibility.834.txt", "sourceSystem": "SD_MEDICAID_MMIS",
      "format": "x12-834", "adapter": "eligibility834", "arrivalMode": "batch" }
  ]
}
```

The manifest is authoritative because `sourceSystem` drives identity scoping and cannot be
inferred from a filename. Filenames are only a heuristic fallback.

## Status

Increment 1 (this): the pure core + receipt + classification + a coded sample folder +
the `inspect` preview route + tests. Increment 2: the edge `wiring.ts` binding
`ingestBundleJson` / `runPipeline` + real stores, the run route with poll telemetry, the
isolated screen, and the seed-parity gate.
