/**
 * Value-set version lifecycle — the guarded state machine (I8A-iii Wave A).
 *
 * The ONLY legal state changes are the edges in TRANSITIONS. Any other (state,
 * action) pair throws IllegalTransitionError — an illegal transition is a fault,
 * never a silent no-op. E9 lives here structurally: the sole edge into `approved`
 * is `in-review --approve--> approved`, so a `draft` cannot jump to active and a
 * `rejected` version (terminal) can never become active.
 */
import { IllegalTransitionError, type GovernanceAction, type VersionLifecycleState } from './types';

/**
 * The lifecycle graph. Terminal states (`rejected`, `retired`, `superseded`) have
 * no outgoing edges. `approved` is the active state; only one version per value
 * set holds it at a time (the service enforces that by superseding the prior one).
 */
const TRANSITIONS: Readonly<
  Record<VersionLifecycleState, Readonly<Partial<Record<GovernanceAction, VersionLifecycleState>>>>
> = Object.freeze({
  draft: Object.freeze({ submit: 'in-review', retire: 'retired' }),
  'in-review': Object.freeze({ approve: 'approved', reject: 'rejected' }),
  approved: Object.freeze({ retire: 'retired', supersede: 'superseded' }),
  rejected: Object.freeze({}),
  retired: Object.freeze({}),
  superseded: Object.freeze({}),
});

/** The actions permitted from a state (empty for terminal states). */
export function allowedActions(from: VersionLifecycleState): GovernanceAction[] {
  return Object.keys(TRANSITIONS[from]) as GovernanceAction[];
}

/** True when `action` is a legal edge out of `from`. */
export function canTransition(from: VersionLifecycleState, action: GovernanceAction): boolean {
  return TRANSITIONS[from][action] !== undefined;
}

/**
 * The state reached by applying `action` in state `from`. Throws
 * IllegalTransitionError when the edge does not exist (guarded transition).
 */
export function nextState(
  from: VersionLifecycleState,
  action: GovernanceAction
): VersionLifecycleState {
  const to = TRANSITIONS[from][action];
  if (to === undefined) throw new IllegalTransitionError(from, action);
  return to;
}

/** True for a terminal state (no outgoing transitions). */
export function isTerminal(state: VersionLifecycleState): boolean {
  return allowedActions(state).length === 0;
}
