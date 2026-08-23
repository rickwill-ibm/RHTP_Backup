// SEAM: idempotency-store
/**
 * In-memory IdempotencyStore — the mock mode of the idempotency seam (a mode,
 * not a stub: same contract as the pg store, so a swap that passes is safe).
 *
 * The demo/default instance is process-global (see index.ts), so a republish in
 * the same process IS deduped across calls — the property the old per-call `Set`
 * lacked. Concurrency note: JavaScript is single-threaded, so the read-then-write
 * in `markProcessed` runs with NO await between the check and the set. That makes
 * it the atomic compare-and-set the pg store gets from ON CONFLICT DO NOTHING —
 * two overlapping `markProcessed` calls for the same pair cannot both observe it
 * absent. (Real cross-PROCESS concurrency needs the pg store; the Docker-guarded
 * testcontainer spec exercises that, and FAKE_FIDELITY records the gap.)
 */
import type { IdempotencyStore, MarkResult } from './types';

/** Namespace key: consumer + eventId, joined on a control char neither can hold. */
function key(consumer: string, eventId: string): string {
  return `${consumer}\u0000${eventId}`;
}

export function createMemoryIdempotencyStore(id = 'mock-idempotency'): IdempotencyStore {
  const processed = new Set<string>();
  return {
    id,
    async markProcessed(consumer, eventId): Promise<MarkResult> {
      const k = key(consumer, eventId);
      // Check-and-set with no await between read and write: atomic in the JS
      // single-writer model, mirroring the pg INSERT ... ON CONFLICT DO NOTHING.
      if (processed.has(k)) return { firstProcessed: false };
      processed.add(k);
      return { firstProcessed: true };
    },
    async isProcessed(consumer, eventId): Promise<boolean> {
      return processed.has(key(consumer, eventId));
    },
  };
}
