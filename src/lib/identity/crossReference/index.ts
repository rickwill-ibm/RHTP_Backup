// SEAM: crossReference  (dataMode 'crossReference')  // DP-7  // E1
/**
 * Member <-> source-id cross-reference seam (F3) — public surface + mode selector.
 *
 * `getCrossReferenceStore()` resolves the 'crossReference' data mode:
 *   mock / seeded -> the process-global in-memory store (demo stays green, and the
 *                    fragmentation fix works in-process across feeds);
 *   production    -> the Postgres xref table, via a REGISTERED factory.
 *
 * DISPOSITION: fail-closed-stub (matches the dead-letter / idempotency stores). The
 * production backend is registered (not hardcoded) so wiring a real pool stays a
 * composition-root concern and pg-mem tests can register their own. Until one is
 * registered, production mode throws CrossReferenceStoreNotConfiguredError — the
 * standing safe-stub pattern (fail loud, never a silent in-memory Map masquerading
 * as durable). Declared `fail-closed-stub` in seamDispositions.ts (E1).
 */
import { getDataMode } from '@/lib/config/dataMode';
import { defaultCrossReferenceStore } from './memoryCrossReferenceStore';
import type { CrossReferenceStore } from './types';

export class CrossReferenceStoreNotConfiguredError extends Error {
  constructor() {
    super(
      'DATA_MODE crossReference=production: no production cross-reference store is ' +
        'wired yet. Register one with ' +
        'setProductionCrossReferenceStoreFactory(() => createPgCrossReferenceStore(pool)) ' +
        '(SEAM: crossReference) or set DATA_MODE_CROSS_REFERENCE=mock.'
    );
    this.name = 'CrossReferenceStoreNotConfiguredError';
  }
}

let productionFactory: (() => CrossReferenceStore) | null = null;

/** Register (or clear, with null) the production store factory (composition root / tests). */
export function setProductionCrossReferenceStoreFactory(
  factory: (() => CrossReferenceStore) | null
): void {
  productionFactory = factory;
}

/** Resolve the cross-reference store for the configured 'crossReference' data mode. */
export function getCrossReferenceStore(): CrossReferenceStore {
  const mode = getDataMode('crossReference');
  if (mode === 'production') {
    if (!productionFactory) throw new CrossReferenceStoreNotConfiguredError();
    return productionFactory();
  }
  return defaultCrossReferenceStore();
}

export type { XrefLink, XrefLookup, CrossReferenceStore, PgLike, XrefEventDeps } from './types';
export {
  createXrefIndex,
  resolveLookup,
  survivorOf,
  type XrefIndex,
  type XrefReader,
} from './xref';
export {
  createMemoryCrossReferenceStore,
  defaultCrossReferenceStore,
  resetDefaultCrossReferenceStore,
  type MemoryCrossReferenceStore,
} from './memoryCrossReferenceStore';
export {
  createPgCrossReferenceStore,
  ensureCrossReferenceSchema,
  CROSS_REFERENCE_DDL,
} from './pgCrossReferenceStore';
export {
  linkedEvent,
  unlinkedEvent,
  mergedEvent,
  unmergedEvent,
  XREF_LINKED_EVENT,
  XREF_UNLINKED_EVENT,
} from './events';
