// CONTRACT: C-DISCLOSURE
/**
 * The dispatch disclosure gate — where a signal's data class finally binds.
 *
 * THE DEFECT THIS CLOSES. `Signal.part2Restricted` is set at intake, carried
 * through the pipeline, labelled `42-CFR-Part-2` in the graph mapping, and
 * validated as a required boolean on the outbox envelope. Then `routeBatch`
 * routes on `actionability` and `kindPrefix` only, and never reads it. The flag
 * survived the entire pipeline and was dropped at the one point where it decides
 * whether a substance-use-disorder signal reaches an agent.
 *
 * THE SECOND DEFECT, SAME SHAPE. The class FLOOR then arrived — `mental-health`
 * (NY MHL §33.13) and `hiv` (NY PHL Art 27-F) as taxonomy data — and its supplier
 * was left OPTIONAL, so the only production composition root omitted it and the
 * gate substituted `demographic` for every signal. A positive EPDS perinatal
 * depression screen was decided under HIPAA treatment/payment/operations with no
 * consent lookup at all. The supplier is now REQUIRED, an unknown kind refuses,
 * and there is no benign substitute anywhere in this file.
 *
 * Routing a signal to an agent IS a disclosure: the agent receives the member's
 * context and may act on it. So dispatch asks the decision plane, per signal,
 * rather than consulting a field on the agent — an agent's own declaration
 * cannot speak for a member's consent.
 *
 * INVARIANT: a heightened-class signal reaches an agent only on an explicit permit.
 * INVARIANT: every decision is recorded, permits and denials alike, so a later
 *            revocation review can ask what flowed and what was refused.
 * INVARIANT: no basis, unreadable basis, unknown agent, or ungoverned class => REFUSE.
 * INVARIANT: nothing in the legal record is invented — no defaulted purpose of use.
 */
import {
  decideDisclosure,
  DATA_CLASSES,
  HEIGHTENED_BASIS_REQUIRED,
  type AgentCapability,
  type ConsentBasis,
  type DataClass,
  type DisclosureDecision,
  type DisclosureLedger,
  type Recipient,
} from '@/lib/agents/disclosure';
import type { Signal } from '@/lib/sde';
import { log } from '@/lib/server/log';
import { AgentRoutingError } from './types';

/**
 * An unresolvable recipient. Named, not empty: it can match no `recipientOrgIds`
 * entry, so it denies `recipient-not-named` rather than throwing, and the code
 * appears in the record so a reviewer can see the lookup failed.
 */
const UNKNOWN_RECIPIENT: Recipient = { orgId: 'org/unresolved', kind: 'outside-covered-entity' };

/**
 * Run an injected dep, failing CLOSED to `fallback` if it throws — and SAYING SO.
 *
 * The silent version of this made a consent-store OUTAGE indistinguishable from
 * "the member has no consent on file": both produced an empty basis set and a
 * denial that read as a policy outcome. The denial is still the right answer —
 * never contact on error — but the silence was not: an outage that looks like a
 * policy decision is an outage nobody pages for. Every swallowed throw now emits
 * a structured event naming the dep and the signal.
 */
function safeDep<T>(fn: () => T, fallback: T, dep: string, signalId: string): T {
  try {
    const v = fn();
    return v === undefined || v === null ? fallback : v;
  } catch (err) {
    log.warn('disclosure.gate.dep-unavailable', {
      dep,
      signalId,
      error: err instanceof Error ? err.name : 'unknown',
    });
    return fallback;
  }
}

/** What the gate needs, all injected — no clock, no IO, no module state. */
export interface DisclosureGateDeps {
  /**
   * Data-class floor per signal type, from the reviewed taxonomy.
   *
   * REQUIRED, deliberately. While it was optional the one production composition
   * root omitted it and every signal was decided as `demographic`; the statutes
   * named in the disclosure plane were decoration. A signal type absent from this
   * map has NO floor, which is a governance gap rather than a safe default — see
   * `dataClassesFor`, which refuses it. Bind `taxonomyClassFloor()` from
   * `@/lib/sde`; do not write a per-caller lambda.
   */
  classFloorFor: (signalKind: string) => readonly string[] | undefined;
  /** Declared capability per agent id, from the compiled manifests. */
  capabilities: ReadonlyMap<string, AgentCapability>;
  /** The member's consent instruments. Empty is a legitimate answer: deny. */
  basesFor(memberId: string): readonly ConsentBasis[];
  /** Where this dispatch would send the data. */
  recipientFor(agentId: string): Recipient;
  ledger: DisclosureLedger;
  nowMs: number;
}

/**
 * Every data class this signal carries: the taxonomy FLOOR for its kind, unioned
 * with what instance-level provenance escalates it to.
 *
 * NO BENIGN SUBSTITUTE. An absent floor used to become `['demographic']`, which
 * is not in `HEIGHTENED_BASIS_REQUIRED`, so the decision plane permitted on the
 * baseline HIPAA TPO basis without reading the member's consent at all. A kind
 * the taxonomy does not govern is a class we cannot decide; the only honest
 * answer is to refuse loudly, because the alternative silently downgrades the
 * strictest regimes to the weakest.
 *
 * `part2Restricted` is specifically 42 CFR Part 2 — substance use disorder
 * records from a Part 2 program. It is deliberately NOT treated as a general
 * "sensitive" flag: mental health (NY MHL §33.13) and HIV (NY PHL Article 27-F)
 * are separate regimes with separate instruments, and collapsing them would let
 * one consent stand in for another. They arrive from the taxonomy floor instead.
 */
function dataClassesFor(signal: Signal, floor: readonly string[] | undefined): DataClass[] {
  if (!floor || floor.length === 0) {
    throw new AgentRoutingError(
      'classFloorFor',
      `signal kind "${signal.kind}" has no data-class floor in the taxonomy: an ungoverned ` +
        'class cannot be decided, and substituting a benign one would decide a §33.13 or ' +
        'Art 27-F record under HIPAA treatment/payment/operations'
    );
  }
  const unknown = floor.filter((c) => !(DATA_CLASSES as readonly string[]).includes(c));
  if (unknown.length > 0) {
    // The taxonomy parser carries the floor but cannot check it against the
    // disclosure vocabulary (sde/ does not import agents/). So it is checked
    // here: an unrecognised class matches no regime, so a single typo would
    // silently downgrade a governed record to the baseline basis.
    throw new AgentRoutingError(
      'classFloorFor',
      `signal kind "${signal.kind}" declares data class(es) outside the disclosure ` +
        `vocabulary (${unknown.join(', ')}): an unrecognised class carries no regime`
    );
  }
  const classes = new Set<string>(floor);
  // INSTANCE-LEVEL ESCALATION. `part2Restricted` is a fact about where THIS
  // record came from, not about the signal type, so it is unioned with the floor
  // and never replaces it. A record can be both MHL §33.13 and Part 2 material —
  // an OMH-licensed program with a co-occurring SUD service line is routine in
  // NY behavioural health — and evaluating one regime and stopping is wrong:
  // 42 CFR 2.20 makes the stricter rule controlling.
  if (signal.part2Restricted) classes.add('substance-use-disorder');
  // TOTALITY BY CONSTRUCTION, not by comment. `decideDispatchDisclosure` returns
  // `firstDenial ?? lastPermit` and one of them is set only if the loop below ran
  // at least once. "`classes` is never empty" was a comment; with an empty set
  // the function returned `undefined` typed as a decision and the caller threw a
  // TypeError reading `.outcome` on a confidentiality path. This is the guard
  // that makes the claim true.
  if (classes.size === 0) {
    throw new AgentRoutingError(
      'classFloorFor',
      `signal kind "${signal.kind}" resolved to no data class at all: a disclosure with no ` +
        'class has no regime and cannot be decided'
    );
  }
  return [...classes].sort() as DataClass[];
}

/**
 * True when this signal must not be dispatched without the gate: it carries a
 * class needing a specific written basis, or a class the taxonomy does not govern.
 *
 * GENERALISED FROM A SINGLE BOOLEAN. The fail-closed check read `part2Restricted`
 * alone, so an MHL §33.13 or Art 27-F signal — whose class comes from the
 * taxonomy floor, never from a flag on the signal — passed it and dispatched
 * with ZERO ledger rows. An UNGOVERNED kind counts as requiring the gate too,
 * because "we do not know which regime applies" is not "none applies".
 */
export function requiresDisclosureGate(
  signal: Signal,
  classFloorFor: (signalKind: string) => readonly string[] | undefined
): boolean {
  const floor = classFloorFor(signal.kind);
  if (!floor || floor.length === 0) return true;
  if (signal.part2Restricted) return true;
  return floor.some((c) => HEIGHTENED_BASIS_REQUIRED[c] !== undefined);
}

/**
 * Decide whether this signal may be dispatched to this agent, and record it.
 * Returns the decision so the caller can surface the refusal rather than
 * silently dropping the signal — an invisible denial is its own failure.
 *
 * Throws `AgentRoutingError` on a WIRING error — an agent with no declared
 * capability, a signal kind with no governed class. Those are not member-level
 * outcomes and must not be filed as though they were.
 */
export function decideDispatchDisclosure(
  signal: Signal,
  agentId: string,
  deps: DisclosureGateDeps
): DisclosureDecision {
  const capability = safeDep<AgentCapability | undefined>(
    () => deps.capabilities.get(agentId),
    undefined,
    'capabilities',
    signal.signalId
  );
  // NOTHING IS INVENTED INTO THE LEGAL RECORD. `purposeOfUse` was
  // `capability?.purposeOfUse ?? 'care-coordination'`. The ledger is the artifact
  // produced under subpoena, and a fabricated field in it is worse than an absent
  // one. The purpose of use IS the agent's declared purpose, so with no
  // declaration there is no purpose to record — and an agent the manifest never
  // declared is a WIRING error (routing and manifest disagree), not a member-level
  // policy outcome, so it refuses loudly instead of being filed as one.
  //
  // DECLARED GAP (pilot, not demo): because the request's purpose is the
  // capability's purpose, `decide.ts`'s `agent-purpose-mismatch` cannot fire from
  // this call site. Making it reachable means the purpose coming from the ROUTE —
  // a routing-vocabulary change in `data/agent-routing.json` + `AgentRoute` — not
  // a change here. Fabricating a purpose to make the comparison "work" would be
  // the same defect in a different place.
  if (!capability) {
    throw new AgentRoutingError(
      'capabilities',
      `agent "${agentId}" has no declared data capability, so a disclosure to it has no ` +
        'purpose of use: routing names an agent the manifest does not'
    );
  }
  const floor = safeDep<readonly string[] | undefined>(
    () => deps.classFloorFor(signal.kind),
    undefined,
    'classFloorFor',
    signal.signalId
  );
  // An unreachable consent store yields NO bases, and no bases is a denial —
  // the same fail-closed treatment sde/consentGate.ts gives its own seam.
  const bases = safeDep<readonly ConsentBasis[]>(
    () => deps.basesFor(signal.memberId),
    [],
    'basesFor',
    signal.signalId
  );
  const recipient = safeDep(
    () => deps.recipientFor(agentId),
    UNKNOWN_RECIPIENT,
    'recipientFor',
    signal.signalId
  );
  return decideEveryClass(signal, agentId, capability, bases, recipient, deps, floor);
}

/**
 * EVERY applicable regime is decided, and ALL of them are recorded. Taking the
 * first class alone would evaluate one statute and stop — and 42 CFR 2.20 makes
 * the stricter rule controlling, so a record that is both MHL §33.13 and Part 2
 * material must clear both. The signal moves only if every class permits; the
 * FIRST denial is returned, so the reason a caller surfaces names the regime that
 * actually refused.
 */
function decideEveryClass(
  signal: Signal,
  agentId: string,
  capability: AgentCapability,
  bases: readonly ConsentBasis[],
  recipient: Recipient,
  deps: DisclosureGateDeps,
  floor: readonly string[] | undefined
): DisclosureDecision {
  const classes = dataClassesFor(signal, floor);
  let firstDenial: DisclosureDecision | undefined;
  let lastPermit: DisclosureDecision | undefined;
  for (const dataClass of classes) {
    const decision = decideDisclosure(
      {
        requestId: `dispatch:${signal.signalId}:${dataClass}:${agentId}`,
        subjectId: signal.memberId,
        dataClass,
        purposeOfUse: capability.purposeOfUse,
        requestingAgentId: agentId,
        recipient,
        asOfMs: deps.nowMs,
      },
      capability,
      bases
    );
    deps.ledger.record(decision);
    if (decision.outcome === 'deny') firstDenial ??= decision;
    else lastPermit = decision;
  }
  // `dataClassesFor` refuses an empty class set, so the loop ran and one of these
  // is set. The cast is sound because of that guard, not because of a comment.
  return firstDenial ?? (lastPermit as DisclosureDecision);
}
