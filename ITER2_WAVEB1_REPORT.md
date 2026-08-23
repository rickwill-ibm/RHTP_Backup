# Iteration 2 Wave B1 — Graph acceptance: five lenses, dual-backend, Part 2, replay, merge/unmerge

Graph acceptance engineer, wave B1. Live tree `/home/claude/baseline`. Built ON wave
A's projector, `GraphStore` interface, both adapters, and the shared contract test
(none rebuilt). `src/lib/sde` untouched.

## Verification (definition of done)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx vitest run` | 644 passed, 3 expected-fail, 78 skipped (was 619 / 3 / 75) |
| `bash check-file-sizes.sh` | PASS (ratchet intact, 75 frozen legacy files unchanged) |

**+25 new passing tests**, +3 new Docker-guarded skips (the live dual-backend lens
spec). Every new source file <=400 lines (largest: `lens/lenses.ts` at 184); every
new test file <=500 lines. New `lens/` subfolder carries its own README; the graph
README is updated for wave B1.

---

## 1. The five lens queries (`src/lib/graph/lens/`)

Each lens is a **store-agnostic** read expressed only against the `GraphStore` API
(`getNode`, `listNodes`, `listEdges`) — no SQL, no Cypher, no per-backend code — so
the Postgres and Neo4j adapters satisfy every lens identically. They answer the same
questions the demo's five `wholePersonGraphData` lens filters ask, against the
**projected** store. Every lens runs under a `ConsentScope` (C1 consent enforcement);
restricted (Part 2 / segmented) nodes are excluded unless the scope covers them.

| Lens | Demo filter analogue | Scope over the projected graph |
|---|---|---|
| `whole-person` | `all` | member + every connected resource (consent-filtered) |
| `care-gap` | `clinical` | OPEN encounters (validity still open) + unmet needs |
| `sdoh-barrier` | `social` | SDOH screenings + the causal `HAS_UNMET_NEED` |
| `care-team` | `agents` / care team | assigned `CareTeamMember` nodes (providers, care managers) |
| `part2-restricted` | `behavioral` / locked (42 CFR Part 2) | the restricted subgraph, gated by consent |

To back the `care-team` lens I added ONE new mapping domain via the projector's
open/closed registry (`mapping/careteam.ts` + one registry line in `mapping/index.ts`)
— `careteam.*` events project a `CareTeamMember` node and a dated associative
`HAS_CARE_TEAM` edge. The projector core and both adapters are unchanged.

## 2. Dual-backend acceptance suite (`tests/graph/lens.acceptance.test.ts`)

All five lenses run against BOTH backends (Postgres via pg-mem, Neo4j via the
in-memory fake) from the SAME seeded cross-domain event stream (coverage, open +
closed + Part-2-restricted encounters, positive + negative SDOH screens, a care-team
assignment). The suite asserts **byte-identical `LensResult` across the two backends
for every lens** — the co-equal lens guarantee in code. Per-lens behavior is also
asserted (care-gap excludes discharged + restricted; sdoh-barrier surfaces exactly
one causal unmet need; care-team returns only assigned providers). The live version
against real Postgres + real Neo4j is authored and Docker-guarded in
`tests/integration/graph.lens.testcontainers.test.ts`.

**Dual-backend parity: CONFIRMED.**

## 3. Part 2 enforcement (both backends)

A restricted node (the 42 CFR Part 2 behavioral-health encounter, labeled from the
ENVELOPE by the pipeline) is **excluded from a lens without consent scope and
included with it**, asserted on both backends:

- `part2-restricted` lens with no scope → `nodes: []`, `edges: []` (fully redacted).
- `part2-restricted` lens with `{ part2: true }` → the restricted `Encounter` node
  (carrying its `42-CFR-Part-2` label + `restricted: true`) and its edge.
- `whole-person` surfaces the restricted encounter ONLY with scope, on both backends.
- Partial/wrong-segment scope still excludes it (scope must cover every restricting
  label, not just any).

## 4. Rebuild-from-replay proof (`tests/graph/replay.test.ts`, both backends)

`replayToStore` runs the full pipeline (resolve identity → rekey → project → apply).
Seed an event stream, replay it onto a store, snapshot; replay the SAME stream onto a
FRESH (wiped) store; the two graphs are **byte-identical** (`listNodes` + `listEdges`
deep-equal). Also proven idempotent (replaying twice equals once) and cross-backend
identical (pg-mem graph == Neo4j-fake graph from the same replay). This is DP-1's
non-negotiable: every mutation is an idempotent upsert keyed by business identity.

## 5. Merge / unmerge rekey by REPLAY (DP-7, `src/lib/graph/replay.ts`, both backends)

Identity merge is handled by REPLAY, never an in-place key rewrite. Two control
event types (`member.merged` / `member.unmerged`, payload
`{ survivingMemberId, mergedMemberId }`) carry identity resolution and emit NO graph
mutations of their own (no spec owns `member.*`; the projector skips them — asserted).

- `resolveIdentity` folds the control events (in stream order) into a
  `subsumed -> survivor` map, with path-compression over chains (A→B, B→C ⇒ A→C) and
  unmerge removing a mapping.
- `rekeyEvents` rewrites each domain event's `memberId`/`partitionKey` through the map
  BEFORE projection. Member-keyed identities (the `Member` node, the member end of
  every edge, `SocialNeed` keyed `memberId:domain`) therefore land under the survivor;
  stable payload refs (`Coverage/…`, `Encounter/…`, `Practitioner/…`) are untouched,
  so a clinical resource is never duplicated.

Asserted on BOTH backends: after a merge, the subsumed `Member:DUP` node is GONE (no
orphan), the survivor carries both sources' coverage, `SocialNeed:DUP:housing`
coalesces to `SocialNeed:SURV:housing` (causal provenance preserved), and no edge
dangles from the merged id. **Unmerge reverses it exactly**: replaying with the
unmerge event appended yields a graph byte-identical to the two members projected with
no merge at all. The merged graph is also proven byte-identical across Postgres and
Neo4j.

---

## Files

New source: `src/lib/graph/lens/{types,lenses,index}.ts`, `src/lib/graph/lens/README.md`,
`src/lib/graph/replay.ts`, `src/lib/graph/mapping/careteam.ts`.
Edited: `src/lib/graph/mapping/index.ts` (register careteam spec), `src/lib/graph/index.ts`
(export lens + replay), `src/lib/graph/README.md`.
New tests: `tests/graph/lens.acceptance.test.ts`, `tests/graph/replay.test.ts`,
`tests/integration/graph.lens.testcontainers.test.ts` (Docker-guarded, live pg + bolt).

## Seam note (demo untouched)

`src/lib/wholePersonGraphData.ts` and the `graph` mock seam are NOT modified. The
lenses read the projected store in production mode; the hardcoded demo stays the mock
source. Config-only backend switching (wave A's `GRAPH_BACKEND`) is unchanged — the
lenses inherit it because they live entirely above the `GraphStore` interface.
