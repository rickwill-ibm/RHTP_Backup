// SEAM: substrate  // I9 substrate
/**
 * Unified persistence substrate (Iteration 9, Wave A) — public surface.
 *
 * Two capabilities over one DATABASE_URL/config:
 *   runMigrations       — discover per-store migrations, apply idempotently,
 *                          record a checksum-guarded schema_migrations ledger.
 *   bootstrapSubstrate  — construct every pg-backed store from one connection;
 *                          fail closed (SubstrateNotConfiguredError) when nothing
 *                          is configured, never a silent in-memory fallback.
 *
 * The `pg` driver is only touched inside bootstrap when a real connection string
 * is resolved; pg-mem tests inject `config.pg`. Importing this module opens no
 * connection.
 */
export {
  runMigrations,
  discoverMigrations,
  readMigrationLedger,
  checksumOf,
  SCHEMA_MIGRATIONS_DDL,
  ChecksumMismatchError,
} from './migrationRunner';

export {
  bootstrapSubstrate,
  substrateConnectionString,
  SubstrateNotConfiguredError,
  type SubstrateConfig,
  type WiredStores,
  type WiredSubstrate,
} from './bootstrap';

export {
  DEFAULT_MIGRATION_SOURCES,
  fileSource,
  inlineSource,
} from './sources';

export type {
  PgLike,
  PgQueryResult,
  Migration,
  MigrationSource,
  MigrationRef,
  MigrationLedgerRecord,
  RunMigrationsOptions,
  RunMigrationsResult,
} from './types';
