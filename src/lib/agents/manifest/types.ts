/**
 * Agent manifest — domain types (conventions §10.2).
 *
 * Every agent in the library is declared in a versioned manifest. The runtime
 * loads manifests as data; NOTHING about an agent's authority is implicit in
 * code. Autonomy tier, tool allowlist, escalation policy, and PHI posture are
 * all read from here — never branched by an `if (agentId === ...)` in engine
 * logic. Widening a tool allowlist or promoting an autonomy tier is a reviewed
 * manifest change, not a code tweak (§10.3, §10.5).
 *
 * Nothing here keys on a persona: agent ids, tools, and tiers are typed data
 * evaluated by a generic registry + runtime (plan §1.2).
 */

/**
 * The autonomy dial (conventions §10.5). Read from the manifest per agent per
 * deployment; the runtime maps the tier to decision behavior through a data
 * lookup, never a hardcoded branch:
 *   HITL       — a human must approve every proposed action (human-in-the-loop).
 *   HOTL       — auto-approves after a review window unless a human rejects
 *                (human-on-the-loop); the review window is the escalation SLA.
 *   autonomous — auto-approves immediately (no human gate).
 * Regardless of tier, an agent NEVER sets an authoritative domain state (e.g. a
 * PA approval) directly; the owning state machine is the single authority.
 */
export type AutonomyTier = 'HITL' | 'HOTL' | 'autonomous';

/**
 * PHI posture (conventions §10, PHI-safe guardrail). Declares what member data
 * an agent's proposals and tool calls may carry:
 *   none            — no member data at all.
 *   references-only — resource ids + codes only, never free-text payload.
 *   full            — cleared to carry PHI (requires a compliance sign-off; no
 *                     shipped agent uses this tier).
 */
export type PhiPosture = 'none' | 'references-only' | 'full';

/** A single agent's governing manifest (versioned data). */
export interface AgentManifest {
  /** Stable agent id (the registry key). Pre-allocated; never invented at runtime. */
  id: string;
  /** Manifest version (additive; a promotion or allowlist change bumps it). */
  version: string;
  /** One-line statement of what the agent is for (auditable intent). */
  purpose: string;
  /** The MINIMUM set of tool ids this agent may invoke (least privilege, §10.3). */
  toolAllowlist: string[];
  /** The autonomy dial, read by the runtime (never a code branch). */
  autonomyTier: AutonomyTier;
  /** Names the escalation policy set (escalation-as-data) governing its proposals. */
  escalationPolicyRef: string;
  /** What member data the agent may carry (PHI-safe guardrail). */
  phiPosture: PhiPosture;
  /** The module that owns this agent's behavior (workflow definition). */
  owningModule: string;
}

/** The whole registry file: a versioned, additive list of manifests. */
export interface AgentManifestRegistryData {
  version: string;
  agents: AgentManifest[];
}

/** Raised loudly when a manifest file is malformed (never silently defaulted). */
export class AgentManifestError extends Error {
  constructor(
    public readonly field: string,
    detail: string,
  ) {
    super(`Agent manifest invalid at "${field}": ${detail}`);
    this.name = 'AgentManifestError';
  }
}

/** Raised when an agent id is not registered. */
export class UnknownAgentError extends Error {
  constructor(public readonly agentId: string) {
    super(`No agent manifest registered for id "${agentId}"`);
    this.name = 'UnknownAgentError';
  }
}

/**
 * Raised when a runtime tool call targets a tool NOT in the agent's allowlist
 * (least-privilege enforcement, §10.3). This is the structural guarantee that an
 * agent can never exceed its declared authority.
 */
export class ToolNotAllowedError extends Error {
  constructor(
    public readonly agentId: string,
    public readonly tool: string,
    public readonly allowlist: string[],
  ) {
    super(
      `Agent "${agentId}" is not allowed to use tool "${tool}" ` +
        `(allowlist: ${allowlist.length ? allowlist.join(', ') : 'empty'})`,
    );
    this.name = 'ToolNotAllowedError';
  }
}
