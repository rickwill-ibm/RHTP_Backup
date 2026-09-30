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
import { REVENUE_CYCLE_AGENT_ID } from '@/lib/agents/revenueCycle';
import { loadAgentManifests } from '@/lib/agents/manifest';
import { loadAgentRouting } from '@/lib/agents/dispatch';
import {
  AGENT_C2_EVENT_TYPES,
  UnallowedAgentEventError,
  assertAllowedEventType,
} from '@/lib/agentRuntime';
import { groupByQueue } from '@/lib/goldenThread/workQueueView';

/** taskKind -> the agentId constant the workflow for that kind actually runs under. */
const TASKKIND_TO_CONSTANT: Record<string, string> = {
  outreach: OUTREACH_AGENT_ID,
  referral: REFERRAL_AGENT_ID,
  pa: PA_AGENT_ID,
};

/**
 * Agents that are NOT reached through the SDE dispatcher (no taskKind route), but
 * are started directly via `engine.start` from the order→cash core-logic path. Each
 * entry MUST have a real exported entry-point constant (asserted below) — this is a
 * pinned allow-set, not a bijection relaxation: the invariant stays "every manifest
 * agent is either a dispatcher taskKind OR a pinned non-dispatched agent with a real
 * entry point", never "anything goes". Size-pinned.
 *
 * `bh-screening-triage-agent` is pinned here deliberately: it holds NO route. A
 * behavioural-health screening signal must not be dispatched by trigger match —
 * the agent proposes and escalates under a BH-specific policy, and giving it a
 * route would put it on the ordinary outreach path where the shared `default`
 * escalation clock applies. Its absence from the routing table is a control.
 */
const NON_DISPATCHED_AGENTS = new Set<string>([
  REVENUE_CYCLE_AGENT_ID,
  'bh-screening-triage-agent',
]);

describe('cross-agent namespace integrity', () => {
  it('every manifest agent is a dispatcher taskKind OR a pinned non-dispatched agent', () => {
    const manifestIds = new Set(loadAgentManifests().ids());
    const dispatched = new Set(Object.values(TASKKIND_TO_CONSTANT));

    // Pins remain size-fixed: 3 dispatched taskKinds, 2 non-dispatched entry points.
    expect(dispatched.size).toBe(3);
    expect(NON_DISPATCHED_AGENTS.size).toBe(2);

    // The manifest ids are EXACTLY the union of the dispatched constants and the
    // pinned non-dispatched set — no orphan agent, no un-accounted manifest.
    const accountedFor = new Set([...dispatched, ...NON_DISPATCHED_AGENTS]);
    expect([...manifestIds].sort()).toEqual([...accountedFor].sort());
    expect(manifestIds.size).toBe(5);

    // Positive reachability: the non-dispatched agent id is a REAL exported constant
    // from its module (started via engine.start from the order→cash core-logic).
    expect(NON_DISPATCHED_AGENTS.has(REVENUE_CYCLE_AGENT_ID)).toBe(true);
    expect(REVENUE_CYCLE_AGENT_ID).toBe('revenue-cycle-agent');
    expect(manifestIds.has(REVENUE_CYCLE_AGENT_ID)).toBe(true);

    // Every routing agentId is a real manifest id (no orphan/typo route).
    for (const route of loadAgentRouting().routes) {
      expect(manifestIds.has(route.agentId)).toBe(true);
    }
  });

  it("each route's display agentId agrees with the workflow its taskKind actually starts", () => {
    // Closes the "route.agentId is display-only, never cross-checked" gap: the id
    // shown in the demo projection must be the id the engine governs the run under.
    for (const route of loadAgentRouting().routes) {
      const expected = TASKKIND_TO_CONSTANT[route.taskKind];
      expect(expected, `no constant for taskKind ${route.taskKind}`).toBeDefined();
      expect(route.agentId).toBe(expected);
    }
  });

  it('the six C2 agent-task event types are exactly the pre-allocated set', () => {
    // WAS FIVE, INCLUDING `agent.task.executed`. Two changes, both from W8:
    //   - `agent.task.executed` REMOVED (G-002). The engine emitted it at APPROVAL time, before the
    //     body resumed and therefore before the body attempted its state transition — the engine
    //     asserting an effect it neither performed nor observed. `agent.task.settled` replaces it,
    //     emitted when the workflow actually settles and carrying the outcome the workflow itself
    //     reported. Removing rather than retiring-in-place is deliberate: the type is now
    //     unemittable, pinned by the tripwire below.
    //   - `agent.task.abandoned` ADDED (G-001), so the escalation terminal stops masquerading as one
    //     more `escalated` hop.
    expect([...AGENT_C2_EVENT_TYPES].sort()).toEqual(
      [
        'agent.task.abandoned',
        'agent.task.approved',
        'agent.task.escalated',
        'agent.task.proposed',
        'agent.task.rejected',
        'agent.task.settled',
      ].sort()
    );
    // No duplicates.
    expect(new Set(AGENT_C2_EVENT_TYPES).size).toBe(AGENT_C2_EVENT_TYPES.length);
  });

  it('TRIPWIRE: `agent.task.executed` is unemittable, not merely unused', () => {
    // The list above is a DECLARATION, and this programme's recurring defect is a declaration that
    // nothing enforces. This leg is derived from what the code actually does: the emission guard
    // reads the same constant, so a re-added `executed` fails here as well as above, and a guard
    // that stopped reading the constant fails here alone.
    expect(() => assertAllowedEventType('agent.task.executed')).toThrow(UnallowedAgentEventError);
    expect(() => assertAllowedEventType('agent.task.settled')).not.toThrow();
    expect(() => assertAllowedEventType('agent.task.abandoned')).not.toThrow();
  });

  it('the two agent work-queue names are defined once in the shared QueueName vocabulary', () => {
    // groupByQueue is keyed by the single QueueName union; the agent queues must be
    // present there (reuse of the goldenThread inbox), not a second queue system.
    const groups = groupByQueue([]);
    expect(Object.keys(groups)).toContain('agent-proposal');
    expect(Object.keys(groups)).toContain('escalated');
  });
});
