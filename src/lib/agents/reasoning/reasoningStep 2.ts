// CONTRACT: C-REASON  // SEAM: reasoner
/**
 * The bounded reasoning step.
 *
 * Model reasoning runs INSIDE one workflow step, as a recorded activity. This
 * module is the boundary around it. It enforces, in order:
 *
 *   1. the step may only offer READ-ONLY tools to the reasoner, and only tools
 *      the agent's manifest already grants;
 *   2. the reasoner returns tool REQUESTS, never tool calls — the workflow
 *      invokes them through `ctx.useTool` -> `assertToolAllowed`;
 *   3. a hard request budget, so a loop cannot become a storm;
 *   4. everything the reasoner produced is stamped `origin: 'model'`, so the
 *      adverse-determination path refuses it by construction.
 *
 * INVARIANT: this module never calls a tool and never proposes an action.
 * INVARIANT: every fact it returns carries origin 'model' and the prompt id that
 *            produced it — a model-shaped fact can never masquerade as a
 *            system-of-record fact.
 * INVARIANT: a requested tool outside the offered read-only set is refused, not
 *            filtered, so the refusal is visible in an audit.
 */
import { serializeStable } from '@/lib/agents/adl';
import type { Reasoner, ReasoningOutput } from '@/lib/agents/seams';
import type { ProvenancedFact } from '@/lib/agents/provenance/factProvenance';
import {
  assertBindingIntact,
  provenanceSourceId,
  type Digest,
  type PromptBinding,
} from './promptRegistry';
import type { ReasoningLedger, ReasoningStepKey, LedgerOutcome } from './reasoningLedger';

/**
 * A suggested fact key must be a plain camelCase identifier. This is not the tool
 * CODE_PATTERN — a fact name is an identifier, not a dotted tool id. The shape
 * alone excludes `__proto__`; the denylist covers the other prototype keys, which
 * would otherwise let a suggested fact mutate the prototype instead of creating an
 * own property, hiding it from `Object.entries` and therefore from the adverse gate.
 */
const FACT_KEY_PATTERN = /^[a-z][A-Za-z0-9]*$/;
/**
 * Every enumerable-shadowing name on Object.prototype, not a sample of them.
 * `facts` is built on a null prototype, so none of these is dangerous there —
 * but it is returned as a plain Record, and the first downstream spread into an
 * ordinary object (`{ ...facts, ...other }`) would shadow the real method. A
 * denylist that stops at three names does not implement the reason given for
 * having one.
 */
const FACT_KEY_DENYLIST: ReadonlySet<string> = new Set([
  'constructor',
  'prototype',
  'valueOf',
  'toString',
  'toLocaleString',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
]);

function isSafeFactKey(name: string): boolean {
  return FACT_KEY_PATTERN.test(name) && !FACT_KEY_DENYLIST.has(name);
}

/** Raised when a reasoning step breaches its boundary. Always fails closed. */
export class ReasoningBoundaryError extends Error {
  constructor(
    public readonly reason:
      | 'tool-not-offered'
      | 'tool-not-granted'
      | 'write-tool-offered'
      | 'request-budget-exceeded'
      | 'fact-budget-exceeded'
      | 'fact-key-not-a-code'
      | 'attribution-mismatch',
    detail: string
  ) {
    super(`[${reason}] ${detail}`);
    this.name = 'ReasoningBoundaryError';
  }
}

/** What the workflow gives the step. All of it is PHI-safe: refs and codes. */
export interface ReasoningStepInput {
  /**
   * The template this step runs under, resolved through the prompt registry, so
   * it carries the digest of the exact text — not merely the version claiming to
   * be that text. The digest goes into the activity input and into provenance.
   */
  binding: PromptBinding;
  /**
   * Identifies this activity within this run. Reasoning is retried like any
   * activity, and a retry that reasons differently is a governance event, so
   * the step needs a key to recognise its own second call.
   */
  stepKey: ReasoningStepKey;
  refs: Readonly<Record<string, string>>;
  /** Read-only tools this step offers the reasoner. Must be granted and read-only. */
  offeredTools: readonly string[];
}

/** The injected boundary configuration. No clock, no IO of its own. */
export interface ReasoningStepDeps {
  reasoner: Reasoner;
  /** The agent's manifest allowlist — the authority the step cannot exceed. */
  grantedTools: readonly string[];
  /** Predicate deciding whether a tool id is read-only. Data-driven, not hardcoded. */
  isReadOnlyTool: (tool: string) => boolean;
  /** Maximum tool requests a single step may return. */
  maxToolRequests: number;
  /** Maximum suggested facts a single step may return. */
  maxSuggestedRefs: number;
  /** Deterministic timestamp supplied by the caller (never read here). */
  nowMs: number;
  /** Records the first result per step key and refuses a divergent retry. */
  ledger: ReasoningLedger;
  /** Digest over the canonical output; MUST return sha256:<64 hex>. */
  digest: Digest;
}

/** What the step hands back to the workflow. Facts, not actions. */
export interface ReasoningStepResult {
  /** Model-origin facts, ready to be gated by the adverse-eligibility check. */
  facts: Readonly<Record<string, ProvenancedFact<string>>>;
  /** Tools the workflow should now invoke through its own gate. */
  toolRequests: readonly string[];
  producedBy: ReasoningOutput['producedBy'];
  /** 'recorded' on the first call for this key, 'replayed' on an identical retry. */
  outcome: LedgerOutcome;
  /** The digest this step was recorded under, for the evidence entry. */
  resultDigest: string;
}

/** Refuse an offered set that is not read-only or not granted. */
function assertOfferable(input: ReasoningStepInput, deps: ReasoningStepDeps): void {
  const granted = new Set(deps.grantedTools);
  for (const tool of input.offeredTools) {
    if (!granted.has(tool)) {
      throw new ReasoningBoundaryError(
        'tool-not-granted',
        `"${tool}" is not in the agent's manifest allowlist`
      );
    }
    if (!deps.isReadOnlyTool(tool)) {
      throw new ReasoningBoundaryError(
        'write-tool-offered',
        `"${tool}" is not read-only; a reasoning step may only be offered reads`
      );
    }
  }
}

/** Refuse a returned request outside the offered set, or over budget. */
function assertRequestsWithinBounds(
  requests: readonly string[],
  input: ReasoningStepInput,
  deps: ReasoningStepDeps
): void {
  if (requests.length > deps.maxToolRequests) {
    throw new ReasoningBoundaryError(
      'request-budget-exceeded',
      `${String(requests.length)} requests exceeds the budget of ${String(deps.maxToolRequests)}`
    );
  }
  const offered = new Set(input.offeredTools);
  for (const tool of requests) {
    if (!offered.has(tool)) {
      throw new ReasoningBoundaryError(
        'tool-not-offered',
        `the reasoner requested "${tool}", which this step did not offer`
      );
    }
  }
}

/**
 * Refuse output that misattributes itself. `producedBy` is self-reported, so a
 * swapped or injected reasoner could otherwise label model facts with another
 * prompt's identity in the record a hearing officer reads.
 */
function assertAttribution(output: ReasoningOutput, input: ReasoningStepInput): void {
  const p = output.producedBy;
  const b = input.binding;
  if (p.promptId !== b.promptId || p.promptVersion !== b.promptVersion) {
    throw new ReasoningBoundaryError(
      'attribution-mismatch',
      `reasoner reported ${p.promptId}@${p.promptVersion}, step ran ` +
        `${b.promptId}@${b.promptVersion}`
    );
  }
}

/**
 * The digest the ledger compares. It covers what the reasoner PRODUCED and the
 * template it produced it under: an identical answer from a different template
 * version is still a different result, because the record must name the text
 * that produced it.
 */
function resultDigestOf(
  output: ReasoningOutput,
  input: ReasoningStepInput,
  digest: Digest
): string {
  return digest(
    serializeStable({
      // INPUTS. Without these, idempotency is not reproducibility: the same
      // stepId run over a different member, or offering different tools, would
      // 'replay' clean whenever the answer happened to match — and the record
      // would assert that reasoning about member B reproduced reasoning about
      // member A.
      stepKey: input.stepKey,
      refs: input.refs,
      offeredTools: [...input.offeredTools].sort(),
      templateHash: input.binding.templateHash,
      // OUTPUTS.
      producedBy: output.producedBy,
      suggestedRefs: output.suggestedRefs,
      toolRequests: output.toolRequests,
    })
  );
}

/**
 * Run the step. Returns model-origin facts and gated tool requests; it never
 * calls a tool and never builds a ProposedAction.
 */
export async function runReasoningStep(
  input: ReasoningStepInput,
  deps: ReasoningStepDeps
): Promise<ReasoningStepResult> {
  assertOfferable(input, deps);

  // The text about to be sent is hashed again here, at the last point under
  // this module's control, so the digest recorded in provenance describes the
  // words the provider actually received — not a template the registry checked
  // and then nobody used.
  assertBindingIntact(input.binding, deps.digest);

  const output = await deps.reasoner.reason({
    promptId: input.binding.promptId,
    promptVersion: input.binding.promptVersion,
    promptText: input.binding.text,
    templateHash: input.binding.templateHash,
    refs: input.refs,
    readableTools: input.offeredTools,
  });

  assertRequestsWithinBounds(output.toolRequests, input, deps);

  assertAttribution(output, input);

  // EVERY validation runs before the ledger is written. Recording first and
  // validating after is wrong in both directions: an output that then fails a
  // bounds check would poison the key, wedging the step so that every later
  // legitimate retry diverges against a digest the system itself rejected; and
  // an output that fails a check BEFORE the ledger is reached could be retried
  // without bound until one happened to pass, making the 'first' recorded
  // result merely the first lucky one.
  const entries = Object.entries(output.suggestedRefs);
  if (entries.length > deps.maxSuggestedRefs) {
    throw new ReasoningBoundaryError(
      'fact-budget-exceeded',
      `${String(entries.length)} suggested facts exceeds the budget of ${String(deps.maxSuggestedRefs)}`
    );
  }
  for (const [name] of entries) {
    if (!isSafeFactKey(name)) {
      throw new ReasoningBoundaryError(
        'fact-key-not-a-code',
        `suggested fact key "${name}" is not a safe camelCase identifier`
      );
    }
  }

  // Only now, with the output fully validated, does it become the record.
  const resultDigest = resultDigestOf(output, input, deps.digest);
  const outcome = deps.ledger.submit(input.stepKey, resultDigest);

  // Object.create(null): a suggested key of "__proto__" would otherwise set the
  // prototype instead of an own property — the fact would vanish from
  // Object.entries (so the adverse gate would never see it) while still
  // resolving through the poisoned prototype.
  const facts = Object.create(null) as Record<string, ProvenancedFact<string>>;
  for (const [name, value] of entries) {
    facts[name] = {
      value,
      // Attribution is stamped from the STEP's input, never from what the
      // reasoner claims about itself.
      origin: 'model',
      sourceId: provenanceSourceId(input.binding),
      observedAtMs: deps.nowMs,
    };
  }

  return {
    facts,
    toolRequests: output.toolRequests,
    producedBy: output.producedBy,
    outcome,
    resultDigest,
  };
}
