# Iteration 19 — HW4: Whole-person-care depth — external DEQM measure ingestion (core)

Phase 3 · program-spine contract **C-MEAS** · framework v1.5 · governing constraints #1–#4 (esp. #4).

## Definition of Ready
- NFR/regulatory manifest: the platform INGESTS external HEDIS/Stars/MIPS measures (Da Vinci DEQM),
  it does NOT compute them (constraint #4); mock disposition reproduces today's authored demo gaps
  EXACTLY (constraint #2); production ingests the external feed, fail-closed if unwired; mock and
  production gap shapes are E15-parity-equivalent.
- Lens-coverage: domain-fidelity (DEQM/measure semantics — owning), stub-legitimacy (no fabricated
  feed), negative-space (a report with no denominator), demo-preservation.
- Consumes: C-DEMO, C-TEN, C-AUD. Freezes for downstream: **C-MEAS** (`getCareGapView`, `MeasureGap`).

## What landed (all real, WIRED, gated) — the explicit HW4 external-measures constraint
- `src/lib/measures/types.ts` — normalized `MeasureGap` (HEDIS/Stars/MIPS-agnostic) + `CareGapView`
  + minimal Da Vinci DEQM `FhirMeasureReport` shapes.
- `src/lib/measures/deqmIngest.ts` — `ingestMeasureReports()`: parses external DEQM MeasureReports,
  derives gap = denominator − numerator (reads the external system's counts; does NOT compute the
  measure); a report with no denominator is a data-quality SKIP, never a fabricated gap.
- `src/lib/measures/mockMeasures.ts` — `authoredMeasureGaps()`: normalizes the authored
  HEDIS/STARS/MIPS arrays READ-ONLY into `MeasureGap` (mock disposition = today's demo, preserved).
- `src/lib/measures/index.ts` — `getCareGapView()` seam-switched (mock=authored, production=DEQM feed,
  fail-closed) + `MeasuresFeedNotConfiguredError`.
- `measures` seam registered in `dataMode.ts` + `seamDispositions.ts` (fail-closed-stub) + governance
  prober. **Also reclassified** `graph` and `wpcRecord` from `mock-only` → `fail-closed-stub` — the
  governance gate correctly caught that HW1's projection consumer (`getDataMode('graph')`) and HW3's
  record route (`getDataMode('wpcRecord')`) added real production consumers; both now carry probers
  proving they throw in production without a durable factory.
- **Real entry point** — `src/app/api/measures/gaps/route.ts` (GET, reviewer/ops/auditor authz,
  audited): the care-gap + Stars view; 503 fail-closed when the external feed is unwired.
- Tests: `tests/measures/deqmIngest.test.ts` (7) — DEQM derivation, no-denominator skip, mock
  preserves the authored gaps (4 HEDIS + 4 STARS + 3 MIPS), fail-closed, production ingest, E15 parity.

## Demo preservation (constraints #2 + #4) — proven
Golden diff: `config.dataModes` ADDED ['measures'], REMOVED none; **`measures.hedis`/`stars`/`mips`
panel hashes byte-identical** (ef1a6ce0 / ba76f28c / 25937d13) — the authored gaps are untouched, only
read. The seam adds a production branch alongside the demo, exactly as the constraint requires.

## Gate results
tsc 0 · measures tests 7 + governance 12 pass · E14 122/122 (reachable +5, WIRED) · demo 26 pass ·
seam completeness + fail-closed governance green (measures + reclassified graph/wpcRecord).

## Scope honesty — remaining HW4 breadth (follow-on)
Delivered the constraint-critical external-measures ingestion (C-MEAS). Remaining HW4 items — the
holistic-context seam (mock=authored Maria context, production=aggregate the real 20-domain graph,
WPC-01/02), barrier/keystone analytics + risk stratification (WPC-04/07), living care plan tracked to
outcome (WPC-05), SDOH capture→intervention (WPC-06), agent orchestration on resolved data (WPC-13) —
are scheduled follow-on, each the same seam shape (mock=demo, production=real). The live external feed
is the NS-05 ceiling.
