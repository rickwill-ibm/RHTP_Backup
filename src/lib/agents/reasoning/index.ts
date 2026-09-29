/**
 * Bounded reasoning — public surface.
 *
 * Reasoning is an EFFECT inside one workflow step: it proposes typed facts and
 * tool requests, never calls a tool, is attributed to a content-hashed template,
 * and is idempotent per (workflowId, stepId).
 */
export {
  runReasoningStep,
  ReasoningBoundaryError,
  type ReasoningStepInput,
  type ReasoningStepDeps,
  type ReasoningStepResult,
} from './reasoningStep';
export {
  assertBindingIntact,
  createPromptRegistry,
  provenanceSourceId,
  PromptIntegrityError,
  type Digest,
  type PromptBinding,
  type PromptRegistry,
  type PromptTemplate,
} from './promptRegistry';
export {
  createReasoningLedger,
  ReasoningDivergenceError,
  type LedgerOutcome,
  type ReasoningLedger,
  type ReasoningStepKey,
} from './reasoningLedger';
