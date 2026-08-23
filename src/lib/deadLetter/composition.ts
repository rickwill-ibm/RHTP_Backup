/**
 * Dead-letter store composition root (NS-01).
 *
 * The seam selector (index.ts) resolves `getDataMode('deadLetterStore')`; in
 * production it returns the registered factory or throws
 * DeadLetterStoreNotConfiguredError. This module REGISTERS that factory: the real
 * append-only Postgres store, its `pg` pool built from env. Registration is lazy
 * — the pool is constructed only when the factory is actually invoked (production
 * mode) — so importing this module never opens a connection and the mock demo
 * never touches `pg`.
 *
 * Fail-loud: if production mode is selected but no connection string is
 * configured, invoking the factory throws DeadLetterConnectionNotConfiguredError
 * — never a silent fall back to the in-memory store.
 */
import { Pool } from 'pg';
import { createPgDeadLetterStore } from './pgDeadLetterStore';
import { setProductionDeadLetterStoreFactory } from './index';
import type { DeadLetterStore, PgLike } from './types';

export class DeadLetterConnectionNotConfiguredError extends Error {
  constructor() {
    super(
      'DATA_MODE deadLetterStore=production: no store connection string is configured. ' +
        'Set DEAD_LETTER_DATABASE_URL (or DATABASE_URL) to the append-only dead-letter store, ' +
        'or set DATA_MODE_DEAD_LETTER_STORE=mock for the in-memory demo store.',
    );
    this.name = 'DeadLetterConnectionNotConfiguredError';
  }
}

export function deadLetterConnectionString(): string | null {
  return process.env.DEAD_LETTER_DATABASE_URL || process.env.DATABASE_URL || null;
}

let pool: Pool | null = null;

function storePool(): PgLike {
  const conn = deadLetterConnectionString();
  if (!conn) throw new DeadLetterConnectionNotConfiguredError();
  if (!pool) pool = new Pool({ connectionString: conn });
  return pool as unknown as PgLike;
}

/**
 * Register the production dead-letter store factory. Lazy: the `pg` pool is built
 * (and a missing connection throws) only when getDeadLetterStore() invokes the
 * factory in production mode. Idempotent — safe to call once at startup.
 */
export function registerProductionDeadLetterStore(): void {
  setProductionDeadLetterStoreFactory((): DeadLetterStore => createPgDeadLetterStore(storePool()));
}
