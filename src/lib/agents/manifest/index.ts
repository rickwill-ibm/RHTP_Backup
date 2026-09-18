// SEAM: agentManifests  (dataMode)
/**
 * Agent manifest registry — public surface (conventions §10.2). Manifests are
 * versioned data; nothing about an agent's authority is implicit in code.
 */
export type { AgentManifest, AgentManifestRegistryData, AutonomyTier, PhiPosture } from './types';
export { AgentManifestError, UnknownAgentError, ToolNotAllowedError } from './types';
export {
  AgentManifestRegistry,
  parseRegistry,
  defaultRegistry,
  loadAgentManifests,
  getAgentManifest,
  setProductionManifestLoader,
} from './registry';
