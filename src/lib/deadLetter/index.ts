/**
 * Dead-letter store seam (NS-01) — public surface + mode selector.
 *
 * `getDeadLetterStore()` resolves the 'deadLetterStore' data mode from the
 * registry:
 *   mock / seeded -> the in-memory append-only store (demo stays green by default);
 *   production    -> the Postgres append-only store, via a registered factory.
 *
 * DISPOSITION: fail-closed-stub (matches the evidence ledger). The production
 * backend is registered (not hardcoded) so wiring a real pool stays a
 * composition-root concern and pg-mem tests can register their own. Until one is
 * registered, production mode throws DeadLetterStoreNotConfiguredError — the
 * fail-loud, never-a-silent-missing-backend pattern.
 */
import { getDataMode } from '@/lib/config/dataMode';
import { defaultDeadLetterStore } from './memoryDeadLetterStore';
import type { DeadLetterStore } from './types';

export class DeadLetterStoreNotConfiguredError extends Error {
  constructor() {
    super(
      'DATA_MODE deadLetterStore=production: no production dead-letter store is wired yet. ' +
        'Register one with setProductionDeadLetterStoreFactory(() => createPgDeadLetterStore(pool)) ' +
        '(SEAM: dead-letter-store) or set DATA_MODE_DEAD_LETTER_STORE=mock.',
    );
    this.name = 'DeadLetterStoreNotConfiguredError';
  }
}

let productionFactory: (() => DeadLetterStore) | null = null;

/** Register the production store factory (composition root / tests). */
export function setProductionDeadLetterStoreFactory(factory: (() => DeadLetterStore) | null): void {
  productionFactory = factory;
}

/** Resolve the dead-letter store for the configured mode. SEAM: dead-letter-store. */
export function getDeadLetterStore(): DeadLetterStore {
  const mode = getDataMode('deadLetterStore');
  if (mode === 'production') {
    if (!productionFactory) throw new DeadLetterStoreNotConfiguredError();
    return productionFactory();
  }
  // 'mock' and 'seeded' both serve the in-memory default.
  return defaultDeadLetterStore();
}

export {
  DEAD_LETTER_KINDS,
  DEAD_LETTER_STATUSES,
  RESOLUTION_ACTIONS,
  STATUS_FOR_ACTION,
  isDeadLetterKind,
  isDeadLetterStatus,
  isResolutionAction,
  deadLetterIdFor,
  type DeadLetterKind,
  type DeadLetterStatus,
  type ResolutionAction,
  type DeadLetterRecord,
  type DeadLetterAppendInput,
  type DeadLetterFilter,
  type DeadLetterStore,
  type PgLike,
} from './types';

export {
  createMemoryDeadLetterStore,
  defaultDeadLetterStore,
  resetDefaultDeadLetterStore,
  type MemoryDeadLetterStore,
} from './memoryDeadLetterStore';

export { createPgDeadLetterStore } from './pgDeadLetterStore';
export { applyMigrations, migrationFiles, readMigration } from './schema';
export {
  assertDeadLetterPhiSafe,
  persistPipelineDeadLetters,
  deadLetterQuarantineSink,
  type PipelineDeadLetterInput,
} from './persist';
// composition.ts (production pg wiring) imports from THIS module, so it is a leaf:
// import it directly from '@/lib/deadLetter/composition' (keeps `pg` out of the
// seam selector's import graph).
