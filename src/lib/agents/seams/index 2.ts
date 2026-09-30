/** Agent seams — authority is decided at build time; binding at deployment time. */
export { SeamError, type SeamErrorCode } from './errors';
export {
  parseToolBindingTable,
  assertBindingsWithinGrants,
  assertAllGrantsBound,
  bindTableForAgent,
  resolveBinding,
  type AgentBoundTable,
  assertMcpToolConforms,
  canonicalAdvertisedTool,
} from './toolBindings';
export {
  createRecordedReasoner,
  createUnconfiguredReasoner,
  type Reasoner,
  type ReasoningRequest,
  type ReasoningOutput,
  type ReasoningTranscript,
} from './reasoner';
export {
  createSeededRecall,
  createUnconfiguredRecall,
  applyPart2Filter,
  isPart2BasisValid,
  type MemoryRecall,
  type RecallScope,
  type RecalledDecision,
  type DisclosedDecision,
  type Part2Basis,
} from './memoryRecall';
export type {
  SeamMode,
  ProviderKind,
  ToolBinding,
  ToolBindingTable,
  InProcessBinding,
  TypedClientBinding,
  McpBinding,
  AdvertisedToolDefinition,
} from './types';
