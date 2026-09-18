# Domain adapter template (L7) — the golden checklist

One reusable recipe for adding a C9 record domain end to end, captured from the
three proven adapters (`eligibility834`, `adtEncounter`, `cboSdoh`) and the four
proven mapping specs (`coverage`, `encounter`, `sdoh`, `careteam`). Every new
domain follows these eight steps and touches exactly these files and registries —
so no domain drifts. The **medications** domain is the worked reference example,
inlined at each step. Do NOT re-architect; match the existing shapes.

Binding: plan §4A (five stages), C9 (the 20 domains + tier grammar T0/T1/T2/T3),
C10 propagation, DP-1 graph mapping, §1.2 (generic + synthetic, never a hardcoded
persona), AI-CODING-CONVENTIONS v2 (≤400 lines src / ≤500 tests, clock injected).

---

## Files to create (per domain `<d>`)

| Purpose                    | Path                               |
| -------------------------- | ---------------------------------- |
| Pipeline adapter           | `src/lib/pipeline/adapters/<d>.ts` |
| Graph mapping spec         | `src/lib/graph/mapping/<d>.ts`     |
| Source fixture (synthetic) | `tests/**/fixtures/<d>.<ext>`      |
| Adapter + tier + e2e tests | `tests/pipeline/<d>.test.ts`       |
| Projection + lens tests    | `tests/graph/<d>.test.ts`          |

## Registries to touch (exactly two)

| Registry                  | File                             | Edit                                           |
| ------------------------- | -------------------------------- | ---------------------------------------------- |
| Pipeline adapter registry | `src/lib/pipeline/index.ts`      | `export { <d>Adapter } from './adapters/<d>';` |
| Graph mapping registry    | `src/lib/graph/mapping/index.ts` | import `<d>Spec`, add it to `MAPPING_SPECS`    |

Plus, when the domain adds a new canonical **domain id** or **wire format**, widen
the unions in `src/lib/pipeline/types.ts` (`WpcDomain`, `SourceFormat`). The
projector, `runTransform`, `runPipeline`, and the lenses are **open/closed** — they
read the registries and never name a domain, so nothing else changes.

---

## The 8-step checklist

### 1. Source parse (fixture -> raw records)

Add a synthetic, PHI-safe fixture under `tests/**/fixtures/`. The adapter's
`parse(payload: string): RawRecord<Raw>[]` splits it into raw records, each with a
PHI-free `sourceRef` (a row index, control id, or resource id — never a name).
Define the `Raw` shape inline in the adapter file (as `X12Member` / `Hl7Message` /
`SdohRow` do). Include one deliberately malformed record so the quarantine lane is
exercised.

> **medications**: `tests/pipeline/fixtures/medication.json` — a synthetic RxNorm
> FHIR bundle: 2 `MedicationRequest` + 2 `MedicationDispense` + 1 coding-less
> request (quarantine). `parse` JSON-parses the bundle and tags each entry
> `{ kind: 'request' | 'dispense', resource }`. `sourceRef` = the resource id.

### 2. Normalize to the canonical domain type

`normalize(raw, deps): NormalizedRecord`. Anchor identity through the injected seam
— `deps.resolveIdentity(sourceMemberId, { feed })` — and use the ANCHORED
`memberId`, never the raw source id (§1.2). **When the source carries demographic
traits (name / dob / sex / zip / phone / ids), pass them too:
`deps.resolveIdentity(sourceMemberId, { feed, demographics })`** (a
`DemographicTraits` bag, all fields optional). The production EMPI resolver
(`lib/identity/empiResolver.ts`) uses them for probabilistic matching and HOLDS a
possible-match (60-90) instead of auto-linking; the deterministic demo resolver
ignores them, so passing traits is always safe and never changes demo ids. Traits
are seam-only — parse them for matching, never store them on the record or a
quarantine record (PHI-minimal). A source with only an id stays id-only (the
deterministic path) — that is fine. Set `resourceType`, a deterministic
`fhirResourceId`, an `eventType` of the form `<domain>.<verb>`, a stable
`idempotencyKey`, and a **codes + refs only** `payload` (never free-text
narrative). Read time from `deps.now()` when the source has no timestamp. Put any
typed payload interfaces in the adapter file (consistent with existing adapters;
there is no separate per-domain types file).

> **medications**: two normalized shapes from one feed — `Medication` (event
> `medication.prescribed`) and `MedicationDispense` (event `medication.dispensed`).
> The dispense payload carries `prescriptionRef` (the `Medication` node it filled)
> so the causal graph edge can attach. Payload interfaces `MedicationPayload` /
> `MedicationDispensePayload` live in `adapters/medication.ts`.

### 3. Assign C9 tier + provenance

Set `tier` per the C9 tier grammar and a `provenance` string naming the
authoritative source. Coded clinical/record domains are **T1**.

> **medications**: `tier: 'T1'`; provenance `prescriber-authoritative` (prescribed)
> and `pharmacy-dispense` (dispensed).

### 4. Segmentation label if sensitive

Do NOT label in the adapter. Attach PHI-safe segmentation **hints** to the payload
(`payload.segmentationHints = ['part2-sud' | 'behavioral-health' | ...]`); the
shared `applySegmentation` in `runTransform` maps hints to durable labels via the
`SEGMENTATION_RULES` data table and echoes them into the envelope `consentContext`,
so projectors drop Part 2 by envelope inspection alone (C10.1). Set
`consent: { part2Restricted: false, segmentLabels: [] }` as the default.

> **medications**: not intrinsically sensitive, so no hints (a psychotropic or
> MAT/SUD medication list is where a `part2-sud` hint would attach). The default
> consent object is emitted uniformly.

### 5. Map to graph mutations (node/edge types, dated, causal-with-provenance)

In `src/lib/graph/mapping/<d>.ts` write `<d>Spec` implementing `MappingSpec`:
`matches(eventType)` claims `<domain>.*`; `toMutations(event, deps)` emits the
neutral instruction set only (no SQL/Cypher). Always start with `memberNode(event)`
and build resource nodes via `resourceNode(...)` (it applies restriction + labels
from the envelope). **Every edge is dated** (`validity.start`, `end` null when
open). A factual link is `associative`; an **asserted claim MUST be `causal(asserter,
basis)`** with PHI-safe provenance. Export the pinned node-kind and edge-type
constants for step 7.

> **medications**:
>
> - `(Member)-[:PRESCRIBED_FOR {from authoredOn}]->(Medication)` — associative, dated.
> - `(MedicationDispense)-[:DISPENSED_UNDER {causal, asserter, basis}]->(Medication)`
>   — the pharmacy asserts this fill satisfied that order, so causal with
>   `asserter = pharmacy-dispense`, `basis = <rxnorm>@<prescriptionRef>`.
> - Exports `MEDICATION_DOMAIN`, `MEDICATION_KIND`, `MEDICATION_DISPENSE_KIND`,
>   `PRESCRIBED_FOR`, `DISPENSED_UNDER`.

### 6. Register in BOTH registries

`export { <d>Adapter }` from `src/lib/pipeline/index.ts`; import `<d>Spec` and add
it to `MAPPING_SPECS` in `src/lib/graph/mapping/index.ts`. Widen the `types.ts`
unions if a new domain id or format was introduced.

> **medications**: `medicationAdapter` exported; `medicationSpec` appended to
> `MAPPING_SPECS`; `WpcDomain` gains `'medications'`, `SourceFormat` gains
> `'fhir-json'`.

### 7. Tests: normalization + projection + lens read + C9 tier + namespace pinning

- **Adapter normalization** (`tests/pipeline/<d>.test.ts`): fixture -> normalized;
  assert `domain`, `resourceType`, `eventType`, anchored `memberId` (`/^mem-/`,
  never the raw id), payload has no PHI, and the malformed record quarantines with
  a PHI-safe reason code. Add the **C9 tier assertion** (`tier === 'T1'`) and an
  end-to-end `runPipeline` test (events published, `class`, `source.tier`).
- **Graph projection** (`tests/graph/<d>.test.ts`): project events -> assert the
  expected node kinds + edge types, causal edges carry `asserter`/`basis`, and
  **both backends** (pg-mem + Neo4j fake) rebuild byte-identical nodes/edges.
- **Lens read**: at least one lens now surfaces the domain (whole-person surfaces
  the resource off the member on both backends).
- **Namespace pinning** (`tests/pipeline/domainNamespaceIntegrity.test.ts`, the
  F-C1 lesson): pin the domain id, node kinds, edge types, module paths, and
  registry entries and assert the adapter, the mapping, and both registries agree —
  in particular that every `eventType` the adapter emits is claimed by exactly the
  domain's spec.

### 8. Update the C9 coverage matrix row

Add/flip the domain's row in the wave report's C9 coverage matrix (domain id,
tier, adapter, mapping, node/edge types, arrival mode) and bump the `n/20` count.

---

## Definition of done (every domain)

`npx tsc --noEmit` = 0 · `npx vitest run` fully green (nothing prior breaks) ·
`bash check-file-sizes.sh` PASS · ≤400 lines/src file, ≤500/test · clock injected
(deterministic) · the namespace pinning test passes · generic + synthetic, no
hardcoded persona. L1: projection runs over the in-memory / pg-mem fakes, so
CI-pending real-backend integration count stays **0** for a pure record domain.
