/**
 * Reviewer operations surface (NS-01) — the ops logic behind the dead-letter BFF.
 *
 * A DISTINCT surface from the clinical work queue (goldenThread/workQueue): this
 * is the reliability/ops review of records that fell out of the pipeline, not a
 * second clinical inbox. Three operations:
 *
 *   listOpenItems  — open items by kind/status (default: status 'open').
 *   inspectItem    — one item by id (PHI-safe fields only).
 *   reviewAction   — resolve / dismiss / retry, each audited PHI-safe. `retry`
 *                    re-submits the held/quarantined/failed record through the
 *                    appropriate lane via an injected router, and only marks the
 *                    record 'retried' when the lane accepts it (fail-closed: no
 *                    retry lane -> not marked, the item stays open).
 *
 * Pure over (store, router, clock): no I/O of its own beyond the injected store,
 * so it is fully unit-testable. The route layer supplies the store, the router,
 * and the real audit sink.
 */
import { IDEMPOTENCY_CONSUMERS, type IdempotencyStore } from '@/lib/idempotency';
import {
  isResolutionAction,
  type DeadLetterFilter,
  type DeadLetterKind,
  type DeadLetterRecord,
  type DeadLetterStore,
  type ResolutionAction,
} from '../types';

/** Outcome of a lane re-submission. */
export interface RetryOutcome {
  ok: boolean;
  detail: string;
}

/**
 * How `retry` re-submits a record, per kind. The composition root wires each lane
 * (quarantine/held-identity -> re-run the pipeline for the source batch;
 * failed-outbox -> re-enqueue the intent). A kind with no entry cannot be retried.
 */
export type RetryLaneRouter = Partial<
  Record<DeadLetterKind, (record: DeadLetterRecord) => Promise<RetryOutcome>>
>;

/** A PHI-safe audit descriptor the route hands to the real audit() sink. */
export interface ReviewAuditEntry {
  actor: string;
  action: string; // e.g. 'dead-letter.retry'
  resourceRef: string; // 'DeadLetter/<id>'
  outcome: 'success' | 'failure';
  detail: string; // reason code + kind, never PHI
}

export interface ReviewActionRequest {
  id: string;
  action: ResolutionAction;
  actor: string;
}

export interface ReviewActionResult {
  ok: boolean;
  /** The updated record when the action succeeded. */
  record: DeadLetterRecord | null;
  /** PHI-safe machine reason on failure ('not-found', 'retry-lane-not-configured', ...). */
  reason?: string;
  audit: ReviewAuditEntry;
}

/** Open items (default) or items filtered by kind/status. */
export async function listOpenItems(
  store: DeadLetterStore,
  filter: DeadLetterFilter = {},
): Promise<DeadLetterRecord[]> {
  return store.list({ status: 'open', ...filter });
}

/** One item by id, or null. */
export async function inspectItem(
  store: DeadLetterStore,
  id: string,
): Promise<DeadLetterRecord | null> {
  return store.get(id);
}

function auditFor(
  actor: string,
  action: ResolutionAction,
  id: string,
  outcome: 'success' | 'failure',
  detail: string,
): ReviewAuditEntry {
  return { actor, action: `dead-letter.${action}`, resourceRef: `DeadLetter/${id}`, outcome, detail };
}

/**
 * Resolve / dismiss / retry one item. `retry` routes through the injected lane and
 * only marks the record 'retried' when the lane accepts it.
 *
 * IDEMPOTENCY (register HIGH / R1-DL2): when an `idempotency` store is supplied,
 * the (record-id + action) pair is CLAIMED once before any effect. A double-click
 * or an at-least-once replay of the same command is deduped here — so `retry`
 * cannot re-inject the record into the pipeline/outbox twice, and resolve/dismiss
 * cannot double-transition. In addition, a record already in a TERMINAL status is
 * never re-submitted through a lane (defence-in-depth for a sequential replay,
 * effective even without an idempotency store injected).
 */
export async function reviewAction(
  store: DeadLetterStore,
  req: ReviewActionRequest,
  router: RetryLaneRouter = {},
  idempotency?: IdempotencyStore,
): Promise<ReviewActionResult> {
  const { id, action, actor } = req;
  if (!isResolutionAction(action)) {
    return {
      ok: false,
      record: null,
      reason: 'invalid-action',
      audit: auditFor(actor, action, id, 'failure', `invalid action`),
    };
  }

  const current = await store.get(id);
  if (!current) {
    return {
      ok: false,
      record: null,
      reason: 'not-found',
      audit: auditFor(actor, action, id, 'failure', 'record not found'),
    };
  }

  // Defence-in-depth: a record already resolved/dismissed/retried is never
  // re-submitted through a lane — a sequential replay of `retry` on a closed
  // record must not double-inject. Returns the terminal record, deduped.
  const isTerminal =
    current.status === 'resolved' || current.status === 'dismissed' || current.status === 'retried';
  if (isTerminal) {
    return {
      ok: true,
      record: current,
      reason: 'deduped',
      audit: auditFor(actor, action, id, 'success', `deduped terminal replay; kind=${current.kind}`),
    };
  }

  // Durable claim-once guard (NS-04 primitive reused): the FIRST caller for this
  // (record-id + action) proceeds; a concurrent or replayed duplicate is deduped
  // BEFORE the effect, so retry cannot double-inject across processes.
  if (idempotency) {
    const { firstProcessed } = await idempotency.markProcessed(
      IDEMPOTENCY_CONSUMERS.deadLetterReview,
      `${id}:${action}`,
    );
    if (!firstProcessed) {
      return {
        ok: true,
        record: current,
        reason: 'deduped',
        audit: auditFor(actor, action, id, 'success', `deduped replay; kind=${current.kind}`),
      };
    }
  }

  if (action === 'retry') {
    const lane = router[current.kind];
    if (!lane) {
      return {
        ok: false,
        record: current,
        reason: 'retry-lane-not-configured',
        audit: auditFor(actor, action, id, 'failure', `no retry lane for kind=${current.kind}`),
      };
    }
    const outcome = await lane(current);
    if (!outcome.ok) {
      return {
        ok: false,
        record: current,
        reason: 'retry-lane-rejected',
        audit: auditFor(actor, action, id, 'failure', `kind=${current.kind}; ${outcome.detail}`),
      };
    }
    const updated = await store.resolve(id, 'retry', actor);
    return {
      ok: true,
      record: updated,
      audit: auditFor(actor, action, id, 'success', `kind=${current.kind}; ${outcome.detail}`),
    };
  }

  // resolve | dismiss: a status transition, no lane involved.
  const updated = await store.resolve(id, action, actor);
  return {
    ok: true,
    record: updated,
    audit: auditFor(actor, action, id, 'success', `kind=${current.kind}; reason=${current.reasonCode}`),
  };
}

export {
  setDeadLetterRetryLane,
  getRetryLaneRouter,
  clearDeadLetterRetryLanes,
} from './lanes';
