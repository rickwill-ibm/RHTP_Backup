// CONTRACT: C10  // SEAM: graph  // §4A stage 5
/**
 * The store-agnostic PROJECTOR (plan §4A stage 5: project + propagate, C10).
 *
 * It consumes C2 events (the outbox is the source) and emits the NEUTRAL mutation
 * instruction set — nothing else. There is NO SQL and NO Cypher anywhere in this
 * core; a store adapter renders the instructions later. That separation is what
 * lets the same projection feed two co-equal backends (ADR-001 v12.3).
 *
 * Determinism: the only ambient input is the clock, injected via ProjectorDeps.
 * Given the same events and the same clock, `project` returns byte-identical
 * mutations every time. Because every mutation is an idempotent upsert keyed by
 * business identity, REPLAYING the whole event history rebuilds the identical
 * graph (the rebuild-from-replay proof, DP-1) — order within a member is honored
 * by feeding events in outbox sequence order.
 */
import type { C2Event } from '@/lib/outbox';
import type { Mutation, ProjectorDeps } from './types';
import { mutationsFor } from './mapping';

/**
 * Project a batch of C2 events to a flat, ordered mutation stream. Events should
 * arrive in per-member outbox sequence order; the projector preserves that order
 * so an adapter's `apply` observes causally-correct upserts. Unmapped event types
 * contribute nothing (forward-compatible with events no spec owns yet).
 */
export function project(events: readonly C2Event[], deps: ProjectorDeps): Mutation[] {
  const out: Mutation[] = [];
  for (const event of events) out.push(...mutationsFor(event, deps));
  return out;
}

/** Project a single event (the streaming-consumer entry point). */
export function projectEvent(event: C2Event, deps: ProjectorDeps): Mutation[] {
  return mutationsFor(event, deps);
}
