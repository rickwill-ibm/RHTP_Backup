/**
 * Evidence ledger composition root (U4 fix).
 *
 * The seam selector (index.ts) resolves `getDataMode('evidence')`; in production
 * it returns the registered production factory or throws
 * EvidenceStoreNotConfiguredError. This module is the composition root that
 * REGISTERS that factory: the real append-only Postgres ledger, its `pg` pool
 * built from env. Registration is lazy — the pool is constructed only when the
 * factory is actually invoked (production mode) — so importing this module never
 * opens a connection and the mock demo never touches `pg`.
 *
 * Fail-loud: if production mode is selected but no connection string is
 * configured, invoking the factory throws EvidenceLedgerConnectionNotConfigured
 * — never a silent fall back to the in-memory Map.
 *
 * Wired at server startup by src/instrumentation.ts (Next.js register hook),
 * guarded so it only runs in the nodejs runtime when evidence=production.
 */
import { Pool } from 'pg';
import { createPgEvidenceLedger } from './pgEvidenceLedger';
import { setProductionEvidenceStoreFactory } from './index';
import type { EvidenceStore } from '../evidenceStore';
import type { PgLike } from './types';

/** Thrown when evidence=production but no ledger connection string is configured. */
export class EvidenceLedgerConnectionNotConfiguredError extends Error {
  constructor() {
    super(
      'DATA_MODE evidence=production: no ledger connection string is configured. ' +
        'Set EVIDENCE_DATABASE_URL (or DATABASE_URL) to the append-only evidence ledger, ' +
        'or set DATA_MODE_EVIDENCE=mock for the in-memory demo store.'
    );
    this.name = 'EvidenceLedgerConnectionNotConfiguredError';
  }
}

/** The evidence ledger connection string, or null when unset. */
export function evidenceLedgerConnectionString(): string | null {
  return process.env.EVIDENCE_DATABASE_URL || process.env.DATABASE_URL || null;
}

// One pool per process (constructed on first production use, then reused).
let pool: Pool | null = null;

function ledgerPool(): PgLike {
  const conn = evidenceLedgerConnectionString();
  if (!conn) throw new EvidenceLedgerConnectionNotConfiguredError();
  if (!pool) pool = new Pool({ connectionString: conn });
  return pool as unknown as PgLike;
}

/**
 * Register the production evidence ledger factory. Lazy: the `pg` pool is built
 * (and a missing connection throws) only when getEvidenceStore() invokes the
 * factory in production mode. Idempotent — safe to call once at startup.
 */
export function registerProductionEvidenceStore(): void {
  setProductionEvidenceStoreFactory((): EvidenceStore => createPgEvidenceLedger(ledgerPool()));
}
