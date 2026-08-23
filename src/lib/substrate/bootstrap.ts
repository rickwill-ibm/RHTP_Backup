// SEAM: substrate  // I9 substrate  // E1 (fail closed) // E9 (no silent in-memory prod)
/**
 * The substrate bootstrap (Iteration 9, Wave A).
 *
 * ONE entry point that turns a single DATABASE_URL/config into the full set of
 * pg-backed stores, with their schema applied by the unified migration runner.
 *
 * FAIL CLOSED (E9): with no injected `pg` and no connection string (neither
 * `config.databaseUrl` nor `process.env.DATABASE_URL`), bootstrap throws
 * SubstrateNotConfiguredError. It NEVER falls back to an in-memory store — an
 * unconfigured production substrate must fail at startup, not silently serve a
 * volatile Map as if it were durable. The per-seam selectors already fail closed
 * in production mode; this is the composition-root counterpart that refuses to
 * wire anything at all without real persistence.
 *
 * The `pg` pool is only constructed when a connection string is present and no
 * `pg` was injected; pg-mem tests inject `config.pg` so no driver connection is
 * ever opened. Governance is intentionally not wired here (synchronous store
 * contract, memory-only, fail-closed disposition — see sources.ts).
 */
import { Pool } from 'pg';
import { createPgEvidenceLedger } from '@/lib/evidence/store';
import { createPgDeadLetterStore } from '@/lib/deadLetter';
import { createPgIdempotencyStore } from '@/lib/idempotency';
import { createPgOutboxStore } from '@/lib/outbox';
import { createPostgresGraphStore } from '@/lib/graph';
import { createPgCrossReferenceStore } from '@/lib/identity/crossReference';
import type { EvidenceStore } from '@/lib/evidence/evidenceStore';
import type { DeadLetterStore } from '@/lib/deadLetter';
import type { IdempotencyStore } from '@/lib/idempotency';
import type { OutboxStore } from '@/lib/outbox';
import type { GraphStore } from '@/lib/graph';
import type { CrossReferenceStore } from '@/lib/identity/crossReference';
import { runMigrations } from './migrationRunner';
import type { PgLike, RunMigrationsResult } from './types';

/** Thrown when bootstrap is invoked with no persistence configured (fail closed). */
export class SubstrateNotConfiguredError extends Error {
  constructor() {
    super(
      'Substrate not configured: no DATABASE_URL is set and no pg connection was injected. ' +
        'Set DATABASE_URL to the persistence cluster (or pass config.databaseUrl / config.pg), ' +
        'or run the affected seams in mock mode. Refusing to boot a silent in-memory ' +
        'substrate in place of durable persistence (E9, fail closed).',
    );
    this.name = 'SubstrateNotConfiguredError';
  }
}

export interface SubstrateConfig {
  /** Injected query surface — pg-mem tests pass this so no real pool is opened. */
  pg?: PgLike;
  /** Connection string for a real Postgres pool. Falls back to DATABASE_URL env. */
  databaseUrl?: string;
  /**
   * True (default) applies every migration incl. real-Postgres-only triggers.
   * pg-mem callers pass false so the plpgsql `.pg.sql` guards are skipped.
   */
  realPostgres?: boolean;
  /** True (default) runs the migration runner during bootstrap. */
  runMigrations?: boolean;
}

/** The wired set of pg-backed stores over one connection. */
export interface WiredStores {
  evidence: EvidenceStore;
  deadLetter: DeadLetterStore;
  idempotency: IdempotencyStore;
  outbox: OutboxStore;
  graph: GraphStore;
  crossReference: CrossReferenceStore;
}

/** The fully bootstrapped substrate: the connection, migration result, wired stores. */
export interface WiredSubstrate {
  pg: PgLike;
  migrations: RunMigrationsResult | null;
  stores: WiredStores;
}

/**
 * The connection string from config, then env DATABASE_URL, else null.
 *
 * E9 (fail closed on empty): a present-but-blank value (unset, '', or whitespace)
 * resolves to null, never a truthy connection string. Without this, a blank
 * DATABASE_URL would be treated as configured and bootstrap would open a Pool on
 * a garbage connection string instead of failing closed — the same "'' is not
 * configured" rule env.ts/deploymentValue() already enforce, applied here so the
 * substrate and the deploy preflight agree on what "configured" means.
 */
export function substrateConnectionString(config: SubstrateConfig = {}): string | null {
  const raw = config.databaseUrl ?? process.env.DATABASE_URL ?? null;
  if (raw === null) return null;
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/** Wire every pg-backed store over one connection. Governance is excluded (see file header). */
function wireStores(pg: PgLike): WiredStores {
  return {
    evidence: createPgEvidenceLedger(pg),
    deadLetter: createPgDeadLetterStore(pg),
    idempotency: createPgIdempotencyStore(pg),
    outbox: createPgOutboxStore(pg),
    graph: createPostgresGraphStore(pg),
    crossReference: createPgCrossReferenceStore(pg),
  };
}

/**
 * Bootstrap the substrate. Resolves a connection (injected pg > databaseUrl >
 * DATABASE_URL), fails closed when none is present, runs migrations, and returns
 * the wired stores. Idempotent at the schema level (the runner is a no-op on a
 * migrated database).
 */
export async function bootstrapSubstrate(config: SubstrateConfig = {}): Promise<WiredSubstrate> {
  let pg = config.pg ?? null;
  if (!pg) {
    const conn = substrateConnectionString(config);
    if (!conn) throw new SubstrateNotConfiguredError();
    pg = new Pool({ connectionString: conn }) as unknown as PgLike;
  }

  const realPostgres = config.realPostgres ?? true;
  const migrations =
    (config.runMigrations ?? true) ? await runMigrations(pg, { realPostgres }) : null;

  return { pg, migrations, stores: wireStores(pg) };
}
