// CONTRACT: C-DISCLOSURE
/**
 * Dispatch inputs, refusals, and the per-kind task builders.
 *
 * Split out of `dispatcher.ts` by responsibility (conventions §2): the dispatcher
 * decides WHICH route wins and drives the loop; this module holds the input
 * contract, the refusal record, and the construction of one concrete task once a
 * route has matched and the disclosure plane has spoken.
 *
 * INVARIANT: no task is constructed for an intent the disclosure plane refused,
 *            and no outreach task is constructed without a named consent scope.
 * INVARIANT: no task is constructed carrying a synthesised resource reference —
 *            a signal with no referral/claim/thread ref is REFUSED, never handed
 *            its own signalId in a field an agent will resolve as FHIR.
 * INVARIANT: task construction is TOTAL over `AgentTaskKind`. A kind with no
 *            builder refuses with a coded error; nothing falls through to another
 *            kind's builder.
 */
import type { DisclosureDecision } from '@/lib/agents/disclosure';
import type { DispositionBatch, MemberContext, Signal, Touchpoint } from '@/lib/sde';
import type { ReferralState } from '@/lib/agents/referral';
import type { PaContext } from '@/lib/workflow/paMachine';
import {
  AgentRoutingError,
  type AgentRoute,
  type AgentRouting,
  type DispatchedTask,
} from './types';
import type { DisclosureGateDeps } from './disclosureGate';
import { decideTouchpointDisclosure } from './touchpointDisclosure';

/** Input to the pure router: the SDE batch + the signals + member context. */
export interface DispatchInput {
  batch: DispositionBatch;
  memberContext: MemberContext;
  signals: Signal[];
  routing?: AgentRouting;
  /**
   * The disclosure gate. Every routed signal is decided before it reaches an
   * agent, and refusals are returned rather than silently dropped.
   *
   * REQUIRED, deliberately. It was optional "for pure unit tests and surfaces that
   * carry no Part 2 material", and the router then held `if (!gate) return true` —
   * a total bypass of the disclosure plane, exported from the public barrel and
   * documented in the README with no disclosure argument. Routing a signal to an
   * agent IS a disclosure, so no dispatch path exists that does not need deciding,
   * and a dispatch that produces no ledger row cannot be evidenced afterwards.
   */
  disclosure: DisclosureGateDeps;
}

/** Why a signal was not dispatched. A code, so refusals are countable. */
export type DispatchRefusalReason =
  /** The disclosure plane denied it; `decision` carries the regime and the reason. */
  | 'disclosure-denied'
  /** An intent referenced a signal the batch does not contain — undecidable. */
  | 'signal-unreadable'
  /** The surviving opener named no consent scope, so no contact can be authorised. */
  | 'consent-scope-absent'
  /**
   * No routing rule matched the signal, so no agent was ever selected. A bare
   * `continue` dropped these: the platform received the signal, did nothing, and
   * left no trace of either fact on any surface.
   */
  | 'no-route'
  /** A referral route matched but the signal carries no referral reference. */
  | 'referral-ref-absent'
  /** A PA route matched but the signal carries neither a claim nor a thread ref. */
  | 'thread-ref-absent'
  /**
   * An SDE-COMPOSED TOUCHPOINT whose opener routes to a non-outreach agent, and
   * whose opener carries no approved disposition — so the disposition loop never
   * reaches it either, and the touchpoint is dispatched by nobody.
   *
   * THE FALSE INVARIANT THIS CLOSES. `dispatcher.ts` asserted, as an INVARIANT in
   * its own header, that "the `continue`s that remain lose nothing: they hand the
   * signal to the OTHER loop (its route is of the other kind)". That holds only
   * when the opener has an APPROVED disposition, which nothing guarantees.
   * Measured, on a batch with one touchpoint and no dispositions:
   * `tasks=0 refusals=[]` — no task, no refusal, no trace of either fact. SDE
   * decided to contact the member and dispatch lost the instruction, which is the
   * exact class the `no-route` refusal was introduced to end.
   */
  | 'touchpoint-route-not-outreach';

/**
 * No agent was selected, because no route matched.
 *
 * NAMED, NOT EMPTY — the same pattern as the disclosure gate's
 * `UNKNOWN_RECIPIENT`: the code appears in the record, so a reviewer sees that the
 * lookup found nothing rather than an empty string that reads as a missing field.
 * It is a pseudonymous reference by construction, so the PHI-safe projection in
 * `/api/ops/agents/actions` renders it unchanged.
 */
export const NO_AGENT = 'agent/none';

/**
 * No signal could be named — a composed touchpoint carrying no intent at all.
 * Named for the same reason as `NO_AGENT`; nothing ever resolves it.
 */
export const NO_SIGNAL = 'signal/none';

/** A signal that was refused dispatch, with the decision that refused it. */
export interface RefusedDispatch {
  signalId: string;
  memberId: string;
  agentId: string;
  reason: DispatchRefusalReason;
  /**
   * The disclosure decision, when one was made. Absent for `signal-unreadable`
   * and `consent-scope-absent`, which are reached before or without a disclosure
   * decision — refusals that were previously dropped entirely, so a caller could
   * not surface them at all.
   */
  decision?: DisclosureDecision;
}

/** What routing produced: the tasks, and what was refused on the way. */
export interface DispatchResult {
  tasks: DispatchedTask[];
  refusals: RefusedDispatch[];
}

function paContextFor(sig: Signal): PaContext {
  return { priority: sig.priority === 'urgent' ? 'expedited' : 'standard' };
}

/**
 * The outcome of building ONE task from a matched route: the task, or the coded
 * refusal that stands in its place. Discriminated, so a caller cannot read `task`
 * without having considered the refusal — the shape `outreachFor` already returns,
 * narrowed to the single-signal case.
 */
export type TaskBuild =
  { outcome: 'task'; task: DispatchedTask } | { outcome: 'refused'; refusal: RefusedDispatch };

/** A per-signal refusal against the agent the matched route named. */
function refused(sig: Signal, route: AgentRoute, reason: DispatchRefusalReason): TaskBuild {
  return {
    outcome: 'refused',
    refusal: {
      signalId: sig.signalId,
      memberId: sig.memberId,
      agentId: route.agentId,
      reason,
    },
  };
}

/**
 * Build the referral task a matched route asks for.
 *
 * NO FALLBACK TO THE SIGNAL ID. `sig.refs?.referral ?? sig.signalId` handed the
 * referral agent a SIGNAL id in a field typed and consumed as a FHIR
 * `ServiceRequest` reference: the agent acts on a reference that resolves to
 * nothing, the ledger cites that non-reference as the referral, and downstream
 * dedup keyed on it collides with every other ref-less signal for the member.
 * Same reasoning as the survivor and consent-scope refusals below — a defaulted
 * value that is merely unreachable is still the wrong SHAPE — so it refuses.
 */
export function referralTaskFor(sig: Signal, route: AgentRoute): TaskBuild {
  const referralRef = sig.refs?.referral;
  if (!referralRef) return refused(sig, route, 'referral-ref-absent');
  const knownState: ReferralState = sig.kind.endsWith('.stalled') ? 'stalled' : 'open';
  return {
    outcome: 'task',
    task: {
      agentId: route.agentId,
      taskKind: 'referral',
      memberId: sig.memberId,
      routeId: route.id,
      task: { referralRef, priority: sig.priority, knownState },
    },
  };
}

/**
 * Build the PA documentation task a matched route's template asks for.
 *
 * The `claim ?? thread` preference is kept: both are real references and a denial
 * may cite either. What is gone is the third link, `?? sig.signalId`, for the same
 * reason as `referralTaskFor` above.
 */
export function paTaskFor(sig: Signal, route: AgentRoute): TaskBuild {
  if (!route.pa) {
    throw new AgentRoutingError(`routes.${route.id}.pa`, 'a pa route must carry a template');
  }
  const threadRef = sig.refs?.claim ?? sig.refs?.thread;
  if (!threadRef) return refused(sig, route, 'thread-ref-absent');
  return {
    outcome: 'task',
    task: {
      agentId: route.agentId,
      taskKind: 'pa',
      memberId: sig.memberId,
      routeId: route.id,
      task: {
        threadRef,
        currentState: route.pa.currentState,
        paContext: paContextFor(sig),
        priority: sig.priority,
        advanceEvent: route.pa.advanceEvent,
      },
    },
  };
}

/**
 * Build the task a matched route asks for — TOTALLY and EXPLICITLY.
 *
 * THE DEFECT THIS CLOSES (the routing half). The caller held
 * `route.taskKind === 'referral' ? referralTaskFor(…) : paTaskFor(…)`, an
 * unguarded default: every taskKind that was not `outreach` or `referral` was
 * built as a PRIOR-AUTHORISATION task. Adding one routed agent with a new kind silently
 * turned its signals into PA tasks — a behavioural-health screen arriving at an
 * appeal-documentation agent, holding `dtr.generate` and `evidence.append`.
 *
 * (An earlier version of this comment said prior authorisation was "WITHDRAWN by a
 * standing scope decision". It is not: the `pa` route is live, `sig-5` is in the seeded
 * batch, and the PA agent dispatches on every demo run. The defect was never that PA is
 * out of scope — it is that a default sends the WRONG kind to it.)
 *
 * `const unhandled: never = route.taskKind` is the compile-time half — widen
 * `AgentTaskKind` and THIS LINE fails `tsc --noEmit`, so a new kind cannot reach a
 * fallback. The throw is the runtime half, for a `routing` object passed in-process
 * that never went through `parseAgentRouting`.
 */
export function taskFor(sig: Signal, route: AgentRoute): TaskBuild {
  switch (route.taskKind) {
    case 'referral':
      return referralTaskFor(sig, route);
    case 'pa':
      return paTaskFor(sig, route);
    case 'outreach':
      throw new AgentRoutingError(
        `routes.${route.id}.taskKind`,
        'outreach is dispatched per composed touchpoint by outreachFor, never per ' +
          'disposition — reaching here means the caller stopped filtering it out'
      );
    default: {
      const unhandled: never = route.taskKind;
      throw new AgentRoutingError(
        `routes.${route.id}.taskKind`,
        `"${String(unhandled)}" has no task builder: dispatch refuses rather than ` +
          'substituting another kind — the default here built every unrecognised kind ' +
          'as a prior-authorisation task'
      );
    }
  }
}

/**
 * Decide one composed touchpoint and build its outreach task.
 *
 * EVERY intent is decided, not just the opener. The composer bundles several
 * signals into one touchpoint, and gating the opener alone let a Part 2 intent
 * behind an ordinary opener reach the agent undecided and unrecorded.
 */
export function outreachFor(
  tp: Touchpoint,
  route: AgentRoute,
  opener: Signal,
  byId: ReadonlyMap<string, Signal>,
  input: DispatchInput
): { task?: DispatchedTask; refusals: RefusedDispatch[] } {
  const disclosed = decideTouchpointDisclosure(tp, route.agentId, byId, input.disclosure);
  // PAIRS, not two arrays reconciled by `requestId.includes(signalId)` — which
  // matched 'sig-1' against 'dispatch:sig-10:…' and dropped any refusal that
  // matched nothing at all, so the caller could never surface it.
  const refusals: RefusedDispatch[] = disclosed.refused.map((r) => ({
    signalId: r.signalId,
    memberId: tp.memberId,
    agentId: route.agentId,
    reason: r.decision ? ('disclosure-denied' as const) : ('signal-unreadable' as const),
    ...(r.decision ? { decision: r.decision } : {}),
  }));
  // Nothing survived: dispatch NO task. An empty touchpoint rendered into the
  // work queue is itself a marker that something was withheld.
  if (!disclosed.touchpoint) return { refusals };

  // The route and the consent scope follow the SURVIVING opener, not the
  // original one — the original may have been the intent that was refused.
  //
  // NO FALLBACK TO `opener`. This read `?? opener`, and `opener` is the ORIGINAL
  // opener — which may be the very intent the plane refused, so an unresolvable
  // survivor would have taken its consent scope and priority from a REFUSED
  // signal. `decideTouchpointDisclosure` only keeps intents whose signal it read,
  // so this cannot happen today; a defaulted consent source that is merely
  // currently-unreachable is still the wrong shape, so it refuses instead.
  const survivorId = disclosed.touchpoint.intents[0]?.signalId;
  const survivor = survivorId === undefined ? undefined : byId.get(survivorId);
  if (!survivor) {
    refusals.push({
      signalId: survivorId ?? opener.signalId,
      memberId: tp.memberId,
      agentId: route.agentId,
      reason: 'signal-unreadable',
    });
    return { refusals };
  }
  // NO EMPTY-SCOPE DEFAULT. `survivor.consentScope ?? ''` fed the outreach agent's
  // consent gate an empty string on an OPTIONAL field, and that gate read an empty
  // scope as a grant AND returned before consulting the opt-out store — so a
  // member who had opted out of contact was contacted. A touchpoint whose
  // surviving opener names no purpose is refused here, with a recorded refusal,
  // rather than dispatched unscoped.
  const consentScope = survivor.consentScope;
  if (!consentScope) {
    refusals.push({
      signalId: survivor.signalId,
      memberId: tp.memberId,
      agentId: route.agentId,
      reason: 'consent-scope-absent',
    });
    return { refusals };
  }
  return {
    task: {
      agentId: route.agentId,
      taskKind: 'outreach',
      memberId: tp.memberId,
      routeId: route.id,
      task: {
        touchpoint: disclosed.touchpoint,
        memberContext: input.memberContext,
        consentScope,
        priority: survivor.priority,
      },
    },
    refusals,
  };
}
