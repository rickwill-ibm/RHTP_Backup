// SEAM: substrate  // I9 substrate (unified persistence bootstrap + migration runner)
/**
 * Substrate shared types (Iteration 9, Wave A).
 *
 * The substrate is the ONE place that turns a single DATABASE_URL/config into the
 * full set of pg-backed stores, with their schema applied by the unified migration
 * runner. It exists so a deployment has a single, fail-closed persistence
 * bootstrap instead of each store wiring its own pool ad hoc.
 *
 * `PgLike` is the minimal `pg`-compatible query surface. The real `pg` Pool and
 * the in-process `pg-mem` adapter both satisfy it, and it is structurally
 * identical to each store's own PgLike/PgQueryable so one connection drives them
 * all. No driver dependency leaks into this interface.
 */

export interface PgQueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount?: number | null;
}

export interface PgLike {
  query<Row = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<PgQueryResult<Row>>;
}

/**
 * One unit of schema the runner applies exactly once. `sql` is the full text
 * (its sha-256 is the checksum the ledger guards); `realPostgresOnly` marks a
 * migration the pg-mem parser cannot handle (plpgsql triggers), skipped under
 * `{ realPostgres: false }`.
 */
export interface Migration {
  /** Owning store, e.g. 'evidence', 'outbox'. Namespaces the ledger key. */
  store: string;
  /** Migration name, unique within a store, e.g. '001_create_evidence_ledger.sql'. */
  name: string;
  /** The SQL text applied verbatim. Its checksum is derived from this. */
  sql: string;
  /** True for a real-Postgres-only migration (skipped under pg-mem). */
  realPostgresOnly: boolean;
}

/** A discoverable provider of migrations for one store. */
export interface MigrationSource {
  store: string;
  load(): Promise<Migration[]>;
}

/** Options shared by discovery and the runner. */
export interface RunMigrationsOptions {
  /**
   * True (default) discovers/applies every migration, including real-Postgres-only
   * ones. False skips `.pg.sql` — the mode pg-mem tests run in.
   */
  realPostgres?: boolean;
  /** Override the source registry (tests). Defaults to DEFAULT_MIGRATION_SOURCES. */
  sources?: MigrationSource[];
}

/** One recorded schema_migrations row. */
export interface MigrationLedgerRecord {
  store: string;
  name: string;
  checksum: string;
  appliedAt: string;
}

/** A store+name reference used in the run summary. */
export interface MigrationRef {
  store: string;
  name: string;
}

/** Outcome of one runMigrations pass. */
export interface RunMigrationsResult {
  /** Migrations applied for the first time this run (in order). */
  applied: MigrationRef[];
  /** Migrations already applied (checksum matched) and skipped as a no-op. */
  skipped: MigrationRef[];
  /** Total migrations considered (applied + skipped) for the selected mode. */
  total: number;
}
