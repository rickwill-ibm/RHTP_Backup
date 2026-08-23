// SEAM: idempotency-store  (dataMode 'idempotencyStore')
/**
 * Durable idempotency store seam (NS-04) — public surface + mode selector.
 *
 * `getIdempotencyStore()` resolves the 'idempotencyStore' data mode:
 *   mock / seeded -> a process-global in-memory store (demo stays green, and a
 *                    same-process republish is deduped across calls);
 *   production    -> the Postgres marker table, via a REGISTERED factory.
 *
 * The production factory is registered (not hardcoded) so wiring a real pool
 * stays a composition-root concern and pg-mem tests can register their own.
 * Until one is registered, production mode throws
 * IdempotencyStoreNotConfiguredError — the standing safe-stub pattern (fail loud,
 * never a silent in-memory Map masquerading as durable dedupe). Disposition is
 * declared `fail-closed-stub` in seamDispositions.ts (E1).
 */
import { getDataMode } from '@/lib/config/dataMode';
import { createMemoryIdempotencyStore } from './memoryIdempotencyStore';
import type { IdempotencyStore } from './types';

export class IdempotencyStoreNotConfiguredError extends Error {
  constructor() {
    super(
      'DATA_MODE idempotencyStore=production: no production idempotency store is ' +
        'wired yet. Register one with ' +
        'setProductionIdempotencyStoreFactory(() => createPgIdempotencyStore(pool)) ' +
        '(SEAM: idempotency-store) or set DATA_MODE_IDEMPOTENCY_STORE=mock.',
    );
    this.name = 'IdempotencyStoreNotConfiguredError';
  }
}

let productionFactory: (() => IdempotencyStore) | null = null;

/** Register the production store factory (composition root / tests). */
export function setProductionIdempotencyStoreFactory(
  factory: (() => IdempotencyStore) | null,
): void {
  productionFactory = factory;
}

// One process-global in-memory instance for mock/seeded, so cross-call dedupe
// (the republish case) works within a process. A fresh instance per call would
// re-lose the marker exactly as the old per-call Set did.
let defaultStore: IdempotencyStore | null = null;

/** The shared in-memory store used in mock/seeded mode. */
export function defaultIdempotencyStore(): IdempotencyStore {
  if (!defaultStore) defaultStore = createMemoryIdempotencyStore('mock-idempotency-default');
  return defaultStore;
}

/** Reset the shared in-memory store (tests only — clears all markers). */
export function resetDefaultIdempotencyStore(): void {
  defaultStore = null;
}

/** Resolve the idempotency store for the configured 'idempotencyStore' data mode. */
export function getIdempotencyStore(): IdempotencyStore {
  const mode = getDataMode('idempotencyStore');
  if (mode === 'production') {
    if (!productionFactory) throw new IdempotencyStoreNotConfiguredError();
    return productionFactory();
  }
  return defaultIdempotencyStore();
}

export type { IdempotencyStore, MarkResult, PgQueryable } from './types';
export { createMemoryIdempotencyStore } from './memoryIdempotencyStore';
export {
  createPgIdempotencyStore,
  ensureIdempotencySchema,
  IDEMPOTENCY_DDL,
  type PgIdempotencyOptions,
} from './pgIdempotencyStore';

/** Stable consumer namespace ids (one per independent deduping consumer). */
export const IDEMPOTENCY_CONSUMERS = Object.freeze({
  sdeIntake: 'sde-intake',
  outreachAgent: 'outreach-agent',
  referralAgent: 'referral-coordination-agent',
  /**
   * The dead-letter reviewer surface. A retry/resolve/dismiss is claimed once
   * per (record-id + action) so a double-clicked or replayed review command does
   * not double-inject (retry re-submitting into the pipeline/outbox) or
   * double-transition a record.
   */
  deadLetterReview: 'dead-letter-review',
} as const);
