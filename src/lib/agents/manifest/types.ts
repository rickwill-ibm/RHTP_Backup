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
 * The autonomy dial and the PHI posture — RE-EXPORTED, declared in `@/lib/agents/authority`.
 *
 * They moved there (register G-005) because the authority lock's strength ladders `AUTONOMY_ORDER` /
 * `PHI_ORDER` must agree with these unions, and that module may not import from this one: it sits
 * BELOW manifest by design, and `registry.ts` + `authorityGate.ts` import from it. Declared together
 * over there, both the union and the ordered array derive from ONE object, so a member cannot be added
 * to one and forgotten in the other. Re-exported here so every existing
 * `import type { AutonomyTier } from '@/lib/agents/manifest'` keeps resolving, and because a manifest
 * is still where a tier is DECLARED for an agent — only the vocabulary lives elsewhere.
 *
 * See that module for what each tier and posture means.
 */
import type { AutonomyTier, PhiPosture } from '@/lib/agents/authority';
export type { AutonomyTier, PhiPosture };

/**
 * What the agent declares it will ask for: the purpose it operates under and the
 * classes of member data it intends to touch. Capped by the authority lock like
 * any other authority, and an INPUT to the runtime disclosure decision — never
 * the decision. An agent cannot consent on a member's behalf by declaring it.
 */
export interface ManifestDataCapability {
  purposeOfUse: string;
  dataClasses: string[];
}

/** A single agent's governing manifest (versioned data). */
export interface AgentManifest {
  /** Stable agent id (the registry key). Pre-allocated; never invented at runtime. */
  id: string;
  /** Manifest version (additive; a promotion or allowlist change bumps it). */
  version: string;
  /** Declared data capability. Absent means the agent requests no member data. */
  dataCapability?: ManifestDataCapability;
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
    detail: string
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
    public readonly allowlist: string[]
  ) {
    super(
      `Agent "${agentId}" is not allowed to use tool "${tool}" ` +
        `(allowlist: ${allowlist.length ? allowlist.join(', ') : 'empty'})`
    );
    this.name = 'ToolNotAllowedError';
  }
}
