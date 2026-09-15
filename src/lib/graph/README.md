# Graph foundation (`src/lib/graph`)

The store-agnostic knowledge-graph projection (plan §4A stage 5, C10, DP-1). It
turns the outbox's C2 event stream into a property graph, behind ONE interface
with TWO co-equal certified backends (ADR-001 v12.3): the Postgres reference
projection and Neo4j. Switching backend is a config change, never a code change.

Wave A builds the projector, the mapping specs, the two adapters, and the shared
contract test. Wave B1 adds the five **lens queries** (`lens/`), the merge/unmerge +
rebuild-from-replay pipeline (`replay.ts`), and the care-team mapping domain, all on
top of the wave-A surface without changing the projector core or the adapters.

## The two layers

**1. Neutral mutation instruction set** (`types.ts`). A graph change described
with zero store knowledge — no SQL, no Cypher:

| Op            | Meaning                                                                          |
| ------------- | -------------------------------------------------------------------------------- |
| `UpsertNode`  | create/merge a node by `(kind, key)`; `restricted` marks Part 2 / segmented      |
| `SetLabel`    | attach an extra label (segmentation labels, `Restricted`)                        |
| `UpsertEdge`  | create/merge a **dated** edge; associative (default) or causal (with provenance) |
| `SetValidity` | revise an edge's validity interval (e.g. close it)                               |

**2. `GraphStore`** — `apply(mutations)`, `getNode`, `listNodes`, `listEdges`.
One interface, two implementations, identical read-back records.

## The projector (`projector.ts`)

`project(events, deps)` maps C2 events to mutations and nothing else. It is
deterministic (only ambient input is the injected clock) and every mutation is an
idempotent upsert keyed by business identity, so **replaying the event log rebuilds
the identical graph** (DP-1 rebuild-from-replay). Feed events in per-member outbox
sequence order.

## Mapping specs (`mapping/`, DP-1)

One spec per domain; the projector is domain-agnostic and asks the registry which
spec owns an event. Invariants every spec obeys (shared helpers in `mapping/spec.ts`):

- the **Member** node always anchors the subgraph;
- **restriction is read from the envelope** (`consentContext`), never the payload,
  so Part 2 / segmented data projects as a **RESTRICTED node** carrying the
  segmentation label the pipeline stamped — by envelope inspection alone (C10.1);
- **every edge is dated** (validity interval) for asOf queries;
- **causal edges carry provenance** (`asserter` + `basis`); associative is default.

| Domain    | Event         | Node(s)                          | Edge(s)                                                                                                     |
| --------- | ------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| coverage  | `coverage.*`  | Coverage                         | `HAS_COVERAGE` (associative, dated)                                                                         |
| encounter | `encounter.*` | Encounter (restricted if Part 2) | `HAD_ENCOUNTER` (associative, dated; discharge closes it)                                                   |
| sdoh      | `sdoh.*`      | SdohScreening, SocialNeed        | `SCREENED_FOR` (associative); a positive screen adds `HAS_UNMET_NEED` (**causal**, asserter + Z-code basis) |
| careteam  | `careteam.*`  | CareTeamMember                   | `HAS_CARE_TEAM` (associative, dated; unassign closes it)                                                    |

## The two backends (`adapters/`)

| Backend     | Rendering                                                                                 | Verified by                                            |
| ----------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `postgres/` | mutations → relational upserts (`graph_node`, `graph_edge`); the **reference** projection | pg-mem (unit) + real Postgres (Docker-guarded)         |
| `neo4j/`    | mutations → Cypher via neo4j-driver                                                       | in-memory **fake** (unit) + real bolt (Docker-guarded) |

Read-back for both flows through the shared `adapters/records.ts` helpers, so their
records are identical by construction. `assertIdentifier` validates every
interpolated label/type in the Cypher, so only bound parameters carry values.

## Backend selection (config-only)

`getGraphBackend()` (in `config/dataMode.ts`) resolves `GRAPH_BACKEND` to one of
`postgres-projection | neo4j-selfhosted | neo4j-aura`; `createGraphStore(conn)`
builds the matching store. `tests/graph/backendConfig.test.ts` proves that flipping
the config alone changes the backend and the same mutations yield the same graph.

## Lens queries (`lens/`, DP-1)

The five store-agnostic lens queries - `whole-person`, `care-gap`, `sdoh-barrier`,
`care-team`, `part2-restricted` - each expressed only against the `GraphStore` read
API, so both backends satisfy them identically. Every lens runs under a
`ConsentScope`; restricted (Part 2) nodes are excluded unless the scope covers them.
See `lens/README.md`.

## Rebuild-from-replay + merge/unmerge (`replay.ts`, DP-1 + DP-7)

Identity merge is handled by REPLAY, never an in-place key rewrite. `resolveIdentity`
folds `member.merged` / `member.unmerged` control events into a
`subsumed -> survivor` map; `rekeyEvents` rewrites each domain event's `memberId`
through it before projection, so the subsumed member's subgraph lands under the
survivor with no store-side key mutation. `replayToStore` runs the whole pipeline;
because every mutation is an idempotent upsert, replaying a stream onto a fresh store
rebuilds a byte-identical graph, and removing the merge (or adding an unmerge) and
replaying reverses it exactly. Proven on both backends in `replay.test.ts`.

## The demo seam (untouched)

The hardcoded `wholePersonGraphData` stays the mock source for the `graph` seam
(`lib/careTeam/graph/resources.ts`). Production mode reads a store produced here.
Wave A does not modify the demo file.

## Tests

- `tests/graph/graphStore.contract.test.ts` — the **shared contract suite**: the
  same mutations against both backends, asserting identical logical results (the
  co-equal guarantee in code).
- `tests/graph/projector.test.ts` — projection semantics, determinism, restricted
  nodes, causal provenance, rebuild-from-replay.
- `tests/graph/cypher.test.ts` — Cypher rendering + injection guard.
- `tests/graph/backendConfig.test.ts` — config-only backend switch.
- `tests/graph/lens.acceptance.test.ts` — the **five lens queries** on both
  backends from one seeded stream + Part 2 enforcement (the co-equal lens guarantee).
- `tests/graph/replay.test.ts` — rebuild-from-replay + merge/unmerge rekey, both backends.
- `tests/integration/graph.neo4j.testcontainers.test.ts` — real bolt; Docker-guarded.
- `tests/integration/graph.lens.testcontainers.test.ts` — lenses + Part 2 + merge on
  real Postgres AND real Neo4j; Docker-guarded.
