/**
 * Lifecycle audit — PHI-safe event builders (Wave C).
 *
 * Every lifecycle action (purge, held-back, right-to-delete, legal-hold place /
 * release) emits one of these. The builders here are the only place events are
 * shaped, so the PHI-safe discipline (ids / refs / codes only) is enforced in
 * one spot. Timestamps come from the injected clock via the caller, so audit
 * output is deterministic in tests.
 */
import type {
  LifecycleAuditEvent,
  PurgeSelection,
  RightToDeleteRequest,
} from './types';

/** Audit a record that was actually purged from a mutable store. */
export function auditPurged(sel: PurgeSelection, ts: string, actor: string): LifecycleAuditEvent {
  return {
    ts,
    actor,
    action: 'lifecycle.purge',
    subjectRef: sel.item.subjectRef,
    resourceRef: `${sel.item.store}/${sel.item.id}`,
    policyId: sel.policyId,
    outcome: 'success',
    detail: sel.item.category ? `category=${sel.item.category}` : undefined,
  };
}

/** Audit a record that a policy selected but a legal hold blocked from purge (E9). */
export function auditHeldBack(sel: PurgeSelection, ts: string, actor: string): LifecycleAuditEvent {
  return {
    ts,
    actor,
    action: 'lifecycle.purge.held-back',
    subjectRef: sel.item.subjectRef,
    resourceRef: `${sel.item.store}/${sel.item.id}`,
    policyId: sel.policyId,
    outcome: 'blocked',
    detail: 'legal-hold',
  };
}

/** Audit a completed right-to-delete tombstone on the evidence ledger. */
export function auditRightToDelete(
  req: RightToDeleteRequest,
  ts: string,
  priorVersionCount: number,
): LifecycleAuditEvent {
  return {
    ts,
    actor: req.actor,
    action: 'lifecycle.right-to-delete',
    subjectRef: req.recordId,
    resourceRef: `evidence-ledger/${req.recordId}`,
    policyId: req.policyId,
    outcome: 'success',
    detail: `tombstone appended; basis=${req.legalBasis}; priorVersions=${priorVersionCount}`,
  };
}

/** Audit a right-to-delete that a legal hold blocked (E9: never bypass a hold). */
export function auditRightToDeleteBlocked(
  req: RightToDeleteRequest,
  ts: string,
  reason: 'blocked-legal-hold' | 'not-found' | 'already-tombstoned',
): LifecycleAuditEvent {
  const noop = reason !== 'blocked-legal-hold';
  return {
    ts,
    actor: req.actor,
    action: noop ? 'lifecycle.right-to-delete.noop' : 'lifecycle.right-to-delete.blocked',
    subjectRef: req.recordId,
    resourceRef: `evidence-ledger/${req.recordId}`,
    policyId: req.policyId,
    outcome: noop ? 'noop' : 'blocked',
    detail: reason,
  };
}

/** Audit placing a legal hold. */
export function auditHoldPlaced(
  subjectRef: string,
  holdId: string,
  ts: string,
  actor: string,
): LifecycleAuditEvent {
  return {
    ts,
    actor,
    action: 'lifecycle.legal-hold.place',
    subjectRef,
    resourceRef: `legal-hold/${holdId}`,
    outcome: 'success',
  };
}

/** Audit releasing a legal hold. */
export function auditHoldReleased(
  subjectRef: string,
  holdId: string,
  ts: string,
  actor: string,
): LifecycleAuditEvent {
  return {
    ts,
    actor,
    action: 'lifecycle.legal-hold.release',
    subjectRef,
    resourceRef: `legal-hold/${holdId}`,
    outcome: 'success',
  };
}
