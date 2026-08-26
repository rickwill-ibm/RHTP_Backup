# Iteration 1 — Wave B: persistence + data adapters

Persistence + data-adapter engineer. Scope: O-1 durable evidence ledger, O-2
data-source adapters, and their tests. Wave A owns `src/lib/pipeline/` and
`src/lib/outbox/` — untouched here.

## O-1: durable append-only evidence ledger (ADR-005)

### Evidence interface reused (callers unchanged)

The pg ledger implements the **existing** `EvidenceStore` interface from
`src/lib/evidence/evidenceStore.ts`, verbatim:

```ts
interface EvidenceStore {
  save(record: EvidenceRecord): Promise<void>;
  get(id: string): Promise<EvidenceRecord | null>;
  list(): Promise<string[]>;
}
```

No caller changed. Callers (`api/evidence/[id]`, `api/work-queue`,
`api/financial-clearance`, `goldenThread/*`) still use `defaultEvidenceStore()`.
The ledger also exposes append-only introspection beyond the interface
(`readLedger`, `maxSeq`) for audit/replay.

### Ledger schema (`src/lib/evidence/store/migrations/`)

`001_create_evidence_ledger.sql` (portable — real Postgres **and** pg-mem):

| column | role |
|--------|------|
| `seq BIGINT GENERATED ALWAYS AS IDENTITY PK` | monotonic sequence, distinct across concurrent writers, ordering = commit order |
| `record_id`, `record_version` | per-record snapshot number (1,2,3…); unique index on `(record_id, record_version)` rejects a racing dup |
| `member_id`, `status`, `entry_count` | scannable provenance/columns |
| `payload JSONB` | full EvidenceRecord snapshot (references/codes, PHI-safe) |
| `actor`, `correlation_id`, `appended_at` | attribution + injected-clock timestamp |

Every `save` is a new immutable row (append). `get` = latest snapshot; each save
derives the next version atomically via subselect. No update/delete method
exists on the object.

`002_evidence_ledger_immutability_trigger.pg.sql` (real Postgres only — plpgsql
is beyond pg-mem's parser; `.pg.sql` suffix makes the applier skip it under
pg-mem): a `BEFORE UPDATE OR DELETE` trigger that raises `append-only`. The
testcontainer spec verifies it actually blocks mutations. Defense-in-depth atop
the code-level guarantee.

### Seam wiring

`getEvidenceStore()` in `src/lib/evidence/store/index.ts` resolves
`getDataMode('evidence')`:

- `mock` / `seeded` → the existing in-memory `defaultEvidenceStore()` (demo stays
  green by default; byte-identical behavior).
- `production` → the pg ledger via a **registered** factory
  (`setProductionEvidenceStoreFactory`), so wiring a real pool is a
  composition-root concern and tests register pg-mem. Unregistered production
  throws `EvidenceStoreNotConfiguredError` (BackboneNotConfigured pattern).

`'evidence'` was already in the dataMode registry; the seam now has a live switch
point. Migration applier is `applyMigrations(pg, { realPostgres })`;
driver-agnostic via a `PgLike` interface (real `pg` and pg-mem both satisfy it).

## O-2: real data-source adapters (`src/lib/dataSources/`)

Generic, persona-free. Three seams, one shape each (normalized type +
`normalizeX(raw, asOf)` boundary parser + seeded loader from `data/*.json` +
production stub that throws `DataSourceNotConfiguredError` + `getXLoader()`
selector on `getDataMode(seam)`):

| Seam id (registered in dataMode) | Normalized output | Seed file |
|---|---|---|
| `goldCardRoster` | `GoldCardRoster` (granted cards + PA histories) | `data/gold-card-roster.seed.json` |
| `denialRateFeed` | `DenialRateFeed` (rate by code, optional plan) | `data/denial-rates.seed.json` |
| `providerDirectory` | `ProviderDirectory` (NPI, specialty, geo, LOBs, status) | `data/provider-directory.seed.json` |

All three seam ids added to `DATA_MODE_SEAMS` in `src/lib/config/dataMode.ts`
(env selectors `DATA_MODE_GOLD_CARD_ROSTER` etc.). These are the durable loader
layer feeding the existing in-engine seams (`policy/goldCardSource.ts`,
`policy/denialRates.ts`); those engine injection points are unchanged.

## Tests (31 new cases: 25 run + pass, 6 Docker-guarded skips)

- `tests/evidence/store/pgEvidenceLedger.test.ts` (11, pg-mem): round-trip +
  entry-order preservation; append-only versioned history (old snapshot intact);
  provenance (monotonic seq, attributed actor, correlation, injected-clock ts);
  concurrency (25 concurrent appends → distinct seqs; same-record → distinct
  versions); immutability (object exposes only save/get/list/readLedger/maxSeq —
  no mutation method); seam selection (mock / production-throws / registered).
- `tests/dataSources/adapters.test.ts` (14): normalization happy-path, defaults,
  and malformed-row rejection (approvals>submissions, missing field, rate out of
  0..1, unknown status, non-string LOB) for all three; seeded/production
  selection; NotConfigured; seam registration.
- `tests/evidence/store/pgEvidenceLedger.integration.test.ts` (5,
  testcontainers real Postgres): `describe.skipIf(!Docker)` with a visible skip
  reason. Round-trip, distinct BIGINT sequences, and the DB-level trigger
  refusing UPDATE and DELETE.

## Verification

- `npx tsc --noEmit` → **0 errors**.
- `npx vitest run` → **544 passed**, 0 failed (519 baseline + 25 new); 6
  integration cases skipped (no Docker); pre-existing `test.fails` markers
  unaffected.
- `bash check-file-sizes.sh` → **PASS**, ratchet intact (75 frozen legacy files
  unchanged; no new file grown). Largest new file: `pgEvidenceLedger.ts` (166).

## Notes / deviations

- **zod not used.** The convention names zod for boundaries, but zod is not
  installed and the repo has zero zod usage. I followed the repo's established
  boundary discipline (hand-written type guards, the `isEvidenceRecord` pattern)
  in `dataSources/common.ts` and the ledger payload guard. Introducing zod
  repo-wide is a separate, out-of-scope change.
- **`types/pg.d.ts` added.** `pg` is a runtime dep but ships no types and
  `@types/pg` is absent; a minimal ambient shim covers only the surface the
  integration spec uses. The ledger itself never imports `pg` (uses `PgLike`).
  Swap for `@types/pg` in CI if broader coverage is wanted.
- **Concurrent-wave race observed, self-resolved:** during verification `tsc`
  briefly reported `pipeline/stages.ts` missing `./transform` (wave A mid-write);
  it cleared once wave A landed the file. No action on my side — that tree is
  wave A's.
