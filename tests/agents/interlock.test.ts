/**
 * Twin-Ladder INTERLOCK — safety-critical governance (Wave-1).
 *
 * Proves: (1) permittedRung is the weakest link over the full autonomy × evidence
 * table; (2) an adverse action fails closed on ANY rung; (3) FIX-1 — a payer-facing
 * submission is human-gated regardless of rung, even A3/D3; (4) evidence caps a
 * strong autonomy tier; (5) degenerate/non-human deciders never resolve a gated
 * action. The interlock reuses decisionGate's qualified-human logic.
 */
import { describe, it, expect } from 'vitest';
import {
  AUTONOMY_RUNG,
  permittedRung,
  evaluateInterlock,
} from '../../src/lib/agents/governance/interlock';
import { TIER_RUNG_CEILING, RUNG_ORDER } from '../../src/lib/evidence/tierConfig';
import type { AutonomyTier } from '../../src/lib/agents/manifest/types';
import type { EvidenceTier, AuthorityRung } from '../../src/lib/evidence/tierConfig';
import type { ProposedAction, HumanDecision } from '../../src/lib/agentRuntime/types';

const TIERS: AutonomyTier[] = ['HITL', 'HOTL', 'autonomous'];
const EVID: EvidenceTier[] = ['D0', 'D1', 'D2', 'D3'];

const favorable: ProposedAction = { actionType: 'draft-recovery', priority: 'routine' };
const adverse: ProposedAction = { actionType: 'submit-recoupment', priority: 'urgent' };
const denial: ProposedAction = { actionType: 'coverage-denial', priority: 'urgent' };

const human: HumanDecision = { decision: 'approved', decidedBy: 'Practitioner/md-1', proposalId: 'p1', decidedAtMs: 1 };
const auto: HumanDecision = { decision: 'approved', decidedBy: 'autonomy:autonomous', proposalId: 'p1', decidedAtMs: 1 };
const sys: HumanDecision = { decision: 'approved', decidedBy: 'system', proposalId: 'p1', decidedAtMs: 1 };

function expectedMin(t: AutonomyTier, e: EvidenceTier): AuthorityRung {
  return RUNG_ORDER[AUTONOMY_RUNG[t]] <= RUNG_ORDER[TIER_RUNG_CEILING[e]]
    ? AUTONOMY_RUNG[t]
    : TIER_RUNG_CEILING[e];
}

describe('AUTONOMY_RUNG', () => {
  it('maps the three tiers to A1/A2/A3 and is frozen', () => {
    expect(AUTONOMY_RUNG).toEqual({ HITL: 'A1', HOTL: 'A2', autonomous: 'A3' });
    expect(Object.isFrozen(AUTONOMY_RUNG)).toBe(true);
  });
});

describe('permittedRung = min-by-ordinal over the full 3×4 table', () => {
  for (const t of TIERS) {
    for (const e of EVID) {
      it(`${t} × ${e} -> ${expectedMin(t, e)}`, () => {
        expect(permittedRung(t, e)).toBe(expectedMin(t, e));
      });
    }
  }

  it('a couple of anchor cases spelled out', () => {
    expect(permittedRung('autonomous', 'D3')).toBe('A3'); // both strong
    expect(permittedRung('autonomous', 'D1')).toBe('A1'); // evidence caps
    expect(permittedRung('HITL', 'D3')).toBe('A1'); // tier caps
    expect(permittedRung('HOTL', 'D0')).toBe('A0'); // evidence floor
  });
});

describe('GUARDS FAIL CLOSED: adverse action is human-gated on ANY rung', () => {
  it('an adverse (recoup) action at autonomous + D3 still requires a human and is NOT resolved without one', () => {
    const r = evaluateInterlock({ manifestTier: 'autonomous', evidenceTier: 'D3', action: adverse });
    expect(r.permittedRung).toBe('A3');
    expect(r.requiresHuman).toBe(true);
    expect(r.resolved).toBe(false);
  });

  it('an adverse (deny) action at autonomous + D3 does not auto-resolve, even with an autonomy decider', () => {
    const r = evaluateInterlock({ manifestTier: 'autonomous', evidenceTier: 'D3', action: denial, humanDecision: auto });
    expect(r.requiresHuman).toBe(true);
    expect(r.resolved).toBe(false);
  });

  it('the same adverse action DOES resolve with a qualified human', () => {
    const r = evaluateInterlock({ manifestTier: 'autonomous', evidenceTier: 'D3', action: denial, humanDecision: human });
    expect(r.requiresHuman).toBe(true);
    expect(r.resolved).toBe(true);
  });
});

describe('FIX-1: payer-facing submission is human-gated regardless of rung', () => {
  it('isSubmission=true on a FAVORABLE action at autonomous + D3 still requires a human and is not auto-resolved', () => {
    const r = evaluateInterlock({ manifestTier: 'autonomous', evidenceTier: 'D3', action: favorable, isSubmission: true });
    expect(r.permittedRung).toBe('A3');
    expect(r.requiresHuman).toBe(true);
    expect(r.resolved).toBe(false);
  });

  it('an autonomy decider cannot resolve a submission even at A3/D3', () => {
    const r = evaluateInterlock({ manifestTier: 'autonomous', evidenceTier: 'D3', action: favorable, isSubmission: true, humanDecision: auto });
    expect(r.resolved).toBe(false);
  });

  it('a submission resolves only with a qualified human', () => {
    const r = evaluateInterlock({ manifestTier: 'autonomous', evidenceTier: 'D3', action: favorable, isSubmission: true, humanDecision: human });
    expect(r.resolved).toBe(true);
  });

  it('a favorable NON-submission draft at A2 (HOTL + D2) auto-resolves without a human', () => {
    const r = evaluateInterlock({ manifestTier: 'HOTL', evidenceTier: 'D2', action: favorable });
    expect(r.permittedRung).toBe('A2');
    expect(r.requiresHuman).toBe(false);
    expect(r.resolved).toBe(true);
  });

  it('a favorable NON-submission draft at A3 (autonomous + D3) auto-resolves', () => {
    const r = evaluateInterlock({ manifestTier: 'autonomous', evidenceTier: 'D3', action: favorable });
    expect(r.requiresHuman).toBe(false);
    expect(r.resolved).toBe(true);
  });
});

describe('cappedByEvidence', () => {
  it('D1 evidence caps an autonomous (A3) agent to A1', () => {
    const r = evaluateInterlock({ manifestTier: 'autonomous', evidenceTier: 'D1', action: favorable });
    expect(r.permittedRung).toBe('A1');
    expect(r.cappedByEvidence).toBe(true);
    // A1 is a low rung -> a human is required to act
    expect(r.requiresHuman).toBe(true);
    expect(r.resolved).toBe(false);
  });

  it('is false when the manifest tier is the binding constraint (HITL + D3)', () => {
    const r = evaluateInterlock({ manifestTier: 'HITL', evidenceTier: 'D3', action: favorable });
    expect(r.permittedRung).toBe('A1');
    expect(r.cappedByEvidence).toBe(false); // tier, not evidence, is the cap
  });

  it('is false when both ladders agree (autonomous + D3)', () => {
    const r = evaluateInterlock({ manifestTier: 'autonomous', evidenceTier: 'D3', action: favorable });
    expect(r.cappedByEvidence).toBe(false);
  });
});

describe('low rung (A0/A1) always needs a human even for a favorable non-submission action', () => {
  it('A0 (any tier + D0) requires a human', () => {
    const r = evaluateInterlock({ manifestTier: 'autonomous', evidenceTier: 'D0', action: favorable });
    expect(r.permittedRung).toBe('A0');
    expect(r.requiresHuman).toBe(true);
    expect(r.resolved).toBe(false);
  });

  it('HITL (A1) requires a human and resolves with one', () => {
    const pending = evaluateInterlock({ manifestTier: 'HITL', evidenceTier: 'D2', action: favorable });
    expect(pending.permittedRung).toBe('A1');
    expect(pending.requiresHuman).toBe(true);
    expect(pending.resolved).toBe(false);
    const done = evaluateInterlock({ manifestTier: 'HITL', evidenceTier: 'D2', action: favorable, humanDecision: human });
    expect(done.resolved).toBe(true);
  });
});

describe('degenerate deciders never resolve a human-gated action', () => {
  it('empty/undefined humanDecision -> not resolved', () => {
    expect(evaluateInterlock({ manifestTier: 'autonomous', evidenceTier: 'D3', action: adverse }).resolved).toBe(false);
    expect(evaluateInterlock({ manifestTier: 'autonomous', evidenceTier: 'D3', action: adverse, humanDecision: null }).resolved).toBe(false);
  });

  it('an autonomy: actor is not a qualified human', () => {
    expect(evaluateInterlock({ manifestTier: 'autonomous', evidenceTier: 'D3', action: adverse, humanDecision: auto }).resolved).toBe(false);
  });

  it('a system actor is not a qualified human', () => {
    expect(evaluateInterlock({ manifestTier: 'autonomous', evidenceTier: 'D3', action: adverse, humanDecision: sys }).resolved).toBe(false);
  });

  it('an empty decidedBy is not a qualified human', () => {
    const blank: HumanDecision = { ...human, decidedBy: '' };
    expect(evaluateInterlock({ manifestTier: 'HITL', evidenceTier: 'D2', action: favorable, humanDecision: blank }).resolved).toBe(false);
  });
});

describe('reason strings are PHI-safe and describe the outcome', () => {
  it('blocked reason names the drivers without member payload', () => {
    const r = evaluateInterlock({ manifestTier: 'autonomous', evidenceTier: 'D3', action: adverse });
    expect(r.reason).toMatch(/BLOCKED/);
    expect(r.reason).toMatch(/adverse coverage action/);
  });

  it('auto-resolved reason names the rung', () => {
    const r = evaluateInterlock({ manifestTier: 'autonomous', evidenceTier: 'D3', action: favorable });
    expect(r.reason).toMatch(/auto-resolved at permitted rung A3/);
  });
});
