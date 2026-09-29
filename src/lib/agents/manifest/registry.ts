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
import { assertManifestsWithinLock } from './authorityGate';
import type { AuthorityLockFile } from '@/lib/agents/authority';
import registryJson from './data/agent-manifests.json';
import {
  AgentManifestError,
  ToolNotAllowedError,
  UnknownAgentError,
  type AgentManifest,
  type ManifestDataCapability,
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
  req(
    typeof o.id === 'string' && o.id.length > 0,
    `agents[${idx}].id`,
    'must be a non-empty string'
  );
  req(
    typeof o.version === 'string' && o.version.length > 0,
    `agents[${idx}].version`,
    'must be a version string'
  );
  req(
    typeof o.purpose === 'string' && o.purpose.length > 0,
    `agents[${idx}].purpose`,
    'must be a non-empty string'
  );
  req(
    Array.isArray(o.toolAllowlist) && o.toolAllowlist.every((t) => typeof t === 'string'),
    `agents[${idx}].toolAllowlist`,
    'must be an array of tool-id strings (least privilege: list the minimum)'
  );
  req(
    typeof o.autonomyTier === 'string' && AUTONOMY_TIERS.includes(o.autonomyTier as AutonomyTier),
    `agents[${idx}].autonomyTier`,
    `must be one of ${AUTONOMY_TIERS.join(', ')}`
  );
  req(
    typeof o.escalationPolicyRef === 'string' && o.escalationPolicyRef.length > 0,
    `agents[${idx}].escalationPolicyRef`,
    'must name an escalation policy set'
  );
  req(
    typeof o.phiPosture === 'string' && PHI_POSTURES.includes(o.phiPosture as PhiPosture),
    `agents[${idx}].phiPosture`,
    `must be one of ${PHI_POSTURES.join(', ')}`
  );
  req(
    typeof o.owningModule === 'string' && o.owningModule.length > 0,
    `agents[${idx}].owningModule`,
    'must name the module that owns the agent behavior'
  );
  const manifest: AgentManifest = {
    id: o.id as string,
    version: o.version as string,
    purpose: o.purpose as string,
    toolAllowlist: (o.toolAllowlist as string[]).slice(),
    autonomyTier: o.autonomyTier as AutonomyTier,
    escalationPolicyRef: o.escalationPolicyRef as string,
    phiPosture: o.phiPosture as PhiPosture,
    owningModule: o.owningModule as string,
  };
  if (o.dataCapability !== undefined) {
    manifest.dataCapability = validateDataCapability(o.dataCapability, idx);
  }
  return manifest;
}

/**
 * Validate the declared capability on a LOADED manifest — not only on the ADL
 * definition. `setProductionManifestLoader` installs a store-backed loader whose
 * manifests the compiler never saw, so a validator that only runs at build time
 * is a statement about the repository rather than about the running process.
 */
function validateDataCapability(raw: unknown, idx: number): ManifestDataCapability {
  const at = `agents[${String(idx)}].dataCapability`;
  req(raw !== null && typeof raw === 'object' && !Array.isArray(raw), at, 'must be an object');
  const c = raw as Record<string, unknown>;
  req(
    typeof c.purposeOfUse === 'string' && c.purposeOfUse.length > 0,
    `${at}.purposeOfUse`,
    'must be a non-empty purpose code'
  );
  req(
    Array.isArray(c.dataClasses) &&
      c.dataClasses.every((d) => typeof d === 'string' && d.length > 0),
    `${at}.dataClasses`,
    'must be an array of non-empty data-class codes'
  );
  return {
    purposeOfUse: c.purposeOfUse,
    dataClasses: (c.dataClasses as string[]).slice(),
  };
}

/**
 * Parse + validate a registry data blob, or throw AgentManifestError loudly.
 *
 * There is deliberately NO lock parameter here. `parseRegistry` is a live path —
 * `src/lib/goldenThread/presetRegistry.ts` calls it directly and hands the
 * result to the decision engine — so an override on this function would be a
 * public bypass of the authority ceiling, not a testing convenience. A caller
 * that genuinely needs a different reviewed lock uses
 * `parseRegistryUnderLock`, which application code is forbidden to call and
 * tests/agents/authorityWiring.test.ts enforces.
 */
export function parseRegistry(data: unknown): AgentManifestRegistry {
  return parseRegistryUnderLock(data);
}

/**
 * Parse under an explicit lock. NOT application API — see `parseRegistry`.
 * Exported for the ADL/test paths that must model a widened ceiling, and kept
 * out of the module barrel so it cannot be reached by an ordinary import.
 */
export function parseRegistryUnderLock(
  data: unknown,
  lock?: AuthorityLockFile
): AgentManifestRegistry {
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
  // The authority lock, applied to the manifests actually parsed — not to the
  // definitions they were generated from. A registry that widens an allowlist
  // relative to the reviewed lock refuses to load rather than loading ungoverned.
  assertManifestsWithinLock([...byId.values()], lock);
  return new AgentManifestRegistry(o.version as string, byId);
}

/** An immutable, validated registry keyed by agent id. */
export class AgentManifestRegistry {
  constructor(
    public readonly version: string,
    private readonly byId: Map<string, AgentManifest>
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

/**
 * Load the active registry for the resolved `agentManifests` data mode.
 *
 * The production loader's output is checked AND REBUILT, not merely inspected:
 * a store-backed loader is free to construct an AgentManifestRegistry directly
 * and to answer list() and get() differently, and a security gate a caller can
 * step around by overriding a method is not a gate.
 */
export function loadAgentManifests(): AgentManifestRegistry {
  const mode = getDataMode('agentManifests');
  if (mode === 'production' && productionLoader) {
    const loaded = productionLoader();
    // Rebuild from what was checked. `loaded` is a caller-supplied object whose
    // list() and get() need not agree — a lazy store-backed registry would have
    // the gate inspect a warm cache while callers hit the store. Building a new
    // registry from the verified manifests makes the checked set and the served
    // set the same thing by construction.
    const checked = loaded.list();
    assertManifestsWithinLock(checked);
    return new AgentManifestRegistry(loaded.version, new Map(checked.map((m) => [m.id, m])));
  }
  return defaultRegistry();
}

/** Read one agent's manifest by id (the primary API). */
export function getAgentManifest(id: string): AgentManifest {
  return loadAgentManifests().get(id);
}
