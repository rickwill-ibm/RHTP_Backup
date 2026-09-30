// SEAM: agentReasoner · agentToolBinding  (resolved in lib/agents/seams/resolve.ts)
/**
 * The bounded-reasoning probe CHAIN, split out of `route.ts` so each file stays
 * inside the §2 cap and has one job: this module runs the governed chain and
 * returns what every control did; the route owns authz, audit and the HTTP shape.
 * It is a sibling helper beside its only caller (the house pattern —
 * cf. `src/app/api/recovery/[id]/recoveryGuards.ts`), not a shared library.
 *
 * EVERY FUNCTION HERE MAY THROW, deliberately: a drifted template
 * (`PromptIntegrityError`), an unloadable manifest, a malformed binding table, a
 * refusing seam (`SeamError`). The route calls `runProbe` inside a try and audits
 * every one of them — that is why the chain is assembled in ONE function rather
 * than left to a caller to sequence and half-cover.
 */
import { log } from '@/lib/server/log';
import * as clock from '@/lib/clock';
import { getAgentManifest } from '@/lib/agents/manifest';
import {
  createPromptRegistry,
  createReasoningLedger,
  runReasoningStep,
  type PromptBinding,
  type PromptTemplate,
  type ReasoningStepResult,
} from '@/lib/agents/reasoning';
import { nodeDigest } from '@/lib/agents/reasoning/nodeDigest';
import promptTemplates from '@/lib/agents/reasoning/data/prompt-templates.json';
import { SeamError, resolveBinding } from '@/lib/agents/seams';
import { getAgentReasoner, getAgentToolBindingTable } from '@/lib/agents/seams/resolve';
import { assertAdverseEligible, ModelSourcedFactRefused } from '@/lib/agents/provenance';

export const AGENT_ID = 'outreach-agent';
export const PROMPT_ID = 'wpco.outreach-priority';
export const PROMPT_VERSION = '1.0.0';
const MAX_TOOL_REQUESTS = 3;
const MAX_SUGGESTED_REFS = 8;

/**
 * The step's inputs. This is an OPS self-test surface, not a member-facing path:
 * the reference is a demo id, so nothing here needs a consent decision.
 */
const DEMO_REFS: Readonly<Record<string, string>> = Object.freeze({
  memberRef: 'Patient/demo-1',
  programRef: 'PlanDefinition/wpco-outreach',
});

/**
 * Read-only by the tool id itself. Every ADL tool id ends in a dotted verb, and
 * `.read` is the read-only verb — so the predicate is driven by the vocabulary
 * rather than by a hand-kept per-tool table that would silently diverge from the
 * manifest when a tool is added.
 */
const isReadOnlyTool = (tool: string): boolean => tool.endsWith('.read');

const TEMPLATES: readonly PromptTemplate[] = promptTemplates.templates;

export interface TaintVerdict {
  refused: boolean;
  error?: string;
  factName?: string;
  sourceId?: string;
  unresolvedAncestor?: string;
}

/**
 * Run the adverse-eligibility gate and report what it did. A refusal is the
 * EXPECTED outcome for model-origin facts, so it is returned as a value; only an
 * unexpected error type propagates.
 */
function runModelTaintGate(facts: ReasoningStepResult['facts']): TaintVerdict {
  try {
    assertAdverseEligible(facts);
    log.warn('agents.reasoning.taint_gate_passed', { factCount: Object.keys(facts).length });
    return { refused: false };
  } catch (err) {
    if (err instanceof ModelSourcedFactRefused) {
      log.info('agents.reasoning.taint_gate_refused', {
        factName: err.factName,
        sourceId: err.sourceId,
      });
      return {
        refused: true,
        error: err.name,
        factName: err.factName,
        sourceId: err.sourceId,
        ...(err.unresolvedAncestor !== undefined
          ? { unresolvedAncestor: err.unresolvedAncestor }
          : {}),
      };
    }
    throw err;
  }
}

export interface BindingDisposition {
  tool: string;
  disposition: 'bound' | 'refused';
  providerKind?: string;
  code?: string;
}

/**
 * What would happen if the workflow tried to invoke each requested tool. The
 * reasoner returns tool REQUESTS, never calls; this shows the deployment-time
 * binding seam's answer without performing a single effect.
 */
function describeBindings(
  tools: readonly string[],
  grantedTools: readonly string[]
): BindingDisposition[] {
  const bound = getAgentToolBindingTable(AGENT_ID, grantedTools);
  return tools.map((tool) => {
    try {
      return {
        tool,
        disposition: 'bound' as const,
        providerKind: resolveBinding(bound, tool).kind,
      };
    } catch (err) {
      if (err instanceof SeamError) {
        log.info('agents.reasoning.binding_refused', { tool, code: err.code });
        return { tool, disposition: 'refused' as const, code: err.code };
      }
      throw err;
    }
  });
}

/**
 * Run the one bounded step. `runId` keys the ledger and is SERVER-MINTED by the
 * caller — never an inbound header, which a client controls.
 *
 * The ledger is per-REQUEST, which is deliberate and a real limitation: this
 * surface can only ever report `recorded`, never `replayed`. Proving replay needs a
 * ledger scoped to a durable run, which is a workflow-runtime binding and not
 * something a probe route should invent.
 */
function runStep(
  binding: PromptBinding,
  grantedTools: readonly string[],
  runId: string
): Promise<ReasoningStepResult> {
  return runReasoningStep(
    {
      binding,
      stepKey: { workflowId: runId, stepId: 'ops-reasoning-probe' },
      refs: DEMO_REFS,
      offeredTools: grantedTools.filter(isReadOnlyTool),
    },
    {
      reasoner: getAgentReasoner(),
      grantedTools,
      isReadOnlyTool,
      maxToolRequests: MAX_TOOL_REQUESTS,
      maxSuggestedRefs: MAX_SUGGESTED_REFS,
      nowMs: clock.now(),
      ledger: createReasoningLedger(),
      digest: nodeDigest,
    }
  );
}

/** Everything one probe produced, so every step of it sits inside ONE try. */
export interface ProbeRun {
  binding: PromptBinding;
  step: ReasoningStepResult;
  modelTaintGate: TaintVerdict;
  toolBindings: BindingDisposition[];
}

/**
 * The whole governed chain, in one call. Prompt resolution, manifest load and
 * binding description are HERE rather than left above the caller's try, because
 * each of them throws and outside a try each became an unaudited framework 500.
 */
export async function runProbe(runId: string): Promise<ProbeRun> {
  // Eager verification: a committed template whose text no longer matches its
  // reviewed pin refuses HERE, before any provider is reached.
  const binding = createPromptRegistry(TEMPLATES, nodeDigest).resolve(PROMPT_ID, PROMPT_VERSION);
  const grantedTools = getAgentManifest(AGENT_ID).toolAllowlist;
  const step = await runStep(binding, grantedTools, runId);
  return {
    binding,
    step,
    modelTaintGate: runModelTaintGate(step.facts),
    toolBindings: describeBindings(step.toolRequests, grantedTools),
  };
}
