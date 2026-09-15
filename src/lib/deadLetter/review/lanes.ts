/**
 * Retry-lane registry (NS-01) — the composition seam for `retry` re-submission.
 *
 * `reviewAction(store, req, router)` re-submits a retried record through a lane
 * chosen by kind. WHICH lane runs is a composition concern: re-running the
 * pipeline for a quarantined/held source batch, or re-enqueueing a failed-outbox
 * intent, needs the production pipeline/outbox wiring, which is bound at the
 * composition root. This registry lets that root register a lane per kind without
 * the review logic or the BFF importing the heavy machinery.
 *
 * FAIL-CLOSED: until a lane is registered for a kind, retry over that kind returns
 * 'retry-lane-not-configured' (the review layer does NOT mark the record retried).
 * The lane MECHANISM is fully built and unit-tested with a fake lane; only the
 * production re-submission binding is deferred.
 */
import type { DeadLetterKind, DeadLetterRecord } from '../types';
import type { RetryLaneRouter, RetryOutcome } from './index';

const lanes: Map<DeadLetterKind, (record: DeadLetterRecord) => Promise<RetryOutcome>> = new Map();

/** Register (or clear, with null) the retry lane for one kind. */
export function setDeadLetterRetryLane(
  kind: DeadLetterKind,
  lane: ((record: DeadLetterRecord) => Promise<RetryOutcome>) | null
): void {
  if (lane === null) lanes.delete(kind);
  else lanes.set(kind, lane);
}

/** Snapshot the registered lanes as a router for reviewAction. */
export function getRetryLaneRouter(): RetryLaneRouter {
  const router: RetryLaneRouter = {};
  for (const [kind, lane] of lanes) router[kind] = lane;
  return router;
}

/** Test seam: clear every registered lane. */
export function clearDeadLetterRetryLanes(): void {
  lanes.clear();
}
