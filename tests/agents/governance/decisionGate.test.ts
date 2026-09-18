/**
 * HW-AI / I16 — tier-independent human-decision invariant (C-DEC).
 * Proves an adverse coverage action can never auto-resolve, on ANY tier, and that
 * decision provenance is complete for adverse determinations.
 */
import { describe, it, expect } from 'vitest';
import {
  isAdverseCoverageAction,
  isSubmissionActionType,
  isQualifiedHumanDecision,
  evaluateDecision,
  isAutoApprovable,
  buildDecisionProvenance,
  isAdverseProvenanceComplete,
} from '../../../src/lib/agents/governance';
import type { ProposedAction, HumanDecision } from '../../../src/lib/agentRuntime/types';

const denial: ProposedAction = {
  actionType: 'pa-denial',
  priority: 'urgent',
  refs: { claim: 'Claim/1' },
};
const approval: ProposedAction = { actionType: 'submit-pa-approval', priority: 'routine' };
const outreach: ProposedAction = { actionType: 'send-outreach', priority: 'routine' };

const human: HumanDecision = {
  decision: 'rejected',
  decidedBy: 'Practitioner/md-1',
  proposalId: 'p1',
  decidedAtMs: 1,
};
const auto: HumanDecision = {
  decision: 'approved',
  decidedBy: 'autonomy:HOTL',
  proposalId: 'p1',
  decidedAtMs: 1,
};

describe('adverse-action classification', () => {
  it('flags denials/terminations/reductions, not favorable/neutral actions', () => {
    expect(isAdverseCoverageAction(denial)).toBe(true);
    expect(isAdverseCoverageAction({ actionType: 'coverage-termination' })).toBe(true);
    expect(isAdverseCoverageAction({ actionType: 'benefit-reduction' })).toBe(true);
    expect(isAdverseCoverageAction(approval)).toBe(false);
    expect(isAdverseCoverageAction(outreach)).toBe(false);
  });
});

describe('tier-independent invariant', () => {
  it('an adverse action is NEVER auto-approvable, on any tier', () => {
    for (const tier of ['HITL', 'HOTL', 'autonomous'] as const) {
      expect(isAutoApprovable(denial, tier)).toBe(false);
    }
  });

  it('a favorable action follows the tier', () => {
    expect(isAutoApprovable(approval, 'autonomous')).toBe(true);
    expect(isAutoApprovable(approval, 'HOTL')).toBe(true);
    expect(isAutoApprovable(approval, 'HITL')).toBe(false);
  });

  it('MED-3: a payer-facing submission is NEVER auto-approvable, on any tier', () => {
    // A `draft-appeal` carries no adverse token, so only `isSubmission` gates it.
    const submission: ProposedAction = {
      actionType: 'draft-appeal',
      priority: 'routine',
      isSubmission: true,
    };
    for (const tier of ['HITL', 'HOTL', 'autonomous'] as const) {
      expect(isAutoApprovable(submission, tier)).toBe(false);
    }
    // The SAME action WITHOUT the submission flag follows the tier — proves the
    // block is the flag, and that existing (unflagged) actions are unchanged.
    const draftNoFlag: ProposedAction = { actionType: 'draft-appeal', priority: 'routine' };
    expect(isAutoApprovable(draftNoFlag, 'autonomous')).toBe(true);
    expect(isAutoApprovable(draftNoFlag, 'HOTL')).toBe(true);
    expect(isAutoApprovable(draftNoFlag, 'HITL')).toBe(false);
  });

  it('C4: a SUBMISSION-class actionType with the isSubmission flag OMITTED still cannot auto-approve', () => {
    // The fix: submission-class is derived from the single `isSubmissionActionType` predicate
    // keyed on actionType; the boolean is only a cache of it. A future submission-class type
    // (a payer-facing X12 / appeal) whose ProposedAction is built WITHOUT the flag must still
    // be human-gated — otherwise a HOTL/autonomous manifest would auto-send it with no human.
    expect(isSubmissionActionType('appeal')).toBe(true);
    for (const actionType of ['appeal', 'x12-276', 'x12-278', 'x12-275', 'x12-837-corrected']) {
      const noFlag: ProposedAction = { actionType, priority: 'routine' }; // isSubmission omitted
      for (const tier of ['HITL', 'HOTL', 'autonomous'] as const) {
        expect(isAutoApprovable(noFlag, tier)).toBe(false);
      }
    }
    // A non-submission internal action with the flag omitted still follows the tier.
    const internal: ProposedAction = { actionType: 'ticket-update', priority: 'routine' };
    expect(isSubmissionActionType('ticket-update')).toBe(false);
    expect(isAutoApprovable(internal, 'HOTL')).toBe(true);
  });

  it('evaluateDecision blocks an adverse action without a qualified human even under autonomous', () => {
    expect(
      evaluateDecision({ action: denial, autonomyTier: 'autonomous', humanDecision: auto }).resolved
    ).toBe(false);
    expect(
      evaluateDecision({ action: denial, autonomyTier: 'autonomous', humanDecision: null }).resolved
    ).toBe(false);
    // resolves only with a qualified human
    const ok = evaluateDecision({ action: denial, autonomyTier: 'HITL', humanDecision: human });
    expect(ok.resolved).toBe(true);
    expect(ok.requiresHuman).toBe(true);
  });

  it('an auto/system decider is not a qualified human', () => {
    expect(isQualifiedHumanDecision(auto)).toBe(false);
    expect(isQualifiedHumanDecision(human)).toBe(true);
    expect(isQualifiedHumanDecision({ ...human, decidedBy: 'system' })).toBe(false);
    expect(isQualifiedHumanDecision({ ...human, decidedBy: '' })).toBe(false);
  });

  it('a NON-adverse action follows the tier via evaluateDecision', () => {
    // autonomous + HOTL auto-resolve a favorable action (exercises the auto-resolve branch)
    const autoApproval = {
      decision: 'approved' as const,
      decidedBy: 'autonomy:autonomous',
      proposalId: 'p2',
      decidedAtMs: 1,
    };
    const a = evaluateDecision({
      action: approval,
      autonomyTier: 'autonomous',
      humanDecision: autoApproval,
    });
    expect(a.resolved).toBe(true);
    expect(a.requiresHuman).toBe(false);
    expect(
      evaluateDecision({ action: outreach, autonomyTier: 'HOTL', humanDecision: null }).resolved
    ).toBe(true);
    // HITL needs a qualified human even for a favorable action
    const hitlPending = evaluateDecision({
      action: approval,
      autonomyTier: 'HITL',
      humanDecision: null,
    });
    expect(hitlPending.resolved).toBe(false);
    expect(hitlPending.requiresHuman).toBe(false); // non-adverse: tier-required, not invariant-required
    const hitlDone = evaluateDecision({
      action: approval,
      autonomyTier: 'HITL',
      humanDecision: { ...human, decision: 'approved' },
    });
    expect(hitlDone.resolved).toBe(true);
    expect(hitlDone.requiresHuman).toBe(false);
  });
});

describe('decision provenance', () => {
  it('an adverse determination is incomplete without a member-facing reason + appeal ref', () => {
    const base = buildDecisionProvenance({
      action: denial,
      humanDecision: human,
      requiresHuman: true,
      firedRule: 'coverage.pa.medical-necessity',
      ruleVersion: '3.2',
      memberFacingReason: 'Service did not meet medical-necessity criteria X.',
      appealRef: 'Appeal/APP-1',
    });
    expect(isAdverseProvenanceComplete(base)).toBe(true);
    expect(isAdverseProvenanceComplete({ ...base, appealRef: undefined })).toBe(false);
    expect(isAdverseProvenanceComplete({ ...base, memberFacingReason: '' })).toBe(false);
    // a favorable decision needs neither
    expect(
      isAdverseProvenanceComplete({ ...base, decision: 'approved', appealRef: undefined })
    ).toBe(true);
  });
});
