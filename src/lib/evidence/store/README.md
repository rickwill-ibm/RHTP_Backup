# Evidence store — durable append-only ledger (O-1, ADR-005)

The Postgres-backed **system of record** for the Golden Thread Evidence Record.
It implements the existing `EvidenceStore` interface (`save` / `get` / `list`)
from `../evidenceStore.ts`, so it drops in behind the seam without changing any
caller.

## Why append-only

ADR-005: the evidence ledger must outlive and stand apart from the clinical
record, be ordered, attributed, and PHI-safe. So every write is a new immutable
row — never an update, never a delete:

- `seq` — monotonic identity (`BIGINT GENERATED ALWAYS AS IDENTITY`). Distinct
  across concurrent writers; ordering = commit order.
- `record_version` — per-record snapshot number (1, 2, 3 ...). `get()` returns
  the latest; `readLedger()` returns the full ordered history. A unique index on
  `(record_id, record_version)` makes a racing duplicate lose rather than corrupt.
- provenance — `actor` (the record's latest entry actor, else the configured
  floor), `correlation_id`, and `appended_at` from the injected clock
  (`@/lib/clock`), so appends are deterministic and testable.
- `payload` — the full EvidenceRecord as JSONB (references, codes,
  determinations; never raw PHI, per `evidenceRecord.ts`).

No mutation path exists. In code the ledger object exposes only append + read.
In the database, `002_..._immutability_trigger.pg.sql` installs a trigger that
raises on `UPDATE`/`DELETE` (defense in depth).

## Seam wiring

`getEvidenceStore()` reads `getDataMode('evidence')`:

| mode | store |
|------|-------|
| `mock` / `seeded` | the existing in-memory `defaultEvidenceStore()` (demo default) |
| `production` | the pg ledger, via `setProductionEvidenceStoreFactory(...)` |

Production without a registered factory throws `EvidenceStoreNotConfiguredError`
(fail loud, never a silent missing backend). Callers still use
`defaultEvidenceStore()` this iteration; pointing one at `getEvidenceStore()` is
the production flip.

## Migrations

Versioned SQL under `migrations/`, applied in filename order by
`applyMigrations(pg, { realPostgres })`:

- `001_create_evidence_ledger.sql` — table + indexes. Portable: real Postgres
  and pg-mem.
- `002_evidence_ledger_immutability_trigger.pg.sql` — the plpgsql guard.
  Real-Postgres-only (`.pg.sql`); the applier skips it when `realPostgres:false`
  (pg-mem tests), and the testcontainer spec verifies it on real Postgres.

## Testing

- `tests/evidence/store/pgEvidenceLedger.test.ts` — pg-mem: round-trip &
  ordering, versioned append-only history, concurrency (distinct seqs),
  immutability (no mutation method), seam selection.
- `tests/evidence/store/pgEvidenceLedger.integration.test.ts` — testcontainers
  real Postgres; **skips with a reason when Docker is absent**. Verifies the
  DB-level immutability trigger.
