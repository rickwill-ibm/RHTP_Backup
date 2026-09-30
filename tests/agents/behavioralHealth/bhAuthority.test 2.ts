/**
 * THE BEHAVIORAL HEALTH AGENT'S AUTHORITY, AS CONSTRAINTS RATHER THAN PROSE.
 *
 * The governing principle here is counter-intuitive and load-bearing: **as
 * acuity rises, this agent's authority must NARROW, not widen.** Most designs
 * do the opposite — "high risk, so escalate the agent's powers". New York
 * reserves the determination that makes acuity matter to named humans: NY MHL
 * §9.46 requires a mental health professional's reasonable professional
 * judgement (and reaches DCJS and firearm licensure under Penal Law §400.00),
 * and MHL §33.13(c)(6) reserves the serious-and-imminent-danger determination
 * to a treating psychiatrist or psychologist. An agent cannot hold either.
 *
 * So the agent proposes and escalates. It never contacts a member, never writes
 * a clinical record, and never determines risk. These tests make that checkable.
 */
import { describe, expect, it } from 'vitest';
import { defaultRegistry, shippedAuthorityLock } from '@/lib/agents/manifest';
import { getEscalationTier, loadEscalationPolicies } from '@/lib/agentRuntime';
import { agentCapabilities } from '@/lib/agents/manifest';

const BH = 'bh-screening-triage-agent';

/**
 * Any tool that could put words in front of a member or a third party. Outreach
 * on a behavioural-health screen IS a disclosure: a letter or a voicemail on a
 * shared line discloses a mental-health fact to whoever opens or answers it —
 * a foreseeable intimate-partner-violence scenario in a perinatal population.
 */
const EGRESS_TOOLS = [
  'comms-channel.send',
  'sms.send',
  'email.send',
  'voice.dial',
  'portal.message',
  'mail.generate',
  'referral.open',
  'claim.submit-appeal',
];

describe('the BH agent exists and is governed', () => {
  it('is in the shipped manifest with a capped authority lock entry', () => {
    expect(defaultRegistry().ids()).toContain(BH);
    expect(shippedAuthorityLock().entries.map((e) => e.agentId)).toContain(BH);
  });

  it('declares mental-health, and it is reachable through the producer', () => {
    const cap = agentCapabilities().get(BH);
    expect(cap?.dataClasses).toEqual(['mental-health']);
    expect(cap?.purposeOfUse).toBe('care-coordination');
  });
});

describe('the regimes it may NOT reach', () => {
  it('does not declare substance-use-disorder — a different statute, a different instrument', () => {
    // 42 CFR Part 2 §2.31 consent and an MHL §33.13 disclosure are not
    // interchangeable, and one agent ships one obligation set. An agent holding
    // both is a hazard, not a convenience.
    expect(agentCapabilities().get(BH)?.dataClasses).not.toContain('substance-use-disorder');
  });

  it('does not declare hiv — PHL Art 27-F is an enumerated disclosure list', () => {
    // An automated agent is not on that list. Clinical co-occurrence of BH and
    // HIV argues for a care TEAM holding both, never an agent identity.
    expect(agentCapabilities().get(BH)?.dataClasses).not.toContain('hiv');
  });

  it('the LOCK grants no class beyond mental-health, so widening needs a reviewed diff', () => {
    const entry = shippedAuthorityLock().entries.find((e) => e.agentId === BH);
    expect(entry?.dataClasses).toEqual(['mental-health']);
  });
});

describe('it holds no tool that could reach a member', () => {
  it('the manifest allowlist contains no egress tool', () => {
    const tools = defaultRegistry().get(BH).toolAllowlist;
    for (const t of EGRESS_TOOLS) expect(tools).not.toContain(t);
  });

  it('the LOCK permits none either — so it cannot acquire one by declaring it', () => {
    const entry = shippedAuthorityLock().entries.find((e) => e.agentId === BH);
    for (const t of EGRESS_TOOLS) expect(entry?.tools).not.toContain(t);
  });

  it('holds only read, queue-submit and report', () => {
    expect([...defaultRegistry().get(BH).toolAllowlist].sort()).toEqual([
      'person-context.read',
      'signal.report',
      'work-queue.submit',
    ]);
  });

  it('is HITL and references-only — it proposes, it does not act', () => {
    const m = defaultRegistry().get(BH);
    expect(m.autonomyTier).toBe('HITL');
    expect(m.phiPosture).toBe('references-only');
  });
});

describe('its escalation policy reference RESOLVES, and the BH-specific policy is absent', () => {
  /**
   * WHAT THIS BLOCK USED TO ASSERT, AND WHY THAT WAS THE BUG. It asserted
   * `escalationPolicyRef === 'bh-acute'` in the manifest and in the lock — the
   * SPELLING of the reference, twice, and never that it resolved to anything.
   * `escalation-policies.json` defined only `default`, so both assertions were green
   * while `getEscalationTier` would have thrown `EscalationPolicyError` inside
   * `AgentEngine.propose()` the first time this agent tried to put anything in front of
   * a human. A test that pins a reference's spelling and not its target is the
   * cross-file blind spot `check-ref-resolution.mjs` now gates, with a green tick on it.
   *
   * A `bh-acute` set WAS then authored, and withdrawn on adversarial review: its urgent
   * tier was byte-identical to the general-purpose default, its first hop escalated to
   * the assignee the item had already been waiting on, its derived park was T+16h, and
   * its terminal was a management supervisor where an unanswered acute behavioural-health
   * item needs a lateral crisis pathway. `onExhaust` accepts only `'park'`, so
   * escalation-as-data cannot express a crisis handoff at all.
   *
   * So this block now asserts the two things that are TRUE and the one that is MISSING,
   * rather than a spelling that was neither.
   */
  it('EVERY agent reference resolves to a defined policy set — the property the old test skipped', () => {
    const defined = new Set(Object.keys(loadEscalationPolicies().policies));
    for (const m of defaultRegistry().list()) {
      expect(defined.has(m.escalationPolicyRef)).toBe(true);
    }
  });

  it('and the tier is actually LOADABLE for every priority, not merely named', () => {
    // `getEscalationTier` throws on a missing set OR a missing tier. Resolving the name
    // is not the same as resolving the tier the runtime will ask for.
    const policies = loadEscalationPolicies();
    for (const priority of ['urgent', 'high', 'routine'] as const) {
      expect(() =>
        getEscalationTier(policies, defaultRegistry().get(BH).escalationPolicyRef, priority)
      ).not.toThrow();
    }
  });

  it('the lock pins the SAME reference the manifest carries, so it cannot be swapped silently', () => {
    const entry = shippedAuthorityLock().entries.find((e) => e.agentId === BH);
    expect(entry?.escalationPolicyRef).toBe(defaultRegistry().get(BH).escalationPolicyRef);
  });

  it('is PROVISIONALLY on the shared default, which is a known gap and not the target state', () => {
    // The clinical premise of the withdrawn test was right and is kept: one `default`
    // policy cannot be both a cost-optimisation path and a path where an acute
    // behavioural-health item goes unacknowledged over a weekend. Under `default`,
    // routine parks at T+72h with a one-level hierarchy. This assertion is a MARKER: it
    // fails the moment a BH-specific policy is authored, which is the point at which the
    // W1 requirements — a first hop above the assignee, a licensure-asserting care-team
    // vocabulary, and an `onExhaust: 'handoff'` crisis terminal — must be met.
    expect(defaultRegistry().get(BH).escalationPolicyRef).toBe('default');
  });
});

describe('the appeals agent kept its identity and lost the wrong name', () => {
  it('bh-screening-triage-agent is a NEW id, not a repurposed one', () => {
    // Repurposing `agent-appeals` would leave every existing ledger row,
    // escalation record and audit entry filed under an id that now means
    // something else — which is how a privacy officer fails to find a
    // disclosure during a breach review.
    expect(BH).not.toBe('agent-appeals');
    expect(defaultRegistry().ids()).not.toContain('agent-appeals');
  });
});
