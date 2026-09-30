// CONTRACT: C-SEAM
// SEAM: agentReasoner     — dataMode('agentReasoner'); production refuses (no provider)
// SEAM: agentMemoryRecall — dataMode('agentMemoryRecall'); production refuses (no read-model)
// SEAM: agentToolBinding  — dataMode('agentToolBinding'); production table ships empty
/**
 * The dataMode resolvers for the three WPCO agent seams.
 *
 * Before this module the seam CONSTRUCTORS existed
 * (`createUnconfiguredReasoner`, `createUnconfiguredRecall`, `resolveBinding`)
 * but nothing chose between mock and production, so "the seam fails closed in
 * production" was a property of a function nobody called. This is the chooser,
 * and it is the thing the governance probers drive.
 *
 * WHY EACH SWITCH IS WRITTEN AS AN EXPLICIT `production` BRANCH.
 * The fail-open shape this repo has been bitten by twice is
 * a nullish-or-falsy default applied to the resolved mode (`getDataMode(seam)`
 * followed by a `mock` fallback operator) — or any resolution where a value
 * that is not recognised lands on the mock path by DEFAULT. Here production is
 * the branch that is named, and it returns the refusing implementation; the mock
 * path is reached only by falling past that named branch. A misconfigured
 * deployment therefore cannot serve a fake by accident.
 *
 * INVARIANT: each seam id appears as a LITERAL `getDataMode('<seam>')` call site,
 *            so tests/governance/seamFailClosed.test.ts's static scan counts this
 *            module as the registered consumer. A computed seam id would read as
 *            an unregistered consumer and the gate would go red.
 * INVARIANT: mock and production return the SAME interface (E15 parity) — the
 *            difference is behavioural refusal, never a different shape.
 */
import { getDataMode } from '@/lib/config/dataMode';
import recordedTranscript from './data/reasoning-transcript.mock.json';
import mockBindingTable from './data/tool-bindings.mock.json';
import productionBindingTable from './data/tool-bindings.production.json';
import {
  createRecordedReasoner,
  createUnconfiguredReasoner,
  type Reasoner,
  type ReasoningTranscript,
} from './reasoner';
import {
  createSeededRecall,
  createUnconfiguredRecall,
  type MemoryRecall,
  type RecalledDecision,
} from './memoryRecall';
import { bindTableForAgent, parseToolBindingTable, type AgentBoundTable } from './toolBindings';

/** The committed mock transcript — the deterministic, replayable reasoning fake. */
export const RECORDED_REASONING_TRANSCRIPT: ReasoningTranscript = recordedTranscript;

/**
 * Resolve the reasoning provider.
 *
 * production → `createUnconfiguredReasoner()`, which rejects every `reason()`
 * call. There is no model provider configured in this deployment and the seam
 * will not substitute the transcript for one.
 */
export function getAgentReasoner(
  transcript: ReasoningTranscript = RECORDED_REASONING_TRANSCRIPT
): Reasoner {
  const mode = getDataMode('agentReasoner');
  if (mode === 'production') return createUnconfiguredReasoner();
  return createRecordedReasoner(transcript);
}

/**
 * Resolve cross-run recall.
 *
 * There is deliberately NO WPCO production consumer of recall, and one must not
 * be invented to make a seam look wired: recall reads through the consent lens,
 * and a caller added for the sake of a gate would be a disclosure path nobody
 * reviewed. Registering the seam and proving the refusal is what makes that
 * absence DECLARED rather than latent — when a real read-model is wired, this
 * resolver is already the only door.
 *
 * `seed` is supplied by the caller so this module invents no member data.
 */
export function getAgentMemoryRecall(seed: readonly RecalledDecision[]): MemoryRecall {
  const mode = getDataMode('agentMemoryRecall');
  if (mode === 'production') return createUnconfiguredRecall();
  return createSeededRecall(seed);
}

/**
 * Resolve the deployment-time tool-binding table, narrowed to one agent's grants.
 *
 * production → `tool-bindings.production.json`, which ships ZERO bindings by
 * design, so the first `resolveBinding()` for any granted tool throws
 * `SeamError('SEAM_NOT_CONFIGURED')`. That is the intended production posture:
 * authority exists in the manifest, plumbing does not exist yet, and the gap
 * fails closed instead of resolving to an in-process fake.
 */
export function getAgentToolBindingTable(
  agentId: string,
  grantedTools: readonly string[]
): AgentBoundTable {
  const mode = getDataMode('agentToolBinding');
  if (mode === 'production') {
    return bindTableForAgent(
      parseToolBindingTable(productionBindingTable, 'tool-bindings.production.json'),
      agentId,
      grantedTools
    );
  }
  return bindTableForAgent(
    parseToolBindingTable(mockBindingTable, 'tool-bindings.mock.json'),
    agentId,
    grantedTools
  );
}
