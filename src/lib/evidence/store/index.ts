/**
 * Evidence store seam (O-1, ADR-005) — public surface + mode selector.
 *
 * `getEvidenceStore()` resolves the 'evidence' data mode from the registry:
 *   mock / seeded -> the existing in-memory store (demo stays green by default);
 *   production    -> the Postgres append-only ledger, via a registered factory.
 *
 * Callers now route through this selector (U4 fix): the evidence route handlers
 * (`api/evidence/[id]`, `api/financial-clearance`, `api/work-queue`) call
 * `getEvidenceStore()`, so `DATA_MODE_EVIDENCE=production` is honored end-to-end.
 * In mock mode it returns the very same default in-memory instance the callers
 * used before, so the demo is byte-identical; in production it selects the
 * registered Postgres ledger (composition.ts) and fails loud if unconfigured.
 *
 * The production factory is registered (not hardcoded) so wiring a real pool
 * stays a composition-root concern and pg-mem tests can register their own. Until
 * one is registered, production mode throws EvidenceStoreNotConfiguredError — the
 * BackboneNotConfigured pattern (fail loud, never a silent missing backend).
 */
import { getDataMode } from '@/lib/config/dataMode';
import { defaultEvidenceStore, type EvidenceStore } from '../evidenceStore';

export class EvidenceStoreNotConfiguredError extends Error {
  constructor() {
    super(
      'DATA_MODE evidence=production: no production evidence ledger is wired yet. ' +
        'Register one with setProductionEvidenceStoreFactory(() => createPgEvidenceLedger(pool)) ' +
        '(SEAM: evidence-store) or set DATA_MODE_EVIDENCE=mock.'
    );
    this.name = 'EvidenceStoreNotConfiguredError';
  }
}

let productionFactory: (() => EvidenceStore) | null = null;

/** Register the production ledger factory (composition root / tests). */
export function setProductionEvidenceStoreFactory(factory: (() => EvidenceStore) | null): void {
  productionFactory = factory;
}

/** Resolve the evidence store for the configured 'evidence' data mode. SEAM: evidence-store. */
export function getEvidenceStore(): EvidenceStore {
  const mode = getDataMode('evidence');
  if (mode === 'production') {
    if (!productionFactory) throw new EvidenceStoreNotConfiguredError();
    return productionFactory();
  }
  // 'mock' and 'seeded' both serve the in-memory default (no seed file yet).
  return defaultEvidenceStore();
}

export { applyMigrations, migrationFiles, readMigration } from './schema';
export { createPgEvidenceLedger, type PgEvidenceLedger } from './pgEvidenceLedger';
// composition.ts (the production pg wiring) imports from THIS module, so it is a
// leaf: import it directly from '@/lib/evidence/store/composition', not re-exported
// here (avoids a module cycle and keeps `pg` out of the seam-selector's import).
export type {
  PgLike,
  PgQueryResult,
  LedgerEntry,
  LedgerProvenance,
  PgEvidenceLedgerOptions,
} from './types';
