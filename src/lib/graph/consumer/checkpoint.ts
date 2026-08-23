/**
 * Projection checkpoint store (HW1 / I14, REC-01).
 *
 * The outbox->projector consumer must be RESUMABLE and must never reprocess an
 * event it already applied. It tracks a per-member high-water mark: the last
 * outbox `sequence` applied to the graph for that member. Because every graph
 * mutation is an idempotent upsert, a checkpoint that is slightly behind is safe
 * (it re-applies, same result); a checkpoint ahead would skip, so we only ever
 * advance it AFTER a successful apply.
 *
 * In-memory default (mock/demo, zero backend); a durable factory can be injected
 * for production (pg), mirroring the evidence/dead-letter/idempotency store pattern.
 * Fail-closed: production with no durable factory registered THROWS rather than
 * silently using a process-local Map as if it were durable.
 */

export interface ProjectionCheckpointStore {
  readonly id: string;
  /** The last applied outbox sequence for a member (-1 if none applied yet). */
  highWater(memberId: string): Promise<number>;
  /** Advance the high-water mark AFTER a successful apply (monotonic; never regresses). */
  advance(memberId: string, sequence: number): Promise<void>;
  /** Snapshot of all member high-water marks (ops/inspection). */
  snapshot(): Promise<Record<string, number>>;
}

/** Process-local in-memory checkpoint — the demo/mock default (no backend). */
export function createMemoryCheckpointStore(id = 'mock-projection-checkpoint'): ProjectionCheckpointStore {
  const marks = new Map<string, number>();
  return {
    id,
    async highWater(memberId) {
      return marks.has(memberId) ? (marks.get(memberId) as number) : -1;
    },
    async advance(memberId, sequence) {
      const cur = marks.get(memberId) ?? -1;
      if (sequence > cur) marks.set(memberId, sequence);
    },
    async snapshot() {
      return Object.fromEntries(marks.entries());
    },
  };
}

export class ProjectionCheckpointNotConfiguredError extends Error {
  constructor() {
    super('projectionCheckpoint=production but no durable checkpoint factory is registered (fail-closed)');
    this.name = 'ProjectionCheckpointNotConfiguredError';
  }
}

let productionFactory: (() => ProjectionCheckpointStore) | null = null;

/** Register (or clear with null) the durable production checkpoint factory. */
export function setProductionCheckpointFactory(factory: (() => ProjectionCheckpointStore) | null): void {
  productionFactory = factory;
}

/**
 * Resolve the checkpoint store for the consumer. `durable=false` (mock/seeded) →
 * the in-memory default; `durable=true` (production) → the registered factory, or
 * THROW (never a silent in-memory Map presented as durable).
 */
export function getProjectionCheckpointStore(durable: boolean): ProjectionCheckpointStore {
  if (!durable) return createMemoryCheckpointStore();
  if (!productionFactory) throw new ProjectionCheckpointNotConfiguredError();
  return productionFactory();
}
