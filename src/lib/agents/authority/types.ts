// CONTRACT: C-AUTHORITY
/**
 * The authority lock — shared types.
 *
 * WHY THIS MODULE EXISTS SEPARATELY. The lock is the security record of what
 * authority each agent may hold. It is consulted in two places that must not
 * depend on each other:
 *   - at BUILD time, by the ADL compiler, against the agent definitions;
 *   - at LOAD time, by the manifest registry, against whatever manifest the
 *     process actually ended up with — including one a production loader
 *     fetched from a store, which the build-time gate never saw.
 * Putting the comparison here means there is ONE implementation of "is this
 * within the lock", not two that can drift apart and disagree about safety.
 */

/**
 * The autonomy dial (conventions §10.5), weakest first — the vocabulary AND the strength order, in one
 * declaration. Read from the manifest per agent per deployment; the runtime maps the tier to decision
 * behavior through a data lookup, never a hardcoded branch:
 *   HITL       — a human must approve every proposed action (human-in-the-loop).
 *   HOTL       — auto-approves after a review window unless a human rejects (human-on-the-loop); the
 *                review window is the escalation SLA.
 *   autonomous — auto-approves immediately (no human gate).
 * Regardless of tier, an agent NEVER sets an authoritative domain state (e.g. a PA approval) directly;
 * the owning state machine is the single authority.
 *
 * WHY THE VOCABULARY LIVES HERE AND NOT IN `@/lib/agents/manifest`, where it used to. The order array
 * and the union must agree, and they cannot be made to agree across a module boundary this module is
 * forbidden to cross: per the header above, `manifest/authorityGate.ts` and `manifest/registry.ts`
 * import FROM here, so importing back — even type-only, erased at runtime — inverts the layering and
 * leaves a value import, and a real cycle, one careless edit away. Declared here, both are derived
 * from ONE object and manifest re-exports the type, so nothing inverts and nothing can drift.
 */
const AUTONOMY_TIER_SET = { HITL: true, HOTL: true, autonomous: true } as const;
export type AutonomyTier = keyof typeof AUTONOMY_TIER_SET;

/**
 * PHI posture (conventions §10, PHI-safe guardrail), weakest first. Declares what member data an
 * agent's proposals and tool calls may carry:
 *   none            — no member data at all.
 *   references-only — resource ids + codes only, never free-text payload.
 *   full            — cleared to carry PHI (requires a compliance sign-off; no shipped agent uses it).
 */
const PHI_POSTURE_SET = { none: true, 'references-only': true, full: true } as const;
export type PhiPosture = keyof typeof PHI_POSTURE_SET;

/**
 * The strength ladders. Index is strength, and both are DERIVED from the sets above, so a member
 * added to a union without an array entry is not merely detectable — it is unrepresentable (register
 * G-005, closing it the way `agents/dispatch/types.ts` already does for `AgentTaskKind`).
 *
 * DELIBERATELY TYPED `readonly string[]`, NOT `readonly AutonomyTier[]`. This module validates
 * UNTRUSTED input — per the header above, a manifest "a production loader fetched from a store, which
 * the build-time gate never saw" — so `AuthoritySubject.autonomyTier` and
 * `AuthorityLockEntry.maxAutonomyTier` are `string` by design, and `rank()` / `oneOf()` must accept an
 * arbitrary string in order to REJECT it. Narrowing the array type would break `assertAuthority`,
 * `lockSchema.oneOf` and `presetRegistry`, in the security-critical path, to close a lint-shaped gap.
 *
 * `Object.keys` on an object literal preserves declaration order for string keys, which is what makes
 * "weakest first" a property of the declaration rather than of a second list someone maintains.
 */
export const AUTONOMY_ORDER: readonly string[] = Object.keys(AUTONOMY_TIER_SET);
export const PHI_ORDER: readonly string[] = Object.keys(PHI_POSTURE_SET);

/**
 * The minimum an authority-bearing thing must expose to be checked. Both an ADL
 * definition and a loaded manifest satisfy it structurally, which is what lets
 * one comparison serve both without either module importing the other.
 */
export interface AuthoritySubject {
  id: string;
  toolAllowlist: readonly string[];
  autonomyTier: string;
  phiPosture: string;
  escalationPolicyRef: string;
  /**
   * The classes of member data this subject declares it will request. Capped by
   * the lock like any other authority: an agent that could widen its own
   * declared classes could reach a heightened-basis class (substance use, mental
   * health, HIV) without anyone reviewing the change.
   */
  dataClasses?: readonly string[];
}

/** One agent's permitted authority ceiling. */
export interface AuthorityLockEntry {
  agentId: string;
  /** The exact set of tools this agent may hold. A subject's set must be a subset. */
  tools: string[];
  maxAutonomyTier: string;
  maxPhiPosture: string;
  escalationPolicyRef: string;
  /**
   * The data classes this agent may declare. Omitted means NONE are permitted —
   * fail closed, so an agent acquires a heightened class only by a reviewed lock
   * change, never by adding a line to its own definition.
   */
  dataClasses?: string[];
}

/**
 * The whole lock file. Listed in `/CODEOWNERS` so changing it requires a security review.
 *
 * That file did not exist until W7.5d — this comment asserted a control that was not there. The
 * declaration binds only where the host enforces required reviews; the mechanical half is
 * `adl:check`'s byte-identity gate. Neither is sufficient alone.
 */
export interface AuthorityLockFile {
  version: string;
  entries: AuthorityLockEntry[];
}

/**
 * How a violation is raised. Injected so each caller keeps its own error
 * taxonomy — the ADL compiler throws AdlError, the registry throws
 * AgentManifestError — while sharing one set of rules.
 */
export type AuthorityViolation = (path: string, detail: string) => Error;
