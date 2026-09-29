// CONTRACT: C-DISCLOSURE
/**
 * Agent dispatcher (thin composition root).
 *
 * Given an SDE disposition batch, route each APPROVED action to the right agent by
 * trigger/type. Routing is data (data/agent-routing.json): a match rule maps a
 * signal to an agent id + task kind; the dispatcher applies the rule and builds the
 * concrete workflow input. Outreach groups by the SDE-composed coordinated
 * touchpoint (one task per touchpoint); referral/PA route per approved disposition.
 *
 * Nothing here keys on a persona in code — the trigger->agent map and the PA
 * advancement template are data; the code is a generic apply-and-start.
 *
 * INVARIANT: there is no ungated dispatch path. `DispatchInput.disclosure` is
 *            required, and `assertNoUngatedPart2` is the runtime backstop for a
 *            caller that arrives without one anyway.
 * INVARIANT: dispatch is TOTAL over task kinds and there is no default workflow.
 *            Every `taskKind` is either started on its own declared workflow or
 *            refused with a coded `AgentRoutingError`; nothing falls through.
 * INVARIANT: a signal the router DROPS leaves a `RefusedDispatch` the caller can
 *            surface — `no-route` when no rule matched, `signal-unreadable` when the
 *            batch does not carry it, `touchpoint-route-not-outreach` when a composed
 *            touchpoint's opener routes elsewhere and no approved disposition will
 *            pick it up. The `continue`s that remain lose nothing, and each one now
 *            TESTS its reason for continuing rather than asserting it.
 *
 * The third INVARIANT above previously claimed the handoff without testing it, and was
 * false; measured `tasks=0 refusals=[]`. History, trace and reasoning: coalition-log.md,
 * Wave 0 [F6]. Kept there, not duplicated here — a module header carries what is TRUE
 * now (§13.3), and duplicating the log into it is the DRY violation E4 covers. It is
 * also how this file reached 419 lines against a 400 cap.
 */
// Every workflow/result/task import moved out with `startTask.ts`. They were left behind
// dead: `tsc --noEmit` does not flag an unused import, so the extraction looked clean and
// the only thing that saw them was `no-unused-vars` at WARNING level. An extraction that
// leaves its imports behind is an extraction that half-happened.
import { isApproved, taxonomyClassFloor, type ClassFloorSupplier, type Signal } from '@/lib/sde';
import {
  AgentRoutingError,
  type AgentRoute,
  type AgentRouting,
  type DispatchedTask,
  type RouteMatch,
} from './types';
import {
  decideDispatchDisclosure,
  requiresDisclosureGate,
  type DisclosureGateDeps,
} from './disclosureGate';
import { loadAgentRouting } from './routingSchema';
import {
  NO_AGENT,
  NO_SIGNAL,
  outreachFor,
  taskFor,
  type DispatchInput,
  type DispatchResult,
  type RefusedDispatch,
} from './dispatchTasks';

// The routing validator moved to ./routingSchema and the input/refusal contract to
// ./dispatchTasks (conventions §2 — split by responsibility, not by convenience).
// Both are re-exported so the public barrel and every existing caller are unchanged.
export { parseAgentRouting, loadAgentRouting } from './routingSchema';
export { NO_AGENT } from './dispatchTasks';
export type {
  DispatchInput,
  DispatchResult,
  DispatchRefusalReason,
  RefusedDispatch,
  TaskBuild,
} from './dispatchTasks';

// ── Routing (pure, deterministic) ───────────────────────────────────────────────

function matches(m: RouteMatch, sig: Signal): boolean {
  if (m.actionability !== undefined && sig.actionability !== m.actionability) return false;
  if (m.kindPrefix !== undefined && !sig.kind.startsWith(m.kindPrefix)) return false;
  return m.actionability !== undefined || m.kindPrefix !== undefined;
}

function firstMatch(routing: AgentRouting, sig: Signal): AgentRoute | undefined {
  return routing.routes.find((r) => matches(r.match, sig));
}

/**
 * A dispatch input whose gate may be missing — the only shape the fail-closed
 * check below can accept, now that `DispatchInput` requires one. A JavaScript
 * caller, or an input assembled dynamically, can still arrive without a gate;
 * that is precisely what this checks.
 */
export type UngatedCheckInput = Omit<DispatchInput, 'disclosure'> & {
  disclosure?: DisclosureGateDeps;
  /** Floor supplier for the check itself; defaults to the shipped taxonomy. */
  classFloorFor?: ClassFloorSupplier;
};

/**
 * Refuse to route material needing a specific written basis with no gate in place.
 *
 * GENERALISED FROM PART 2. This inspected `s.part2Restricted` alone, so an
 * MHL §33.13 or PHL Art 27-F signal — whose class comes from the taxonomy floor,
 * never from a flag on the signal — passed the check and dispatched with ZERO
 * ledger rows. It now asks the same question the gate asks: does floor ∪
 * provenance intersect the classes requiring a written basis, or is the class one
 * the taxonomy does not govern at all?
 *
 * The exported NAME is retained because it is part of the public barrel, which
 * this change does not own; its scope is now every heightened regime, not Part 2
 * alone. A missing gate is a wiring error, and a wiring error here must be loud.
 */
export function assertNoUngatedPart2(input: UngatedCheckInput): void {
  if (input.disclosure) return;
  const floorFor = input.classFloorFor ?? taxonomyClassFloor();
  const needGate = input.signals.filter((s) => requiresDisclosureGate(s, floorFor));
  if (needGate.length === 0) return;
  throw new AgentRoutingError(
    'disclosure',
    `${String(needGate.length)} signal(s) carry a data class requiring a specific written ` +
      'basis (42 CFR Part 2 / NY MHL §33.13 / NY PHL Art 27-F), or a class the taxonomy does ' +
      'not govern, but no disclosure gate was supplied — dispatch would disclose them undecided'
  );
}

/**
 * Route an SDE disposition batch into concrete agent tasks. Outreach groups by
 * composed touchpoint; referral/PA route per approved disposition. Deterministic:
 * touchpoints first (in composed order), then approved dispositions (in batch order).
 *
 * The tasks-only shape over `routeBatchGated`, kept because callers that do not
 * surface refusals still exist. It is NO LONGER an ungated path: the gate is a
 * required input, so this and `routeBatchGated` decide identically.
 */
export function routeBatch(input: DispatchInput): DispatchedTask[] {
  return routeBatchGated(input).tasks;
}

/**
 * The state ONE `routeBatchGated` call threads through its two routing loops.
 *
 * Private and single-pass. It exists so the two loops are two short functions
 * rather than one 80-line one (conventions: functions ≤ 50 lines), not as a
 * reusable abstraction — nothing outside this module constructs it.
 */
interface RoutePass {
  readonly input: DispatchInput;
  readonly routing: AgentRouting;
  readonly byId: ReadonlyMap<string, Signal>;
  readonly tasks: DispatchedTask[];
  readonly refusals: RefusedDispatch[];
  /**
   * `${reason}:${signalId}` already recorded for the "nothing to route to" family.
   * A signal can be BOTH a touchpoint opener and an approved disposition — the
   * seeded batch bundles five of them — so the route question is asked twice for
   * the same signal, and the caller must not see the same refusal twice.
   */
  readonly unrouted: Set<string>;
}

/** Record a "nothing to route to" refusal once per (reason, signal). */
function recordUnrouted(pass: RoutePass, refusal: RefusedDispatch): void {
  const key = `${refusal.reason}:${refusal.signalId}`;
  if (pass.unrouted.has(key)) return;
  pass.unrouted.add(key);
  pass.refusals.push(refusal);
}

/**
 * The route for a signal — or `undefined`, HAVING RECORDED a `no-route` refusal.
 *
 * THE DEFECT THIS CLOSES. `firstMatch` returning `undefined` led to a bare
 * `continue` and nothing pushed to `refusals`, so a signal the platform received
 * and did nothing with left no trace on any surface. The seeded demo batch carries
 * two — `adt.discharge` (sig-2) and `screening.result` (sig-3), both approved,
 * both `care-team-task` — and their care-team-task dispatch vanished silently.
 * This module's own standard, from the docstring on `routeBatchGated`: a refusal a
 * caller cannot see is a refusal nobody can evidence.
 */
function routeFor(pass: RoutePass, sig: Signal): AgentRoute | undefined {
  const route = firstMatch(pass.routing, sig);
  if (route) return route;
  recordUnrouted(pass, {
    signalId: sig.signalId,
    memberId: sig.memberId,
    agentId: NO_AGENT,
    reason: 'no-route',
  });
  return undefined;
}

/** True when this signal may reach this agent; records the decision either way. */
function permitted(pass: RoutePass, sig: Signal, agentId: string): boolean {
  const decision = decideDispatchDisclosure(sig, agentId, pass.input.disclosure);
  if (decision.outcome === 'permit') return true;
  pass.refusals.push({
    signalId: sig.signalId,
    memberId: sig.memberId,
    agentId,
    reason: 'disclosure-denied',
    decision,
  });
  return false;
}

/** Outreach: one task per SDE coordinated touchpoint (grouped by the composer). */
function routeTouchpoints(pass: RoutePass): void {
  for (const tp of pass.input.batch.touchpoints) {
    const openerId = tp.intents[0]?.signalId;
    const opener = openerId === undefined ? undefined : pass.byId.get(openerId);
    if (!opener) {
      // ALSO a silent `continue` before: SDE composed a touchpoint — it decided to
      // contact the member — and dispatch lost the instruction with nothing
      // recorded. `NO_SIGNAL` is a named absence, not a defaulted id: it is written
      // into the record so a reviewer sees the touchpoint carried no intent at all.
      recordUnrouted(pass, {
        signalId: openerId === undefined ? NO_SIGNAL : openerId,
        memberId: tp.memberId,
        agentId: NO_AGENT,
        reason: 'signal-unreadable',
      });
      continue;
    }
    const route = routeFor(pass, opener);
    // `routeFor` already recorded `no-route`; nothing to add.
    if (!route) continue;
    if (route.taskKind !== 'outreach') {
      // A non-outreach route is a refusal HERE unless the disposition loop will
      // genuinely pick the opener up, and the only thing that makes that true is an
      // APPROVED disposition naming it. The old bare `continue` asserted the handoff
      // instead of checking it, and the module header asserted the same thing as an
      // INVARIANT. Measured on a batch with one touchpoint and no dispositions:
      // `tasks=0 refusals=[]`. The claim was false and the touchpoint was lost.
      const handledByDispositions = pass.input.batch.dispositions.some(
        (d) => d.signalId === opener.signalId && isApproved(d)
      );
      if (!handledByDispositions) {
        recordUnrouted(pass, {
          signalId: opener.signalId,
          memberId: tp.memberId,
          agentId: route.agentId,
          reason: 'touchpoint-route-not-outreach',
        });
      }
      continue;
    }
    const out = outreachFor(tp, route, opener, pass.byId, pass.input);
    pass.refusals.push(...out.refusals);
    if (out.task) pass.tasks.push(out.task);
  }
}

/** Referral + PA: one task per approved disposition whose route is not outreach. */
function routeDispositions(pass: RoutePass): void {
  for (const d of pass.input.batch.dispositions) {
    if (!isApproved(d)) continue;
    const sig = pass.byId.get(d.signalId);
    if (!sig) {
      // An APPROVED disposition naming a signal the batch does not carry. Dropped
      // silently before; the decision was made and then lost.
      recordUnrouted(pass, {
        signalId: d.signalId,
        memberId: d.memberId,
        agentId: NO_AGENT,
        reason: 'signal-unreadable',
      });
      continue;
    }
    const route = routeFor(pass, sig);
    if (!route || route.taskKind === 'outreach') continue;
    if (!permitted(pass, sig, route.agentId)) continue;
    const built = taskFor(sig, route);
    if (built.outcome === 'refused') {
      pass.refusals.push(built.refusal);
      continue;
    }
    pass.tasks.push(built.task);
  }
}

/**
 * Route, applying the disclosure gate. `routeBatch` is the tasks-only shape; this
 * one returns the refusals too, because a refusal a caller cannot see is a
 * refusal nobody can evidence.
 */
export function routeBatchGated(input: DispatchInput): DispatchResult {
  // UNCONDITIONAL, before any class is inspected. `assertNoUngatedPart2` asks
  // whether the BATCH needs a gate, which is the right question for a caller
  // pre-checking its own input — but the answer here is always yes, because
  // routing any signal to an agent is a disclosure that must leave a ledger row.
  // Relying on the class check alone would let an all-benign batch reach the gate
  // as `undefined` and fail with a TypeError instead of a coded refusal.
  if (!input.disclosure) {
    throw new AgentRoutingError(
      'disclosure',
      'no disclosure gate was supplied: routing a signal to an agent IS a disclosure, and a ' +
        'dispatch that leaves no ledger row cannot be evidenced afterwards'
    );
  }
  assertNoUngatedPart2(input);
  const pass: RoutePass = {
    input,
    routing: input.routing ?? loadAgentRouting(),
    byId: new Map(input.signals.map((s) => [s.signalId, s])),
    tasks: [],
    refusals: [],
    unrouted: new Set<string>(),
  };
  routeTouchpoints(pass);
  routeDispositions(pass);
  return { tasks: pass.tasks, refusals: pass.refusals };
}

// ── Running: extracted to ./startTask.ts (conventions §2 — the §2 cap forced the split
// that responsibility already justified). Re-exported so every existing caller and the
// public barrel keep the same import site.
export { defaultAgentWorkflows, runDispatch, type AgentWorkflows } from './startTask';
