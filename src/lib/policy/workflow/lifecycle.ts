/**
 * Policy authoring lifecycle — the pure state machine behind the policy queue.
 *
 * States: uploaded → extracting → in-review → ready-for-approval → approved → published,
 * with rejected / needs-info as off-ramps. Enforces MAKER/CHECKER separation: the reviewer who
 * submits for approval (maker) may not approve it (a different checker must). Pure and deterministic
 * — the queue UI and the evidence ledger persist transitions; this module only decides legality.
 */
export type PolicyStatus =
  | 'uploaded'
  | 'extracting'
  | 'in-review'
  | 'ready-for-approval'
  | 'approved'
  | 'published'
  | 'rejected'
  | 'needs-info';

export type Actor = 'system' | 'maker' | 'checker';

interface TransitionRule {
  to: PolicyStatus;
  by: Actor;
}

const TRANSITIONS: Record<PolicyStatus, TransitionRule[]> = {
  uploaded: [{ to: 'extracting', by: 'system' }],
  extracting: [
    { to: 'in-review', by: 'system' },
    { to: 'needs-info', by: 'system' },
  ],
  'in-review': [
    { to: 'ready-for-approval', by: 'maker' },
    { to: 'needs-info', by: 'maker' },
  ],
  'ready-for-approval': [
    { to: 'approved', by: 'checker' },
    { to: 'rejected', by: 'checker' },
    { to: 'in-review', by: 'checker' }, // send back
  ],
  approved: [{ to: 'published', by: 'system' }],
  published: [],
  rejected: [{ to: 'in-review', by: 'maker' }],
  'needs-info': [{ to: 'in-review', by: 'maker' }],
};

export interface PolicyWorkflowRecord {
  policyId: string;
  status: PolicyStatus;
  /** Reviewer reference (never a free-text name) who submitted for approval, if any. */
  submittedBy?: string;
  /** Approver reference, if approved. */
  approvedBy?: string;
}

/** The statuses reachable from `status`, with the actor allowed to make each move. Unknown status
 *  (bad persisted data) degrades to no transitions rather than crashing. */
export function nextStatuses(status: PolicyStatus): TransitionRule[] {
  return TRANSITIONS[status] ?? [];
}

/** Whether `actor` may move a record from its current status to `to`. */
export function canTransition(from: PolicyStatus, to: PolicyStatus, actor: Actor): boolean {
  return (TRANSITIONS[from] ?? []).some((r) => r.to === to && r.by === actor);
}

export class TransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransitionError';
  }
}

/**
 * Apply a transition, enforcing legality AND maker/checker separation. `actorRef` is the identity
 * making the move (a Practitioner reference). Returns a new record; throws TransitionError on an
 * illegal move or a maker/checker violation (a checker approving their own submission).
 */
export function applyTransition(
  record: PolicyWorkflowRecord,
  to: PolicyStatus,
  actor: Actor,
  actorRef: string
): PolicyWorkflowRecord {
  if (!canTransition(record.status, to, actor)) {
    throw new TransitionError(`illegal transition ${record.status} → ${to} by ${actor}`);
  }
  // Maker/checker separation FAILS CLOSED: approval requires a known submitter that differs from
  // the approver. A record with no submitter cannot be verified, so it is refused (never fail-open).
  if (to === 'approved') {
    if (!record.submittedBy) {
      throw new TransitionError(
        'cannot verify maker/checker separation: no submitter recorded on this policy'
      );
    }
    if (record.submittedBy === actorRef) {
      throw new TransitionError(
        'maker/checker violation: the approver must differ from the submitter'
      );
    }
  }
  const next: PolicyWorkflowRecord = { ...record, status: to };
  if (to === 'ready-for-approval') next.submittedBy = actorRef;
  if (to === 'approved') next.approvedBy = actorRef;
  return next;
}

const TERMINAL: ReadonlySet<PolicyStatus> = new Set(['published']);
export function isTerminal(status: PolicyStatus): boolean {
  return TERMINAL.has(status);
}
