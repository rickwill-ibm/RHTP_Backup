# Iteration 9 — Wave A (Substrate / persistence) — Report

Framework v1.2. Role B2 (substrate/persistence), disjoint tree. Working tree
`/home/claude/baseline`, live. Owns `src/lib/substrate/` + `tests/substrate/`.

## Scope delivered

### 1. Unified migration runner (`src/lib/substrate/migrationRunner.ts`)
Discovers every per-store migration from one ordered source registry
(`sources.ts`), applies each exactly once, and records it in a
`schema_migrations` ledger keyed by `(store, name)` with a sha-256 checksum and
an injected-clock `applied_at`.

- IDEMPOTENT: a migration already recorded (checksum matches) is skipped — a
  re-run returns `applied: []`, every migration in `skipped`. The store DDLs
  execute exactly once (the ledger short-circuits them on re-run); only the
  `schema_migrations` DDL itself runs every pass, so it is written re-run-safe
  under pg-mem (bare columns + separate `CREATE UNIQUE INDEX`, no inline
  constraints — the AST-coverage quirk `graph/schema.ts` documents).
- CHECKSUM-GUARDED: if an already-applied migration's current text no longer
  matches the recorded checksum, the runner throws `ChecksumMismatchError`
  (fail loud). A shipped migration is immutable; an in-place edit is a
  deploy-time error, never silent drift.
- `.pg.sql` real-Postgres-only migrations (the evidence + dead-letter
  immutability triggers) are discovered for real pg and skipped under
  `{ realPostgres: false }` (pg-mem).

### 2. Migration source registry (`src/lib/substrate/sources.ts`)
One ordered `MigrationSource[]`:
- `fileSource` — evidence + deadLetter versioned SQL dirs.
- `inlineSource` — outbox / idempotency / graph / crossReference exported DDL
  strings.

The unified runner is what actually creates the outbox / idempotency / graph /
identity_xref tables at bootstrap; those stores do not self-ensure their schema.

### 3. Substrate bootstrap (`src/lib/substrate/bootstrap.ts`)
`bootstrapSubstrate(config?)` turns one DATABASE_URL/config into the full wired
set of pg-backed stores (evidence, deadLetter, idempotency, outbox, graph,
crossReference) over a single connection, running the migration runner first.

- FAIL CLOSED (E9): with no injected `pg` and no connection string (neither
  `config.databaseUrl` nor `process.env.DATABASE_URL`), throws
  `SubstrateNotConfiguredError`. It never falls back to an in-memory store — an
  unconfigured production substrate must fail at startup, not silently serve a
  volatile Map as durable persistence.
- The `pg` Pool is constructed only when a connection string is resolved and no
  `pg` was injected; pg-mem tests inject `config.pg`, so no driver connection is
  ever opened in-sandbox. Live pg stays CI-pending + fail-closed (no faked
  green).

### 4. crossReference + governance disposition
- crossReference ALREADY has a pg adapter (`pgCrossReferenceStore.ts`, async
  contract) — the bootstrap wires it. No change to its dir.
- governance is an EXPLICIT fail-closed disposition, memory-only. Its store
  contract (`ValueSetGovernanceStore`) is SYNCHRONOUS (`putVersion`/`getVersion`
  return values, not Promises), so a durable pg adapter cannot honor it without
  an async refactor of the governance service/replay — out of this wave's scope
  and would collide with the terminology tree (disjoint-tree rule). Governance
  keeps its existing production fail-closed guard
  (`ValueSetGovernanceStoreNotConfiguredError`) and is intentionally NOT wired by
  the bootstrap. Documented in `sources.ts` + `bootstrap.ts` headers. This is the
  register's sanctioned "explicit fail-closed disposition + memory-only note"
  option; the governance dir is left untouched (zero cross-wave conflict).

## Files
- `src/lib/substrate/types.ts` (84)
- `src/lib/substrate/sources.ts` (74)
- `src/lib/substrate/migrationRunner.ts` (133)
- `src/lib/substrate/bootstrap.ts` (117)
- `src/lib/substrate/index.ts` (49)
- `tests/substrate/migrations.test.ts` (114)
- `tests/substrate/bootstrap.test.ts` (101)

All new files <= 400 lines. No governance/deploy/lifecycle dirs touched.

## Tests (pg-mem), 11 new
migrations.test.ts (6): applies every store migration + records ledger + tables
exist; idempotent (2nd/3rd run no-op); real-Postgres-only skipped under pg-mem /
discovered for real pg; checksum-mismatch fails loud; checksum is a stable
content hash.
bootstrap.test.ts (5): wires all six stores + runs migrations over one
connection; wired stores operate against the migrated schema (idempotency,
evidence, outbox, crossReference, deadLetter, graph); fails closed unconfigured;
connection-string resolution (config > env > null); can skip migrations.

## Verification (`/home/claude/baseline`)
- `npx tsc --noEmit`: 0 errors in this wave's tree. The only tsc errors present
  are two lines in `tests/lifecycle/fhirPurgeSource.test.ts` — Wave C's disjoint
  tree, running in parallel, not owned or touched here.
- `npx vitest run tests/substrate tests/evidence tests/outbox`: GREEN — 56
  passed, 5 skipped (Docker-guarded live integration), 0 failed.
- `bash check-file-sizes.sh`: PASS (ratchet intact, 75 frozen legacy files
  unchanged, 0 new violations).

## DoD (composite v1.2, substrate portion)
- migrations idempotent + checksum-guarded: PROVEN (tested).
- bootstrap fails closed unconfigured, never a silent in-memory prod (E9):
  PROVEN (tested).
- deterministic (injected clock for `applied_at`); every file <= 400.
- Live pg/neo4j/external: CI-pending + fail-closed, honestly labeled, no faked
  green.
