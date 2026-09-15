// SEAM: substrate  // I9 substrate
/**
 * The unified migration runner (Iteration 9, Wave A).
 *
 * Discovers every store's migrations from the source registry, applies each one
 * exactly once, and records it in a `schema_migrations` ledger keyed by
 * (store, name). Two guarantees the register asked for:
 *
 *   IDEMPOTENT  — a migration already recorded (with a matching checksum) is a
 *                 no-op on re-run. The DDL itself is also IF NOT EXISTS, so even
 *                 the first-apply path is safe against a pre-existing table; the
 *                 ledger short-circuits the common re-run so applied stays empty.
 *   CHECKSUM-GUARDED — if a migration's current text no longer matches the
 *                 checksum recorded when it was applied, the runner FAILS LOUD
 *                 (ChecksumMismatchError). A shipped migration is immutable; an
 *                 edit to an applied migration is a deploy-time error, never a
 *                 silent drift.
 *
 * Deterministic: `applied_at` comes from the injected clock (src/lib/clock.ts).
 */
import { createHash } from 'crypto';
import * as clock from '@/lib/clock';
import { DEFAULT_MIGRATION_SOURCES } from './sources';
import type {
  Migration,
  MigrationRef,
  PgLike,
  RunMigrationsOptions,
  RunMigrationsResult,
} from './types';

// The ledger of applied migrations. Portable (no plpgsql). Re-run EVERY pass
// (before the per-migration skip check), so it must survive a second execution
// under pg-mem: that engine errors when a re-run `CREATE TABLE IF NOT EXISTS`
// leaves inline column/PK constraints unread (the quirk graph/schema.ts documents).
// So: bare columns, identity declared as a separate CREATE UNIQUE INDEX, no inline
// NOT NULL. The writer always supplies every column, and real Postgres accepts
// this unchanged (the unique index is the invariant).
export const SCHEMA_MIGRATIONS_DDL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  store       TEXT,
  name        TEXT,
  checksum    TEXT,
  applied_at  TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS schema_migrations_uk ON schema_migrations (store, name);`;

/** Thrown when an already-applied migration's text no longer matches its checksum. */
export class ChecksumMismatchError extends Error {
  readonly store: string;
  readonly migrationName: string;
  readonly recorded: string;
  readonly current: string;
  constructor(store: string, name: string, recorded: string, current: string) {
    super(
      `schema_migrations: checksum mismatch for '${store}/${name}'. Recorded ${recorded}, ` +
        `current ${current}. A shipped migration is immutable — never edit an applied ` +
        `migration in place; add a new one. Refusing to proceed (fail loud).`
    );
    this.name = 'ChecksumMismatchError';
    this.store = store;
    this.migrationName = name;
    this.recorded = recorded;
    this.current = current;
  }
}

/** Deterministic sha-256 of a migration's SQL text. */
export function checksumOf(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex');
}

/** Gather every migration for the selected mode, in source-then-name order. */
export async function discoverMigrations(opts: RunMigrationsOptions = {}): Promise<Migration[]> {
  const realPostgres = opts.realPostgres ?? true;
  const sources = opts.sources ?? DEFAULT_MIGRATION_SOURCES;
  const out: Migration[] = [];
  for (const source of sources) {
    for (const m of await source.load()) {
      if (!realPostgres && m.realPostgresOnly) continue;
      out.push(m);
    }
  }
  return out;
}

/**
 * Apply all discovered migrations idempotently against `pg`, recording each in
 * schema_migrations. Re-running is a no-op (applied is empty, every migration
 * skipped). A checksum mismatch on an already-applied migration throws.
 */
export async function runMigrations(
  pg: PgLike,
  opts: RunMigrationsOptions = {}
): Promise<RunMigrationsResult> {
  await pg.query(SCHEMA_MIGRATIONS_DDL);
  const migrations = await discoverMigrations(opts);
  const applied: MigrationRef[] = [];
  const skipped: MigrationRef[] = [];

  for (const m of migrations) {
    const checksum = checksumOf(m.sql);
    const existing = await pg.query<{ checksum: string }>(
      `SELECT checksum FROM schema_migrations WHERE store = $1 AND name = $2`,
      [m.store, m.name]
    );
    if (existing.rows.length > 0) {
      const recorded = String(existing.rows[0].checksum);
      if (recorded !== checksum) {
        throw new ChecksumMismatchError(m.store, m.name, recorded, checksum);
      }
      skipped.push({ store: m.store, name: m.name });
      continue;
    }
    await pg.query(m.sql);
    await pg.query(
      `INSERT INTO schema_migrations (store, name, checksum, applied_at)
         VALUES ($1, $2, $3, $4)`,
      [m.store, m.name, checksum, clock.nowIso()]
    );
    applied.push({ store: m.store, name: m.name });
  }

  return { applied, skipped, total: migrations.length };
}

/** Read the recorded ledger (oldest first by store, name) for diagnostics/tests. */
export async function readMigrationLedger(pg: PgLike): Promise<MigrationRef[]> {
  const res = await pg.query<{ store: string; name: string }>(
    `SELECT store, name FROM schema_migrations ORDER BY store ASC, name ASC`
  );
  return res.rows.map((r) => ({ store: r.store, name: r.name }));
}
