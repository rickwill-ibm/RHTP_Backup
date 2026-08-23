# Iteration 2 Summary — Knowledge graph (both backends) + first agent (SDE)

Owner chose FULL ambition: the knowledge graph across TWO co-equal certified backends
AND the first real agent, the Signal Disposition Engine. Delivered across waves A
(graph foundation + outbox hardening), B1 (graph acceptance / five lenses), B2 (SDE),
and C (convergence). Final gates: **tsc 0; vitest 670 passed / 3 expected-fail / 78
skipped, 0 failed; check-file-sizes PASS.**

## What G1 (dual-backend graph) delivered

- **Store-agnostic projector** (`src/lib/graph/`): consumes C2 events from the outbox
  and emits a neutral property-graph mutation set (`UpsertNode`, `SetLabel`,
  `UpsertEdge`, `SetValidity`) — no SQL, no Cypher in the core. Deterministic (injected
  clock); every mutation an idempotent upsert keyed by business identity.
- **Per-domain mapping specs** (DP-1): coverage, encounter, sdoh, careteam. Dated
  edges (validity intervals for asOf); causal edges carry provenance (asserter +
  basis) and cannot exist without it; associative is default. Restriction is read from
  the **envelope**, so Part 2 / segmented data projects as a RESTRICTED node carrying
  the pipeline's segmentation labels.
- **One `GraphStore` interface, two adapters**: `adapters/postgres` (the reference
  relational projection) and `adapters/neo4j` (Cypher via neo4j-driver, all values
  bound, identifiers validated). Backend selection is **config-only** via
  `GRAPH_BACKEND` (`postgres-projection | neo4j-selfhosted | neo4j-aura`), proven by
  `backendConfig.test.ts` flipping config alone.
- **Five lens queries** as the acceptance suite (whole-person, care-gap, sdoh-barrier,
  care-team, part2-restricted), each store-agnostic, each consent-scoped, run against
  BOTH backends.
- **Rebuild-from-replay** (DP-1) and **merge/unmerge rekey by replay** (DP-7): identity
  merge is handled by replaying the log through identity resolution, never an in-place
  key rewrite; unmerge reverses it exactly.
- **Demo seam untouched**: `wholePersonGraphData` stays the mock source; the projected
  store is the production read path.

## What G2 (SDE) delivered

- **Signal Disposition Engine** (`src/lib/sde/`): the first agent on the stream lane.
  Taxonomy-driven intake (C2 events → typed signals, idempotent on `eventId`, ordered
  by outbox sequence, Part 2 dropped at intake), a pure act/suppress/delay/bundle
  decision fold, one coordinated touchpoint composed from approvals.
- **Policy IS DATA** (`data/disposition-policy.default.json`): frequency caps, channel
  preference, consent scope, priority weights, bundling cadence, rule id/versions —
  tunable with no code change (proven by toggling a rule and tightening a cap).
- **Explainable + audited**: every disposition names the policy rule(s) that fired;
  one PHI-safe audit entry per disposition. **Consent gate fails closed.**
- **Acceptance shape emergent from policy**: the seeded 9-signal batch yields exactly
  5 approved · 3 suppressed · 1 delayed · one coordinated touchpoint — not hardcoded
  in the engine. The `signal-disposition-engine` page stays green in mock mode.
- **Seam**: `signalDisposition` dataMode (fixed in wave C from the colliding `sde`
  id; `sde` remains the SD community-resource seam, independently switchable).

## Dual-backend parity

**CONFIRMED.** Both backends pass the SAME conformance/lens suite and return
byte-identical read-back:

- `tests/graph/graphStore.contract.test.ts` — same mutation stream → identical graph
  on Postgres (pg-mem) and Neo4j (in-memory fake): restricted nodes + labels,
  associative vs causal edges with provenance, dated edges, SetValidity, idempotency.
- `tests/graph/lens.acceptance.test.ts` — all five lenses, byte-identical `LensResult`
  across both backends, from one seeded cross-domain stream.
- `tests/graph/replay.test.ts` — rebuild-from-replay and merge/unmerge byte-identical
  across both backends.
- Switching backend is config-only (`backendConfig.test.ts`).

## pg-mem / fake-verified vs CI-testcontainer-pending

| Behavior | Verified in-sandbox | Authored for CI (Docker-guarded skip) |
|---|---|---|
| Outbox UNIQUE(member_id, sequence) + exactly-once CAS | memory + pg-mem contract/CAS tests | real Postgres UNIQUE rejection + writer-vs-sweep exactly-once |
| Postgres graph projection + lenses | pg-mem (contract, projector, config, lens) | real Postgres (testcontainer) |
| Neo4j graph projection + lenses | in-memory fake + Cypher-rendering unit tests | real bolt (`@testcontainers/neo4j`) |
| Dual-backend lens parity | pg-mem vs fake byte-equality | live pg + live bolt lens spec |

No Docker in the sandbox (owner's hybrid choice): Postgres paths are pg-mem-verified,
Neo4j paths verified against a fake implementing the same adapter interface plus pure
Cypher-rendering unit tests. The live integration specs are authored and
Docker-guarded (skip-with-reason) for the owner's CI. +4 such skips this iteration.

## Carried findings

- **Outbox crash-recovery republish** stays at-least-once by design (publish-then-mark
  on already-confirmed rows). Safe: downstream is idempotent — the projector by
  idempotent upsert (replay-twice tests), SDE intake by `eventId` dedupe (intake test).
  The named pending-claim double-publish window is fully closed at the data layer.
- **CI-testcontainer-pending**: the real-Postgres / real-bolt / live-dual-backend-lens
  assertions run only where Docker is available (see the table). The logical behavior
  is fully covered in-sandbox; CI adds the live-driver confirmation.

## Convergence verdict: **DRY**

0 new material defects in convergence, the one flagged seam collision fixed, all three
authoritative gates green.
