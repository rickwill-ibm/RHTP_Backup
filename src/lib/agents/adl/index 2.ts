/**
 * Agent Definition Language — public surface. An agent is declared once, as
 * configuration; its authority artifacts are generated and gated.
 */
export { CANONICAL_SPEC_VERSION, serializeStable, parseStable } from './canonical';
export { AdlError, type AdlErrorCode } from './errors';
export { parseAgentDefinition, assertUniqueIds } from './schema';
export { assertWithinAuthorityLock } from './authorityLock';
// The lock's PARSER and its integrity rules (`parseAuthorityLockFile`,
// `assertUniqueLockEntries`, `assertNoOrphanLockEntries`) live in
// @/lib/agents/authority — ONE validator for the build-time gate and the
// load-time gate that governs the running process. There is deliberately no
// adl-local re-export of them: a second name for a security rule is how the two
// hand validators of this lock drifted apart in the first place. Build-time
// callers reach them through `loadAuthorityLock` below, or through the authority
// barrel directly.
export { projectManifest, projectRouting, assertUniqueDispatchOrder } from './projections';
export { compile, assertNoDrift, type CompiledArtifacts, type ArtifactVersions } from './adlEngine';
export {
  loadDefinitions,
  loadAuthorityLock,
  loadArtifactVersions,
  type DefinitionSource,
} from './ingest/loadDefinitions';
export {
  CODE_PATTERN,
  AUTONOMY_ORDER,
  PHI_ORDER,
  type AgentDefinition,
  type AgentBody,
  type AgentDataCapability,
  type RouteDefinition,
  type CompiledRoute,
  type CompiledManifestFile,
  type CompiledRoutingFile,
  type AuthorityLockEntry,
  type AuthorityLockFile,
} from './types';
