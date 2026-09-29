/**
 * Prior-Authorization lifecycle state machine (plan Slice 4 / blueprint §6.4).
 *
 * Pure + deterministic. The LLM/agent NEVER sets Approved/Denied — those come
 * only from a payer `ClaimResponse` (event 'claim-response'). Submission and
 * gap closure are HUMAN-GATED (see requiresHumanApproval).
 */

export type PaState =
  | 'Draft'
  | 'CRD'
  | 'NoAuthRequired'
  | 'RequirementsKnown'
  | 'DTR'
  | 'Prepopulated'
  | 'EvidenceComplete'
  | 'Submitted'
  | 'Pending'
  | 'Approved'
  | 'Denied'
  | 'MoreInfo'
  | 'AppealOrReview'
  | 'GapClosed';

export type PaEvent =
  | { type: 'order-created' }
  | { type: 'crd-none' }
  | { type: 'crd-required' }
  | { type: 'launch-dtr' }
  | { type: 'prepopulated' }
  | { type: 'evidence-complete' }
  | { type: 'submit'; approvedBy?: string } // HUMAN-GATED
  | { type: 'acknowledged' }
  | { type: 'claim-response'; decision: 'approved' | 'denied' | 'more-info'; reasons?: string[] }
  | { type: 'resubmit' }
  | { type: 'close-gap'; approvedBy?: string } // HUMAN-GATED
  | { type: 'appeal' };

/**
 * The closed PA vocabularies, DERIVED from their unions — the same discipline as
 * `AGENT_TASK_KINDS`. `Record<PaState, true>` / `Record<PaEvent['type'], true>` are
 * exhaustive, so a state or event added to a union without a key here fails
 * `tsc --noEmit` ON THAT LITERAL.
 *
 * WHY THEY EXIST. A route's `pa` template was authored as free strings and cast into
 * these unions unchecked (`routingSchema.ts`: `o.pa as AgentRoute['pa']`). Author
 * `"currentState": "denied"` (lower-case d) and: `tsc` is clean, `adl:check` is
 * byte-identical, `parseAgentRouting` accepts it — and at runtime `transition()` returns
 * an `error` WITHOUT THROWING, so the PA thread silently does not advance while the
 * audited row reads `executed`. A soft-failing consumer is exactly why the authoring
 * layer has to be the one that refuses.
 */
const PA_STATE_SET: Record<PaState, true> = {
  Draft: true,
  CRD: true,
  NoAuthRequired: true,
  RequirementsKnown: true,
  DTR: true,
  Prepopulated: true,
  EvidenceComplete: true,
  Submitted: true,
  Pending: true,
  Approved: true,
  Denied: true,
  MoreInfo: true,
  AppealOrReview: true,
  GapClosed: true,
};

const PA_EVENT_TYPE_SET: Record<PaEvent['type'], true> = {
  'order-created': true,
  'crd-none': true,
  'crd-required': true,
  'launch-dtr': true,
  prepopulated: true,
  'evidence-complete': true,
  submit: true,
  acknowledged: true,
  'claim-response': true,
  resubmit: true,
  'close-gap': true,
  appeal: true,
};

/** Every legal PA state, for membership tests in hand validators. */
export const PA_STATES: readonly string[] = Object.keys(PA_STATE_SET);

/** Every legal PA event type, for membership tests in hand validators. */
export const PA_EVENT_TYPES: readonly string[] = Object.keys(PA_EVENT_TYPE_SET);

/** Narrow an untrusted string to `PaState`. */
export function isPaState(v: unknown): v is PaState {
  return typeof v === 'string' && PA_STATES.includes(v);
}

/** Narrow an untrusted string to a legal `PaEvent['type']`. */
export function isPaEventType(v: unknown): v is PaEvent['type'] {
  return typeof v === 'string' && PA_EVENT_TYPES.includes(v);
}

export interface PaContext {
  priority: 'expedited' | 'standard';
  denialReasons?: string[];
}

export interface PaTransition {
  state: PaState;
  context: PaContext;
  error?: string;
}

/** SLA in hours per CMS-0057-F operational provisions (2026). */
export function slaHours(priority: PaContext['priority']): number {
  return priority === 'expedited' ? 72 : 24 * 7;
}

/** Events that must not fire without a human approver (blueprint §4D). */
export function requiresHumanApproval(event: PaEvent): boolean {
  return event.type === 'submit' || event.type === 'close-gap';
}

const TABLE: Partial<Record<PaState, Partial<Record<PaEvent['type'], PaState>>>> = {
  Draft: { 'order-created': 'CRD' },
  CRD: { 'crd-none': 'NoAuthRequired', 'crd-required': 'RequirementsKnown' },
  RequirementsKnown: { 'launch-dtr': 'DTR' },
  DTR: { prepopulated: 'Prepopulated' },
  Prepopulated: { 'evidence-complete': 'EvidenceComplete' },
  EvidenceComplete: { submit: 'Submitted' },
  Submitted: { acknowledged: 'Pending' },
  Pending: { 'claim-response': 'Pending' }, // resolved below by decision
  MoreInfo: { resubmit: 'Submitted' },
  Approved: { 'close-gap': 'GapClosed' },
  Denied: { appeal: 'AppealOrReview' },
  NoAuthRequired: { 'close-gap': 'GapClosed' },
};

export function transition(current: PaState, event: PaEvent, context: PaContext): PaTransition {
  // Human-gate enforcement.
  if (requiresHumanApproval(event) && !('approvedBy' in event && event.approvedBy)) {
    return { state: current, context, error: `${event.type} requires human approval (approvedBy)` };
  }

  // ClaimResponse resolves Pending by decision.
  if (current === 'Pending' && event.type === 'claim-response') {
    if (event.decision === 'approved') return { state: 'Approved', context };
    if (event.decision === 'denied')
      return { state: 'Denied', context: { ...context, denialReasons: event.reasons ?? [] } };
    return { state: 'MoreInfo', context };
  }

  const next = TABLE[current]?.[event.type];
  if (!next) {
    return { state: current, context, error: `illegal transition: ${event.type} from ${current}` };
  }
  return { state: next, context };
}

export const INITIAL: PaState = 'Draft';
