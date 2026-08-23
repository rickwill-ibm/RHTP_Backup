// SEAM: agentManifests  (dataMode)
/**
 * Agent manifest registry — the typed loader + read API (conventions §10.2).
 *
 * Manifests ship as versioned data (data/agent-manifests.json), are validated
 * by a hand validator that refuses LOUDLY (the house pattern — zod is not a
 * project dependency), and are read through `getAgentManifest(id)`. The runtime
 * reads authority (tool allowlist, autonomy tier, escalation ref, PHI posture)
 * from here; none of it is implicit in code.
 *
 * dataMode seam `agentManifests`: mock/seeded loads the shipped default file
 * (the registry that keeps the demo green); production swaps in a store-backed
 * loader via setProductionManifestLoader(). The default file is always the
 * reference registry, independent of mode, so tests are reproducible.
 */
import { getDataMode } from '@/lib/config/dataMode';
import registryJson from './data/agent-manifests.json';
import {
  AgentManifestError,
  ToolNotAllowedError,
  UnknownAgentError,
  type AgentManifest,
  type AgentManifestRegistryData,
  type AutonomyTier,
  type PhiPosture,
} from './types';

const AUTONOMY_TIERS: AutonomyTier[] = ['HITL', 'HOTL', 'autonomous'];
const PHI_POSTURES: PhiPosture[] = ['none', 'references-only', 'full'];

function req(cond: unknown, field: string, detail: string): asserts cond {
  if (!cond) throw new AgentManifestError(field, detail);
}

function validateManifest(m: unknown, idx: number): AgentManifest {
  req(m && typeof m === 'object', `agents[${idx}]`, 'must be an object');
  const o = m as Record<string, unknown>;
  req(typeof o.id === 'string' && o.id.length > 0, `agents[${idx}].id`, 'must be a non-empty string');
  req(typeof o.version === 'string' && o.version.length > 0, `agents[${idx}].version`, 'must be a version string');
  req(typeof o.purpose === 'string' && o.purpose.length > 0, `agents[${idx}].purpose`, 'must be a non-empty string');
  req(
    Array.isArray(o.toolAllowlist) && o.toolAllowlist.every((t) => typeof t === 'string'),
    `agents[${idx}].toolAllowlist`,
    'must be an array of tool-id strings (least privilege: list the minimum)',
  );
  req(
    typeof o.autonomyTier === 'string' && AUTONOMY_TIERS.includes(o.autonomyTier as AutonomyTier),
    `agents[${idx}].autonomyTier`,
    `must be one of ${AUTONOMY_TIERS.join(', ')}`,
  );
  req(
    typeof o.escalationPolicyRef === 'string' && o.escalationPolicyRef.length > 0,
    `agents[${idx}].escalationPolicyRef`,
    'must name an escalation policy set',
  );
  req(
    typeof o.phiPosture === 'string' && PHI_POSTURES.includes(o.phiPosture as PhiPosture),
    `agents[${idx}].phiPosture`,
    `must be one of ${PHI_POSTURES.join(', ')}`,
  );
  req(
    typeof o.owningModule === 'string' && o.owningModule.length > 0,
    `agents[${idx}].owningModule`,
    'must name the module that owns the agent behavior',
  );
  return {
    id: o.id as string,
    version: o.version as string,
    purpose: o.purpose as string,
    toolAllowlist: (o.toolAllowlist as string[]).slice(),
    autonomyTier: o.autonomyTier as AutonomyTier,
    escalationPolicyRef: o.escalationPolicyRef as string,
    phiPosture: o.phiPosture as PhiPosture,
    owningModule: o.owningModule as string,
  };
}

/** Parse + validate a registry data blob, or throw AgentManifestError loudly. */
export function parseRegistry(data: unknown): AgentManifestRegistry {
  req(data && typeof data === 'object', 'registry', 'must be an object');
  const o = data as Record<string, unknown>;
  req(typeof o.version === 'string' && o.version.length > 0, 'version', 'must be a version string');
  req(Array.isArray(o.agents), 'agents', 'must be an array');
  const byId = new Map<string, AgentManifest>();
  (o.agents as unknown[]).forEach((m, i) => {
    const manifest = validateManifest(m, i);
    req(!byId.has(manifest.id), `agents[${i}].id`, `duplicate agent id "${manifest.id}"`);
    byId.set(manifest.id, manifest);
  });
  return new AgentManifestRegistry(o.version as string, byId);
}

/** An immutable, validated registry keyed by agent id. */
export class AgentManifestRegistry {
  constructor(
    public readonly version: string,
    private readonly byId: Map<string, AgentManifest>,
  ) {}

  /** All registered manifests (stable order). */
  list(): AgentManifest[] {
    return [...this.byId.values()];
  }

  /** All registered agent ids. */
  ids(): string[] {
    return [...this.byId.keys()];
  }

  /** Read one manifest, or throw UnknownAgentError. */
  get(id: string): AgentManifest {
    const m = this.byId.get(id);
    if (!m) throw new UnknownAgentError(id);
    return m;
  }

  /** True when the tool is in the agent's allowlist (least-privilege check). */
  isToolAllowed(agentId: string, tool: string): boolean {
    return this.get(agentId).toolAllowlist.includes(tool);
  }

  /**
   * Enforce least privilege: throw ToolNotAllowedError when a runtime call
   * targets a tool NOT in the agent's allowlist (§10.3). The one gate every
   * tool invocation passes through.
   */
  assertToolAllowed(agentId: string, tool: string): void {
    const manifest = this.get(agentId);
    if (!manifest.toolAllowlist.includes(tool)) {
      throw new ToolNotAllowedError(agentId, tool, manifest.toolAllowlist);
    }
  }
}

// ── Loader (dataMode seam: agentManifests) ────────────────────────────────────

let productionLoader: (() => AgentManifestRegistry) | null = null;

/** The shipped default registry (the reference data, mode-independent). */
export function defaultRegistry(): AgentManifestRegistry {
  return parseRegistry(registryJson as AgentManifestRegistryData);
}

/**
 * Install the production manifest loader (store-backed). Until set, production
 * mode falls back to the default file so the seam is registered before its
 * backend exists (the dataMode convention).
 */
export function setProductionManifestLoader(loader: (() => AgentManifestRegistry) | null): void {
  productionLoader = loader;
}

/** Load the active registry for the resolved `agentManifests` data mode. */
export function loadAgentManifests(): AgentManifestRegistry {
  const mode = getDataMode('agentManifests');
  if (mode === 'production' && productionLoader) return productionLoader();
  return defaultRegistry();
}

/** Read one agent's manifest by id (the primary API). */
export function getAgentManifest(id: string): AgentManifest {
  return loadAgentManifests().get(id);
}
