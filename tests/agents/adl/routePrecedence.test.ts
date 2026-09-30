/**
 * ROUTE PRECEDENCE IS BEHAVIOUR, NOT PRESENTATION.
 *
 * The dispatcher resolves a signal with `routes.find(...)` — first match wins.
 * An earlier version of the projection ordered the compiled routes by AGENT ID,
 * which silently reordered the shipped routing table. It changed nothing at the
 * time only because the two prefixes in play happened to be disjoint; renaming
 * an unrelated agent would have re-prioritised routing with no diff in any
 * behavioural test.
 *
 * These tests close that hole from both ends: the compiled array must follow
 * the AUTHORED dispatchOrder, and an actually-overlapping pair must resolve by
 * that order through the real loader and the real router.
 */
import { describe, it, expect } from 'vitest';
import {
  routeBatch,
  parseAgentRouting,
  loadAgentRouting,
  type DisclosureGateDeps,
} from '@/lib/agents/dispatch';
import { createDisclosureLedger } from '@/lib/agents/disclosure';
import { taxonomyClassFloor } from '@/lib/sde';
import { projectRouting, assertUniqueDispatchOrder } from '@/lib/agents/adl/projections';
import { AdlError } from '@/lib/agents/adl/errors';
import type { AgentDefinition, RouteDefinition } from '@/lib/agents/adl/types';
import type { Disposition, DispositionBatch, MemberContext, Signal } from '@/lib/sde';

function def(id: string, routes: RouteDefinition[]): AgentDefinition {
  return {
    id,
    version: '1.0.0',
    purpose: 'fixture',
    autonomyTier: 'HITL',
    escalationPolicyRef: 'default',
    phiPosture: 'references-only',
    owningModule: `src/lib/agents/${id}`,
    toolAllowlist: ['work-queue.submit'],
    routes,
    body: { kind: 'module', owningModule: `src/lib/agents/${id}` },
  };
}

function referralRoute(id: string, prefix: string, dispatchOrder: number): RouteDefinition {
  return { id, taskKind: 'referral', dispatchOrder, match: { kindPrefix: prefix } };
}

function sig(memberId: string, signalId: string, kind: string): Signal {
  return {
    signalId,
    memberId,
    kind,
    sourceEventType: kind,
    occurredAtMs: 0,
    priority: 'high',
    actionability: 'care-team-task',
    foldBehavior: 'immediate',
    dedupeKey: `${kind}:${memberId}:${signalId}`,
    part2Restricted: false,
    refs: { referral: 'ref/1' },
  };
}

function act(signalId: string, memberId: string): Disposition {
  return {
    signalId,
    memberId,
    action: 'act',
    policyIds: ['r/1'],
    decidedAtMs: 0,
    touchpointId: `tp:${signalId}`,
    channel: 'task',
    priorityScore: 5,
  };
}

function batchFor(signals: Signal[]): DispositionBatch {
  return {
    memberId: 'm1',
    foldWindowId: 'fw',
    decidedAtMs: 0,
    dispositions: signals.map((s) => act(s.signalId, s.memberId)),
    touchpoints: [],
    delayBundles: [],
    summary: { approved: signals.length, suppressed: 0, delayed: 0, touchpoints: 0 },
    fairnessDemotion: { staleFields: [], asOfMs: 0 },
  };
}

const ctx: MemberContext = { memberId: 'm1' };

describe('compiled route precedence follows the authored dispatchOrder', () => {
  it('orders the compiled array by dispatchOrder, not by agent id', () => {
    // Agent ids sort z-agent AFTER a-agent; dispatchOrder says the opposite.
    const defs = [
      def('a-agent', [referralRoute('broad', 'referral', 50)]),
      def('z-agent', [referralRoute('specific', 'referral.stalled', 10)]),
    ];
    expect(projectRouting(defs, '1.0.0').routes.map((r) => r.id)).toEqual(['specific', 'broad']);
  });

  it('is independent of the order definitions were read from disk', () => {
    const a = def('a-agent', [referralRoute('broad', 'referral', 50)]);
    const z = def('z-agent', [referralRoute('specific', 'referral.stalled', 10)]);
    expect(projectRouting([a, z], '1.0.0')).toEqual(projectRouting([z, a], '1.0.0'));
  });

  it('does not emit dispatchOrder — the compiled shape is the loader contract', () => {
    const [route] = projectRouting(
      [def('a-agent', [referralRoute('broad', 'referral', 50)])],
      '1.0.0'
    ).routes;
    expect(route).toBeDefined();
    expect(Object.keys(route as object).sort()).toEqual(['agentId', 'id', 'match', 'taskKind']);
  });

  it('refuses a duplicate dispatchOrder rather than breaking the tie silently', () => {
    const defs = [
      def('a-agent', [referralRoute('broad', 'referral', 10)]),
      def('z-agent', [referralRoute('specific', 'referral.stalled', 10)]),
    ];
    expect(() => assertUniqueDispatchOrder(defs)).toThrowError(AdlError);
    expect(() => projectRouting(defs, '1.0.0')).toThrowError(/dispatchOrder 10 is already held by/);
  });
});

describe('precedence decides the winner when two routes genuinely overlap', () => {
  const broad = def('a-agent', [referralRoute('broad', 'referral', 50)]);
  const specific = def('z-agent', [referralRoute('specific', 'referral.stalled', 10)]);
  const signals = [sig('m1', 's1', 'referral.stalled')];

  function dispatchWith(defs: AgentDefinition[]): string | undefined {
    // Straight through the real chain: project -> parseAgentRouting -> routeBatch.
    const routing = parseAgentRouting(JSON.parse(JSON.stringify(projectRouting(defs, '1.0.0'))));
    // The disclosure gate is a REQUIRED dispatch input (routing a signal to an
    // agent IS a disclosure). This suite is about route PRECEDENCE, so the gate is
    // wired from the shipped taxonomy floor with a declared capability for each
    // synthetic agent — it decides, it does not wave anything through.
    const disclosure: DisclosureGateDeps = {
      classFloorFor: taxonomyClassFloor(),
      capabilities: new Map(
        defs.map((d) => [
          d.id,
          {
            agentId: d.id,
            purposeOfUse: 'care-coordination' as const,
            dataClasses: ['demographic', 'social-need'] as const,
          },
        ])
      ),
      basesFor: () => [],
      recipientFor: () => ({ orgId: 'org/wpco-care-team', kind: 'internal' }),
      ledger: createDisclosureLedger(),
      nowMs: 0,
    };
    return routeBatch({
      batch: batchFor(signals),
      memberContext: ctx,
      signals,
      routing,
      disclosure,
    })[0]?.agentId;
  }

  it('sends the signal to the route with the lower dispatchOrder', () => {
    expect(dispatchWith([broad, specific])).toBe('z-agent');
  });

  it('flipping the authored order flips the winner — proving order is load-bearing', () => {
    const broadFirst = def('a-agent', [referralRoute('broad', 'referral', 5)]);
    expect(dispatchWith([broadFirst, specific])).toBe('a-agent');
  });
});

describe('the shipped artifacts satisfy the real loaders', () => {
  it('loadAgentRouting parses the committed routing table', () => {
    const routing = loadAgentRouting();
    expect(routing.version).toBe('1.0.0');
    expect(routing.routes.length).toBeGreaterThan(0);
  });

  it('pins the shipped route precedence — a reorder is a reviewed diff, never incidental', () => {
    expect(loadAgentRouting().routes.map((r) => r.id)).toEqual([
      'member-outreach',
      'referral-coordination',
      'pa-appeal-documentation',
    ]);
  });
});
