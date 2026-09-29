// CONTRACT: C-ADL  // SEAM: agent-definition
/**
 * Agent Definition Language — domain types.
 *
 * An agent is declared ONCE, as configuration. `agent-manifests.json` and
 * `agent-routing.json` are GENERATED from that declaration, never hand-edited.
 * Authority (tool allowlist, autonomy tier, PHI posture, escalation policy) is
 * therefore expressed in exactly one place.
 *
 * INVARIANT: the manifest and routing files are a total, pure function of the
 *            definition set — manifest agents ordered by agent id, routes
 *            ordered by their AUTHORED dispatchOrder — so compilation is
 *            deterministic and route precedence is never inferred.
 * INVARIANT: a tool a step may call must appear in the SAME definition's
 *            toolAllowlist — there is no cross-file join that could drift.
 * INVARIANT: phiPosture 'full' compiles only with an explicit phiFullOverride.
 * INVARIANT: the compiler can only ever narrow authority relative to the
 *            authority lock; widening requires a reviewed lock change.
 */
import type { AutonomyTier, PhiPosture } from '@/lib/agents/manifest';
import type { AgentTaskKind } from '@/lib/agents/dispatch/types';
import type { PaEvent, PaState } from '@/lib/workflow/paMachine';

/**
 * A code-level identifier: lowercase, dot- and dash-separated. Used for tool
 * ids, action types and outcome codes so no free text can reach a proposal.
 */
export const CODE_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)*$/;

/**
 * A routing rule contributed by this agent (compiled into agent-routing.json).
 *
 * WHY dispatchOrder EXISTS. The dispatcher resolves a signal with
 * `routes.find(...)` — FIRST MATCH WINS — so the order of the compiled routes
 * array is load-bearing semantics, not presentation. Deriving that order from
 * the agent id (or from filesystem read order) would mean renaming an unrelated
 * agent silently re-prioritises routing. Order is therefore AUTHORED here,
 * reviewed in the definition diff, and never inferred.
 */
export interface RouteDefinition {
  id: string;
  /**
   * INVARIANT: the closed dispatcher vocabulary (`AgentTaskKind`), not an open
   * string. An authored kind outside it used to compile, emit, and pass
   * `adl:check` byte-identically — then `parseAgentRouting` threw at module load
   * and took every dispatch in the process with it. Typing it here moves that
   * failure to `tsc --noEmit` on the definition.
   */
  taskKind: AgentTaskKind;
  /**
   * Global evaluation precedence; lowest is evaluated first. Must be unique
   * across the whole definition set — a tie would make the compiled order
   * depend on read order again. Author with gaps (10, 20, 30) so inserting a
   * route between two others does not renumber the file.
   */
  dispatchOrder: number;
  match: { actionability?: string; kindPrefix?: string };
  /**
   * INVARIANT: the CLOSED machine vocabularies, not open strings. Authored free text
   * used to reach `transition()`, which returns an `error` without throwing — so the
   * thread silently did not advance while the audited row read `executed`.
   */
  pa?: { currentState: PaState; advanceEvent: { type: PaEvent['type'] } };
}

/**
 * How an agent's behaviour is provided.
 *   module — a hand-written, reviewed WorkflowDefinition (the four legacy agents).
 *   steps  — a declarative body interpreted generically. NOT ENABLED in v1: the
 *            adversarial panel blocked the interpreter pending a capability-minted
 *            approval path, a typed predicate registry and consent-scoped recall.
 */
export type AgentBody = { kind: 'module'; owningModule: string };

/**
 * What an agent DECLARES it will ask for: the purpose it operates under and the
 * classes of member data it intends to touch.
 *
 * This is a CAPABILITY declaration, not a consent claim. It is legitimately
 * static and legitimately capped by the authority lock, because it describes the
 * agent. It is an INPUT to the runtime disclosure decision in
 * @/lib/agents/disclosure — never the decision. An agent cannot consent on a
 * member's behalf by declaring a field.
 */
export interface AgentDataCapability {
  purposeOfUse: string;
  /** Classes the agent may REQUEST. Whether it receives them is decided per event. */
  dataClasses: string[];
}

/** One agent, declared as configuration. */
export interface AgentDefinition {
  id: string;
  version: string;
  purpose: string;
  autonomyTier: AutonomyTier;
  escalationPolicyRef: string;
  phiPosture: PhiPosture;
  /** Required when phiPosture is 'full'; names who approved and the ticket. */
  phiFullOverride?: { approvedBy: string; ticketRef: string };
  owningModule: string;
  toolAllowlist: string[];
  /** What the agent will ask for. Absent means it requests no member data. */
  dataCapability?: AgentDataCapability;
  routes: RouteDefinition[];
  body: AgentBody;
}

/** The compiled manifest file shape (must equal the committed artifact). */
export interface CompiledManifestFile {
  version: string;
  agents: {
    id: string;
    version: string;
    purpose: string;
    toolAllowlist: string[];
    autonomyTier: AutonomyTier;
    escalationPolicyRef: string;
    phiPosture: PhiPosture;
    owningModule: string;
    dataCapability?: AgentDataCapability;
  }[];
}

/**
 * A routing entry as it appears in the generated file (carries its agent id).
 *
 * dispatchOrder is deliberately NOT emitted: it is an authoring control over
 * array position, and the array position is what the dispatcher consumes.
 * Emitting it would add a field the shipped loader contract does not know.
 */
export interface CompiledRoute {
  id: string;
  agentId: string;
  /** The same closed vocabulary the shipped loader validates (`AgentTaskKind`). */
  taskKind: AgentTaskKind;
  match: { actionability?: string; kindPrefix?: string };
  /** The same closed vocabularies the shipped loader validates. */
  pa?: { currentState: PaState; advanceEvent: { type: PaEvent['type'] } };
}

/** The compiled routing file shape (must equal the committed artifact). */
export interface CompiledRoutingFile {
  version: string;
  routes: CompiledRoute[];
}

/**
 * The AUTHORITY LOCK — the security control.
 *
 * Byte-equality between a generated file and its own previous output proves
 * only consistency: regenerating after widening an allowlist satisfies it. The
 * lock is the independent record of what authority each agent is permitted to
 * hold, and it is defined in @/lib/agents/authority because the manifest
 * registry applies the same lock again at load time.
 */
export type { AuthorityLockEntry, AuthorityLockFile } from '@/lib/agents/authority';

/** Ordering used for every authority comparison (index = strength). */
export { AUTONOMY_ORDER, PHI_ORDER } from '@/lib/agents/authority';
