/**
 * probers.agentSeams.ts — the fail-closed probers for the three WPCO agent seams.
 *
 * Registered into the `PROBERS` table in seamFailClosed.test.ts, which is at 493
 * of its 500-line cap; the probers therefore live here and are spread in.
 *
 * WHAT A HONEST PROBER HAS TO DO (E1). Calling `createUnconfiguredReasoner()`
 * directly and asserting it rejects proves only that a constructor this repo
 * already unit-tests still works. It says nothing about whether PRODUCTION
 * reaches that constructor — which is exactly the dead-wiring class the gate
 * exists to catch. So every prober below goes through the dataMode RESOLVER
 * (`getAgentReasoner` / `getAgentMemoryRecall` / `getAgentToolBindingTable`) with
 * the seam pinned to `production`, and asserts the refusal comes back from that
 * path. Each then pins the seam to `mock` and asserts the same call SUCCEEDS, so
 * the throw is proven production-specific rather than a blanket break.
 *
 * Each prober also asserts the SeamError CODE, not merely the class: `SeamError`
 * covers shape and PHI refusals too, and "it threw something" is not the proof
 * that the seam is unconfigured.
 */
import { expect } from 'vitest';
import { setSessionDataMode, type DataModeSeam } from '@/lib/config/dataMode';
import { SeamError, resolveBinding } from '@/lib/agents/seams';
import type { RecalledDecision, ReasoningRequest, RecallScope } from '@/lib/agents/seams';
import {
  getAgentMemoryRecall,
  getAgentReasoner,
  getAgentToolBindingTable,
} from '@/lib/agents/seams/resolve';

/** The request the reasoner prober sends. PHI-safe: references and codes only. */
const REASONING_REQUEST: ReasoningRequest = {
  promptId: 'wpco.outreach-priority',
  promptVersion: '1.0.0',
  promptText: 'probe',
  templateHash: `sha256:${'0'.repeat(64)}`,
  refs: { memberRef: 'Patient/probe-1' },
  readableTools: ['person-context.read'],
};

/** A seeded prior decision for the recall prober. Codes only, never free text. */
const SEEDED_DECISION: RecalledDecision = {
  proposalId: 'prop-probe-1',
  actionType: 'outreach.contact',
  decision: 'approved',
  reasonCode: 'reviewer-approved',
  decidedAtMs: 1_700_000_000_000,
  part2Sourced: false,
  owningModule: 'agents/outreach',
};

const RECALL_SCOPE: RecallScope = {
  memberId: 'probe-1',
  consentScope: 'care-coordination',
  breadth: 'owning-module',
  callerModule: 'agents/outreach',
};

/** Assert a rejected promise carried a SeamError with the expected code. */
async function expectSeamRefusal(work: Promise<unknown>, code: string): Promise<void> {
  let caught: unknown;
  try {
    await work;
  } catch (err) {
    caught = err;
  }
  // The assertion IS the handling: a resolved promise leaves `caught` undefined
  // and fails here, so a seam that quietly succeeded cannot pass as a refusal.
  expect(caught, 'the production seam resolved instead of refusing').toBeInstanceOf(SeamError);
  expect((caught as SeamError).code).toBe(code);
}

/**
 * The agent-seam probers, spread into the PROBERS registry. Typed against
 * DataModeSeam so a seam id that is not registered fails to compile here.
 */
export const AGENT_SEAM_PROBERS: Partial<Record<DataModeSeam, () => Promise<void>>> = {
  agentReasoner: async () => {
    setSessionDataMode('agentReasoner', 'production');
    // Driven through the RESOLVER, not the constructor: this is what proves
    // production reaches the refusing implementation.
    await expectSeamRefusal(getAgentReasoner().reason(REASONING_REQUEST), 'SEAM_NOT_CONFIGURED');
    setSessionDataMode('agentReasoner', 'mock');
    const recorded = await getAgentReasoner().reason(REASONING_REQUEST);
    // mock is the committed deterministic transcript — replayable, not fabricated.
    expect(recorded.producedBy.modelId).toBe('recorded-transcript');
    expect(Object.keys(recorded.suggestedRefs).length).toBeGreaterThan(0);
  },

  agentMemoryRecall: async () => {
    setSessionDataMode('agentMemoryRecall', 'production');
    await expectSeamRefusal(
      getAgentMemoryRecall([SEEDED_DECISION]).recall(RECALL_SCOPE, 0, 1_700_000_001_000),
      'SEAM_NOT_CONFIGURED'
    );
    setSessionDataMode('agentMemoryRecall', 'mock');
    const released = await getAgentMemoryRecall([SEEDED_DECISION]).recall(
      RECALL_SCOPE,
      0,
      1_700_000_001_000
    );
    expect(released.map((d) => d.proposalId)).toEqual(['prop-probe-1']);
    expect(released.every((d) => d.part2Disclosed === false)).toBe(true);
  },

  agentToolBinding: async () => {
    const agentId = 'outreach-agent';
    const granted = ['person-context.read'];
    setSessionDataMode('agentToolBinding', 'production');
    // production ships an EMPTY binding table by design: a granted tool with no
    // binding must refuse, never resolve to the in-process mock handler.
    const prod = getAgentToolBindingTable(agentId, granted);
    let code: string | undefined;
    try {
      resolveBinding(prod, 'person-context.read');
    } catch (err) {
      expect(err).toBeInstanceOf(SeamError);
      code = (err as SeamError).code;
    }
    expect(code, 'production resolveBinding must refuse an unbound granted tool').toBe(
      'SEAM_NOT_CONFIGURED'
    );
    setSessionDataMode('agentToolBinding', 'mock');
    const mock = getAgentToolBindingTable(agentId, granted);
    expect(resolveBinding(mock, 'person-context.read').kind).toBe('in-process');
  },
};
