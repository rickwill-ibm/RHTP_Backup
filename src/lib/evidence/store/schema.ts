/**
 * Evidence ledger — migration loader/applier (O-1).
 *
 * Migrations live as versioned SQL files under ./migrations. Files are applied
 * in filename order. A `.pg.sql` suffix marks a migration as real-Postgres-only
 * (plpgsql the pg-mem parser cannot handle); pass `{ realPostgres: false }` to
 * skip those under pg-mem while still applying the portable core schema.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { PgLike } from './types';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/** Real-Postgres-only migrations carry this suffix. */
const PG_ONLY_SUFFIX = '.pg.sql';

export interface ApplyMigrationsOptions {
  /**
   * True (default) applies every migration, including real-Postgres-only ones.
   * False skips `.pg.sql` files — the mode pg-mem tests run in.
   */
  realPostgres?: boolean;
}

/** Ordered list of migration filenames (portable first, `.pg.sql` still in order). */
export async function migrationFiles(): Promise<string[]> {
  const names = await fs.readdir(MIGRATIONS_DIR);
  return names.filter((n) => n.endsWith('.sql')).sort();
}

/** Read one migration's SQL by filename. */
export async function readMigration(name: string): Promise<string> {
  return fs.readFile(path.join(MIGRATIONS_DIR, name), 'utf8');
}

/**
 * Apply all migrations in order. Idempotent: every statement uses IF NOT EXISTS
 * / CREATE OR REPLACE, so re-applying is a no-op. Returns the names applied.
 */
export async function applyMigrations(
  pg: PgLike,
  opts: ApplyMigrationsOptions = {}
): Promise<string[]> {
  const realPostgres = opts.realPostgres ?? true;
  const files = await migrationFiles();
  const applied: string[] = [];
  for (const name of files) {
    if (!realPostgres && name.endsWith(PG_ONLY_SUFFIX)) continue;
    await pg.query(await readMigration(name));
    applied.push(name);
  }
  return applied;
}
