# Iteration 2 Wave A — Graph foundation (both backends) + outbox hardening

Graph foundation engineer, wave A. Live tree `/home/claude/baseline`. Wave B (five
lens queries, SDE) is deliberately NOT built here.

## Verification (definition of done)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx vitest run` | 619 passed, 3 expected-fail, 75 skipped (was 589 / 3 / 71) |
| `bash check-file-sizes.sh` | PASS (ratchet intact, 75 frozen legacy files unchanged/smaller) |

New: +30 passing tests, +4 Docker-guarded skips (real-Postgres uniqueness/exactly-once,
real-bolt Neo4j). Every new source file is <=400 lines; every domain folder has a
README; the graph README is <=150 lines. Nothing prior regressed.

---

## STEP 0 — outbox MUST-FIX (carried from Iteration 1)

The projector depends on correct exactly-once per-member propagation. pg-mem hid
two real-Postgres multi-writer defects; both are now closed at the data layer.

1. **UNIQUE(member_id, sequence).** Added to the outbox schema (`pgOutboxStore.ts`
   `OUTBOX_DDL`). NULLs are distinct in SQL, so many pending rows (sequence NULL)
   coexist while confirmed rows are strictly ordered. This is the backstop that
   turns a concurrent same-member sequence collision into a caught error, never a
   duplicate.

2. **Atomic sequence assignment (no app-side MAX+1).** New store method
   `claimForConfirm(id, memberId, nowMs)` does the sequence assignment SERVER-SIDE
   inside a single statement:
   `UPDATE outbox_intent SET status='confirmed', sequence = COALESCE((SELECT MAX(sequence) ... member_id), -1)+1 WHERE id=$ AND status='pending' RETURNING sequence`.
   On a same-member collision (real PG only) the UNIQUE index rejects the loser and
   the claim retries, re-reading the now-higher MAX.

3. **Sweeper/writer double-publish window closed (compare-and-set).** The same
   statement's `WHERE status='pending'` is the CAS: exactly one worker flips a row
   off `pending`. The live writer racing the reconciliation sweep (or a second
   instance) gets `null` back and publishes NOTHING. `confirmAndPublish` now returns
   `number | null`; `writer.drain` and `sweep.recoverMember` only record a publish
   when the claim was won. The in-process `MemberLock` remains the intra-process
   partition guard; the DB CAS is what makes it exactly-once ACROSS processes.

Implemented in both stores: `pgOutboxStore.ts` (SQL CAS + unique-violation retry)
and `memoryOutboxStore.ts` (synchronous map CAS mirror). Interface method added to
`OutboxStore` in `types.ts`.

**Tests.** pg-mem stays green. The shared `OutboxStore` contract suite gains three
CAS cases (run against BOTH memory and pg-mem): claim-once-then-lose, dense
per-member sequencing, missing-id returns null. The Docker-guarded
`tests/integration/outbox.testcontainers.test.ts` gains two real-Postgres specs: the
UNIQUE(member_id, sequence) rejection, and a writer-racing-the-sweep EXACTLY-ONCE
assertion. Both skip with a clear reason when Docker is absent.

Residual (noted, not silently fixed): the crash-recovery republish of already-
`confirmed` rows in `writer.drain` stays publish-then-mark (at-least-once, idempotent
downstream via `eventId`); the sweep never touches confirmed rows, so it cannot race
that path. The named pending-claim window is fully closed.

---

## The graph (`src/lib/graph/`)

### 1. Store-agnostic projector (§4A stage 5, C10)

`project(events, deps)` / `projectEvent(event, deps)` consume C2 events and emit ONLY
the neutral mutation instruction set. There is NO SQL and NO Cypher anywhere in the
projector core or the mapping specs. Determinism: the only ambient input is the
injected clock (`ProjectorDeps.now`, bound to `src/lib/clock.ts`); same events + same
clock produce byte-identical mutations. Because every mutation is an idempotent
upsert keyed by business identity, replaying the event log rebuilds the identical
graph (DP-1 rebuild-from-replay, proven in `projector.test.ts`).

### 2. Mutation instruction set (`types.ts`)

Four ops, neutral property-graph semantics, value space = scalar / array / null (a
legal Neo4j property AND a lossless Postgres column/JSON value):

- `UpsertNode { kind, key, properties, restricted? }`
- `SetLabel { kind, key, label }`
- `UpsertEdge { type, from, to, properties?, validity, semantics }`
- `SetValidity { type, from, to, validity }`

`EdgeValidity { start, end? }` dates every edge. `EdgeSemantics` is
`{ kind: 'associative' }` (default) or `{ kind: 'causal', asserter, basis }` —
causal edges cannot exist without provenance.

### 3. Per-domain mapping specs (DP-1, `mapping/`)

One spec per domain; the projector is domain-agnostic and asks the registry which
spec owns an event (open/closed). Shared helpers in `mapping/spec.ts` encode the
DP-1 invariants so a spec cannot forget them.

| Domain | Event | Nodes | Edges |
|---|---|---|---|
| coverage | `coverage.*` | Coverage | `HAS_COVERAGE` associative, dated from periodStart |
| encounter | `encounter.*` | Encounter (RESTRICTED if Part 2) | `HAD_ENCOUNTER` associative, dated; discharge closes validity |
| sdoh | `sdoh.*` | SdohScreening, SocialNeed | `SCREENED_FOR` associative; a positive screen adds `HAS_UNMET_NEED` CAUSAL with asserter + Z-code basis |

Restriction is read from the ENVELOPE (`consentContext.part2Restricted` +
`segmentLabels`), never the payload, so Part 2 / segmented data projects as a
RESTRICTED node (`restricted: true` + a `Restricted` label + each segmentation label
the pipeline stamped) by envelope inspection alone (C10.1).

### 4. One GraphStore interface, two adapters

`GraphStore` = `apply(mutations)`, `getNode`, `listNodes`, `listEdges`. Read-back
records for both backends flow through the shared `adapters/records.ts` helpers, so
they are identical by construction.

- **`adapters/postgres/`** — the reference projection. Mutations render as relational
  upserts into `graph_node` / `graph_edge` (uniqueness via `CREATE UNIQUE INDEX`;
  merge semantics computed in-app for pg-mem portability). pg-mem-backed in unit
  tests, real Postgres in the Docker-guarded CI spec.
- **`adapters/neo4j/`** — mutations render to Cypher (`cypher.ts`, pure and
  unit-tested) run over a minimal `Neo4jRunner` that neo4j-driver's `Session`
  satisfies (`store.ts`). Every interpolated label/type is validated
  (`assertIdentifier`); all values are bound parameters. An in-memory fake
  (`fake.ts`) implements the same interface for the contract test; the real bolt
  path is exercised by the Docker-guarded `graph.neo4j.testcontainers.test.ts`.

**Backend selection is config-only.** `getGraphBackend()` in `config/dataMode.ts`
resolves `GRAPH_BACKEND` to `postgres-projection | neo4j-selfhosted | neo4j-aura`
(default: postgres-projection). `createGraphStore(conn)` builds the matching store.
`backendConfig.test.ts` proves flipping the config alone swaps the backend and the
same mutations yield the same graph.

### 5. Shared GraphStore CONTRACT TEST (the co-equal guarantee in code)

`tests/graph/graphStore.contract.test.ts` runs the SAME mutation stream against BOTH
backends (Postgres via pg-mem, Neo4j via the fake) and asserts identical read-back:
restricted nodes with segmentation labels, associative vs causal edges with
provenance, dated edges, SetValidity closing an interval, and apply-idempotency
(replay yields the identical graph). A final case asserts the two backends return
byte-equal records for the same input.

---

## pg-mem / fake-verified vs CI-testcontainer

| Behavior | Verified in-sandbox | Authored for CI (Docker-guarded skip) |
|---|---|---|
| Outbox unique(member_id, sequence) | pg-mem contract + CAS unit tests | real Postgres UNIQUE rejection |
| Outbox exactly-once (writer vs sweep) | memory + pg-mem CAS contract tests | real Postgres concurrent writer+sweep |
| Postgres graph projection | pg-mem (contract + projector + config) | real Postgres (existing testcontainer pattern) |
| Neo4j graph projection | in-memory fake (contract) + Cypher rendering unit tests | real bolt via @testcontainers/neo4j |

Neo4j cannot run live here; the Cypher is proven by rendering unit tests + the fake's
identical logical behavior, with the real bolt spec authored and Docker-guarded
(`@testcontainers/neo4j` is an optional CI-only dependency, imported dynamically so a
missing package never breaks type-check or collection).

## Seam note (demo untouched)

`src/lib/wholePersonGraphData.ts` and `lib/careTeam/graph/resources.ts` (the `graph`
mock seam) are NOT modified. The registered `graph` data-mode seam stays the
mock-vs-production switch; the new `GRAPH_BACKEND` axis chooses WHICH certified
production backend the projected store uses. Wiring the production read path to
`createGraphStore` is wave B.

## Note on infra quirk

pg-mem 3.0.14 under Vite's build rejects `CREATE TABLE IF NOT EXISTS` with inline
column `NOT NULL` / table-level composite constraints (checkAstCoverage), though the
same DDL runs under plain Node and real Postgres. The graph schema therefore declares
identity via `CREATE UNIQUE INDEX` and omits `NOT NULL` (the projector always supplies
key columns; real Postgres accepts it unchanged). Documented in `schema.ts`.
