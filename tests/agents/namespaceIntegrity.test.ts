/**
 * Cross-agent namespace integrity (Iteration 3 convergence, L3).
 *
 * Three agents were built in parallel, so the agent-id / event-type / queue-name
 * vocabulary is named on several independent surfaces:
 *   - agent code constants (OUTREACH_AGENT_ID / REFERRAL_AGENT_ID / PA_AGENT_ID),
 *   - the manifest registry data (data/agent-manifests.json),
 *   - the dispatcher routing data (data/agent-routing.json).
 *
 * `runDispatch` selects a workflow by taskKind (each workflow carries its own
 * agentId constant, which the engine uses for manifest lookup + least privilege),
 * while `route.agentId` in the routing data is display-only. Nothing in the code
 * paths forces those to agree, so a drift (a typo or a rename on one surface) would
 * go unnoticed. This test is the single gate that pins all three surfaces to the
 * same three ids, so a rename on any one surface fails loudly here.
 */
import { describe, it, expect } from 'vitest';
import { OUTREACH_AGENT_ID } from '@/lib/agents/outreach';
import { REFERRAL_AGENT_ID } from '@/lib/agents/referral';
import { PA_AGENT_ID } from '@/lib/agents/pa';
import { loadAgentManifests } from '@/lib/agents/manifest';
import { loadAgentRouting } from '@/lib/agents/dispatch';
import { AGENT_C2_EVENT_TYPES } from '@/lib/agentRuntime';
import { groupByQueue } from '@/lib/goldenThread/workQueueView';

/** taskKind -> the agentId constant the workflow for that kind actually runs under. */
const TASKKIND_TO_CONSTANT: Record<string, string> = {
  outreach: OUTREACH_AGENT_ID,
  referral: REFERRAL_AGENT_ID,
  pa: PA_AGENT_ID,
};

describe('cross-agent namespace integrity', () => {
  it('the three agent-id surfaces (constants / manifests / routing) name the same ids', () => {
    const manifestIds = new Set(loadAgentManifests().ids());
    const constants = new Set(Object.values(TASKKIND_TO_CONSTANT));

    // Exactly three pre-allocated ids, no more, no fewer.
    expect(manifestIds.size).toBe(3);
    expect([...manifestIds].sort()).toEqual([...constants].sort());

    // Every routing agentId is a real manifest id (no orphan/typo route).
    for (const route of loadAgentRouting().routes) {
      expect(manifestIds.has(route.agentId)).toBe(true);
    }
  });

  it('each route\'s display agentId agrees with the workflow its taskKind actually starts', () => {
    // Closes the "route.agentId is display-only, never cross-checked" gap: the id
    // shown in the demo projection must be the id the engine governs the run under.
    for (const route of loadAgentRouting().routes) {
      const expected = TASKKIND_TO_CONSTANT[route.taskKind];
      expect(expected, `no constant for taskKind ${route.taskKind}`).toBeDefined();
      expect(route.agentId).toBe(expected);
    }
  });

  it('the five C2 agent-task event types are exactly the pre-allocated set', () => {
    expect([...AGENT_C2_EVENT_TYPES].sort()).toEqual(
      [
        'agent.task.approved',
        'agent.task.escalated',
        'agent.task.executed',
        'agent.task.proposed',
        'agent.task.rejected',
      ].sort(),
    );
    // No duplicates.
    expect(new Set(AGENT_C2_EVENT_TYPES).size).toBe(AGENT_C2_EVENT_TYPES.length);
  });

  it('the two agent work-queue names are defined once in the shared QueueName vocabulary', () => {
    // groupByQueue is keyed by the single QueueName union; the agent queues must be
    // present there (reuse of the goldenThread inbox), not a second queue system.
    const groups = groupByQueue([]);
    expect(Object.keys(groups)).toContain('agent-proposal');
    expect(Object.keys(groups)).toContain('escalated');
  });
});
